import { addDays } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  BUYBACK_FINAL_PAYMENT_AMOUNT,
  BUYBACK_PAYMENT_AMOUNT,
  BUYBACK_PAYMENT_COUNT,
  BUYBACK_TOTAL,
} from '@sevendays/domain';

/**
 * Batch Steps 17-19 (05_SETTLEMENT_ENGINE.md, Decisions 014/022/042):
 *   17. Increment current_day for survivors — the ONLY way current_day
 *       ever increases. Idempotent: increments once per race via the
 *       snapshot day guard.
 *   18. Day7 Clear: survivors reaching day 7 exit P2P forever.
 *   19. Buyback Schedules: 200 USDT over 7 daily payments, due D+1..D+7.
 */

export interface Day7Result {
  survivorsAdvanced: number;
  day7ClearedHorseIds: string[];
  schedulesCreated: number;
}

export async function processSurvivorsAndDay7(
  client: SqlClient,
  input: { raceId: string; batchDate: string },
): Promise<Day7Result> {
  // Step 17: survivors advance exactly one day. The guard
  // `h.current_day = s.current_day` makes re-runs no-ops.
  const advanced = await client.query(
    `update horses h
     set current_day = s.current_day + 1
     from race_participant_snapshots s
     join race_results r on r.race_id = s.race_id and r.horse_id = s.horse_id
     where s.race_id = $1
       and h.id = s.horse_id
       and r.is_burned = false
       and h.status = 'ACTIVE'
       and h.current_day = s.current_day`,
    [input.raceId],
  );

  // Step 18: Day7 Clear — exits P2P circulation permanently.
  const cleared = await client.query<{ id: string; owner_user_id: string }>(
    `update horses
     set status = 'DAY7_CLEARED'
     where status = 'ACTIVE' and current_day = 7
       and id in (select horse_id from race_participant_snapshots where race_id = $1)
     returning id, owner_user_id`,
    [input.raceId],
  );

  // Step 19: one schedule per horse; payments 1..7 due D+1..D+7 (daily).
  let schedulesCreated = 0;
  for (const horse of cleared.rows) {
    const schedule = await client.query<{ id: string }>(
      `insert into buyback_schedules (horse_id, user_id, total_amount, payment_count, day7_clear_date)
       values ($1, $2, $3, $4, $5)
       on conflict (horse_id) do nothing
       returning id`,
      [horse.id, horse.owner_user_id, BUYBACK_TOTAL, BUYBACK_PAYMENT_COUNT, input.batchDate],
    );
    const scheduleRow = schedule.rows[0];
    if (!scheduleRow) continue; // already scheduled (retry)
    schedulesCreated += 1;

    for (let n = 1; n <= BUYBACK_PAYMENT_COUNT; n += 1) {
      const amount = n < BUYBACK_PAYMENT_COUNT ? BUYBACK_PAYMENT_AMOUNT : BUYBACK_FINAL_PAYMENT_AMOUNT;
      await client.query(
        `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
         values ($1, $2, $3, $4)
         on conflict (buyback_schedule_id, payment_number) do nothing`,
        [scheduleRow.id, n, addDays(input.batchDate, n), amount],
      );
    }
  }

  return {
    survivorsAdvanced: advanced.affectedRows ?? 0,
    day7ClearedHorseIds: cleared.rows.map((r) => r.id),
    schedulesCreated,
  };
}
