import { Money } from '@sevendays/shared';
import {
  LedgerError,
  type PostTransactionInput,
  type PostedTransaction,
  type SqlClient,
} from './types.js';

/** App-level validation before touching the database (fast fail). */
export function validateEntries(input: PostTransactionInput): void {
  if (input.entries.length < 2) {
    throw new LedgerError(
      'LEDGER_UNBALANCED',
      `Transaction requires at least 2 entries, got ${input.entries.length}`,
    );
  }
  let debit = Money.zero();
  let credit = Money.zero();
  for (const entry of input.entries) {
    if (!entry.amount.gt('0')) {
      throw new LedgerError('INVALID_ENTRY', `Entry amount must be positive: ${entry.amount.toString()}`);
    }
    if (entry.direction === 'DEBIT') debit = debit.add(entry.amount);
    else credit = credit.add(entry.amount);
  }
  if (!debit.eq(credit)) {
    throw new LedgerError(
      'LEDGER_UNBALANCED',
      `Debit total ${debit.toFixed8()} != credit total ${credit.toFixed8()}`,
    );
  }
}

async function findExisting(client: SqlClient, idempotencyKey: string): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `select id from ledger_transactions where idempotency_key = $1`,
    [idempotencyKey],
  );
  return r.rows[0]?.id ?? null;
}

export interface PostOptions {
  /**
   * When false, the caller manages begin/commit (used to compose the ledger
   * write with other statements — e.g. audit rows — atomically).
   */
  manageTransaction?: boolean;
}

/**
 * Post a double-entry transaction.
 *
 * - Validates balance app-side; the DB deferred triggers re-verify at commit.
 * - Idempotent: re-posting the same idempotency key returns the original
 *   transaction id with `alreadyPosted: true` and has no financial effect.
 * - Negative-balance rejections surface as INSUFFICIENT_BALANCE.
 */
export async function postTransaction(
  client: SqlClient,
  input: PostTransactionInput,
  options: PostOptions = {},
): Promise<PostedTransaction> {
  const manage = options.manageTransaction ?? true;
  validateEntries(input);

  const existing = await findExisting(client, input.idempotencyKey);
  if (existing) return { transactionId: existing, alreadyPosted: true };

  if (manage) await client.query('begin');
  try {
    const tx = await client.query<{ id: string }>(
      `insert into ledger_transactions (transaction_type, idempotency_key, reference_type, reference_id)
       values ($1::transaction_type, $2, $3, $4) returning id`,
      [input.type, input.idempotencyKey, input.referenceType ?? null, input.referenceId ?? null],
    );
    const transactionId = tx.rows[0]!.id;
    for (const entry of input.entries) {
      await client.query(
        `insert into ledger_entries (transaction_id, account_id, direction, amount)
         values ($1, $2, $3::entry_direction, $4)`,
        [transactionId, entry.accountId, entry.direction, entry.amount.toFixed8()],
      );
    }
    if (manage) await client.query('commit');
    return { transactionId, alreadyPosted: false };
  } catch (error) {
    if (manage) await client.query('rollback').catch(() => undefined);
    // Concurrent duplicate: another writer won the idempotency race — return theirs.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('duplicate key') && message.includes('idempotency')) {
      const winner = await findExisting(client, input.idempotencyKey);
      if (winner) return { transactionId: winner, alreadyPosted: true };
    }
    throw mapDbError(error, input);
  }
}

function mapDbError(error: unknown, input: PostTransactionInput): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('NEGATIVE_BALANCE_FORBIDDEN')) {
    return new LedgerError(
      'INSUFFICIENT_BALANCE',
      `Insufficient balance for transaction ${input.idempotencyKey}: ${message}`,
    );
  }
  if (message.includes('LEDGER_UNBALANCED')) {
    return new LedgerError('LEDGER_UNBALANCED', message);
  }
  return error;
}
