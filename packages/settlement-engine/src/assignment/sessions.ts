import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { MAX_CONCURRENT_PURCHASE_SESSIONS, PURCHASE_LOCK_AMOUNT } from '@sevendays/domain';
import { LedgerError, postTransaction, purchaseRefund, ensureUserAccounts } from '@sevendays/ledger';
import { getMarketplaceState } from '../batch/marketplace.js';

/**
 * Purchase Sessions (05_SETTLEMENT_ENGINE.md, Decisions 010/043/051).
 * - immediate fund locking: lock = Day6 price 177.16 USDT
 * - cancellable only before batch lock
 * - max 10 concurrent sessions per user
 * - unassigned sessions are refunded and EXPIRED at batch completion
 */

export type AssignmentErrorCode =
  | 'MARKETPLACE_LOCKED'
  | 'PURCHASE_SESSION_LIMIT'
  | 'PURCHASE_NOT_CANCELLABLE'
  | 'PURCHASE_NOT_FOUND';

export class AssignmentError extends Error {
  constructor(
    readonly code: AssignmentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssignmentError';
  }
}

export interface CreateSessionResult {
  sessionId: string;
  alreadyExists: boolean;
}

export async function createPurchaseSession(
  client: SqlClient,
  input: { userId: string; idempotencyKey: string },
): Promise<CreateSessionResult> {
  // Idempotent replay: same key returns the original session.
  const existing = await client.query<{ id: string }>(
    `select id from purchase_sessions where idempotency_key = $1`,
    [input.idempotencyKey],
  );
  if (existing.rows[0]) return { sessionId: existing.rows[0].id, alreadyExists: true };

  const lockAmount = Money.of(PURCHASE_LOCK_AMOUNT);
  const accounts = await ensureUserAccounts(client, input.userId);

  await client.query('begin');
  try {
    // Serialize per-user session creation so the concurrent-session cap
    // cannot be raced (transaction-scoped advisory lock).
    await client.query(`select pg_advisory_xact_lock(hashtext('user_sessions:' || $1))`, [
      input.userId,
    ]);

    if ((await getMarketplaceState(client)) !== 'OPEN') {
      throw new AssignmentError('MARKETPLACE_LOCKED', 'Marketplace is not OPEN');
    }

    const pending = await client.query<{ count: string }>(
      `select count(*)::text as count from purchase_sessions
       where user_id = $1 and status = 'PENDING_ASSIGNMENT'`,
      [input.userId],
    );
    if (Number(pending.rows[0]!.count) >= MAX_CONCURRENT_PURCHASE_SESSIONS) {
      throw new AssignmentError(
        'PURCHASE_SESSION_LIMIT',
        `Maximum ${MAX_CONCURRENT_PURCHASE_SESSIONS} concurrent purchase sessions`,
      );
    }

    const session = await client.query<{ id: string }>(
      `insert into purchase_sessions (user_id, locked_amount, funds_locked, idempotency_key)
       values ($1, $2, true, $3) returning id`,
      [input.userId, lockAmount.toFixed8(), input.idempotencyKey],
    );
    const sessionId = session.rows[0]!.id;

    // Immediate fund locking through the ledger (Ledger First).
    await postTransaction(
      client,
      {
        type: 'PURCHASE_FUND_LOCK',
        idempotencyKey: `pslock:${input.idempotencyKey}`,
        referenceType: 'purchase_session',
        referenceId: sessionId,
        entries: [
          { accountId: accounts.available, direction: 'DEBIT', amount: lockAmount },
          { accountId: accounts.locked, direction: 'CREDIT', amount: lockAmount },
        ],
      },
      { manageTransaction: false },
    );

    await client.query('commit');
    return { sessionId, alreadyExists: false };
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    // The non-negative balance check is a DEFERRED trigger — with an
    // externally-managed transaction it fires at COMMIT, outside
    // postTransaction's own mapping. Map it here.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('NEGATIVE_BALANCE_FORBIDDEN')) {
      throw new LedgerError('INSUFFICIENT_BALANCE', `Insufficient balance to lock ${PURCHASE_LOCK_AMOUNT} USDT`);
    }
    throw error;
  }
}

export async function cancelPurchaseSession(
  client: SqlClient,
  input: { sessionId: string; userId: string },
): Promise<void> {
  const session = await client.query<{ status: string; batch_run_id: string | null; locked_amount: string }>(
    `select status::text as status, batch_run_id, locked_amount::text as locked_amount
     from purchase_sessions where id = $1 and user_id = $2`,
    [input.sessionId, input.userId],
  );
  const row = session.rows[0];
  if (!row) throw new AssignmentError('PURCHASE_NOT_FOUND', `Session ${input.sessionId} not found`);
  if (row.status === 'CANCELLED') return; // idempotent
  // Cancellable only before batch lock (05_SETTLEMENT_ENGINE.md).
  if (row.status !== 'PENDING_ASSIGNMENT' || row.batch_run_id !== null) {
    throw new AssignmentError(
      'PURCHASE_NOT_CANCELLABLE',
      `Session ${input.sessionId} is locked into a batch or already settled`,
    );
  }

  await purchaseRefund(client, {
    userId: input.userId,
    amount: Money.of(row.locked_amount),
    idempotencyKey: `pscancel:${input.sessionId}`,
    referenceType: 'purchase_session',
    referenceId: input.sessionId,
  });
  await client.query(
    `update purchase_sessions
     set status = 'CANCELLED', cancelled_at = now(), refund_amount = locked_amount, funds_locked = false
     where id = $1 and status = 'PENDING_ASSIGNMENT'`,
    [input.sessionId],
  );
}

/** Batch Step 4 — lock eligible sessions into the batch. */
export async function lockSessionsIntoBatch(
  client: SqlClient,
  batchRunId: string,
): Promise<number> {
  const r = await client.query(
    `update purchase_sessions set batch_run_id = $1
     where status = 'PENDING_ASSIGNMENT' and batch_run_id is null and funds_locked = true`,
    [batchRunId],
  );
  return r.affectedRows ?? 0;
}

/** Batch Step 27 — refund every still-unassigned session and mark EXPIRED (Decision 043). */
export async function refundUnassignedSessions(
  client: SqlClient,
  batchRunId: string,
): Promise<number> {
  const sessions = await client.query<{ id: string; user_id: string; locked_amount: string }>(
    `select id, user_id, locked_amount::text as locked_amount
     from purchase_sessions
     where batch_run_id = $1 and status = 'PENDING_ASSIGNMENT'
     order by id`,
    [batchRunId],
  );
  let refunded = 0;
  for (const session of sessions.rows) {
    await purchaseRefund(client, {
      userId: session.user_id,
      amount: Money.of(session.locked_amount),
      idempotencyKey: `psexpire:${session.id}`,
      referenceType: 'purchase_session',
      referenceId: session.id,
    });
    await client.query(
      `update purchase_sessions
       set status = 'EXPIRED', refund_amount = locked_amount, funds_locked = false, settled_at = now()
       where id = $1 and status = 'PENDING_ASSIGNMENT'`,
      [session.id],
    );
    refunded += 1;
  }
  return refunded;
}
