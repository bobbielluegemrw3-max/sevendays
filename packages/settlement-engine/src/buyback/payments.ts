import { Money, insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { renderNotification } from '@sevendays/domain';
import { buybackPayment } from '@sevendays/ledger';

/**
 * Batch Step 20 — Process due Buyback Payments.
 * All payments flow PLATFORM_BUYBACK_RESERVE -> USER_AVAILABLE through the
 * ledger with stable idempotency keys; PAID is final (DB-guarded).
 * Schedules created in the current batch have payment 1 due at D+1, so
 * they are naturally not paid until the next batch date.
 */

export interface PaymentRunResult {
  paymentsMade: number;
  schedulesCompleted: number;
}

export async function processDueBuybackPayments(
  client: SqlClient,
  input: { batchDate: string },
): Promise<PaymentRunResult> {
  const due = await client.query<{
    id: string;
    buyback_schedule_id: string;
    payment_number: number;
    amount: string;
    user_id: string;
  }>(
    `select p.id, p.buyback_schedule_id, p.payment_number, p.amount::text as amount, s.user_id
     from buyback_schedule_payments p
     join buyback_schedules s on s.id = p.buyback_schedule_id
     where p.status = 'SCHEDULED' and p.due_date <= $1
     order by p.due_date, p.payment_number, p.id`,
    [input.batchDate],
  );

  let paymentsMade = 0;
  for (const payment of due.rows) {
    const posted = await buybackPayment(client, {
      userId: payment.user_id,
      amount: Money.of(payment.amount),
      idempotencyKey: `buyback:${payment.buyback_schedule_id}:${payment.payment_number}`,
      referenceType: 'buyback_schedule_payment',
      referenceId: payment.id,
    });
    // Notify BEFORE the PAID marker: a crash re-selects the row and the
    // dedupe key absorbs the replay (Decision 065).
    const rendered = renderNotification('BUYBACK_PAYMENT_PAID', { amount: payment.amount });
    await insertNotification(client, {
      userId: payment.user_id,
      type: 'BUYBACK_PAYMENT_PAID',
      dedupeKey: `notif:BUYBACK_PAYMENT_PAID:${payment.buyback_schedule_id}:${payment.payment_number}`,
      payload: { ...rendered, buyback_schedule_id: payment.buyback_schedule_id, payment_number: payment.payment_number },
    });
    await client.query(
      `update buyback_schedule_payments
       set status = 'PAID', ledger_transaction_id = $2, paid_at = now()
       where id = $1 and status = 'SCHEDULED'`,
      [payment.id, posted.transactionId],
    );
    if (!posted.alreadyPosted) paymentsMade += 1;
  }

  // Complete schedules whose 7 payments are all PAID — notify first so a
  // crash between notify and update converges on the next run.
  const toComplete = await client.query<{ id: string; user_id: string }>(
    `select s.id, s.user_id from buyback_schedules s
     where s.status <> 'COMPLETED'
       and (select count(*) from buyback_schedule_payments p
            where p.buyback_schedule_id = s.id and p.status = 'PAID') = 7`,
  );
  for (const schedule of toComplete.rows) {
    const rendered = renderNotification('BUYBACK_COMPLETED');
    await insertNotification(client, {
      userId: schedule.user_id,
      type: 'BUYBACK_COMPLETED',
      dedupeKey: `notif:BUYBACK_COMPLETED:${schedule.id}`,
      payload: { ...rendered, buyback_schedule_id: schedule.id },
    });
  }
  const completed = await client.query(
    `update buyback_schedules s
     set status = 'COMPLETED', completed_at = now()
     where s.status <> 'COMPLETED'
       and (select count(*) from buyback_schedule_payments p
            where p.buyback_schedule_id = s.id and p.status = 'PAID') = 7`,
  );

  return { paymentsMade, schedulesCompleted: completed.affectedRows ?? 0 };
}
