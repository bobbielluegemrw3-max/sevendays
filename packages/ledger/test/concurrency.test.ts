import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Money } from '@sevendays/shared';
import type { QueryResult, SqlClient } from '@sevendays/shared';
import {
  LedgerError,
  ensureUserAccounts,
  getBalance,
  depositConfirmation,
  purchaseFundLock,
} from '../src/index.js';

/**
 * True-concurrency double-spend test. PGlite is single-connection, so this
 * suite runs ONLY against a real Postgres, opt-in via TEST_DATABASE_URL
 * (staging/local Postgres with migrations applied).
 *
 * Verifies the serialization mechanism: the balance-cache row lock forces
 * concurrent debits of the same account to execute sequentially, and the
 * deferred non-negative check sees the combined result — so two 177.16 locks
 * against a 200 balance can never both succeed.
 */

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('concurrent double-spend prevention (real Postgres)', () => {
  it('two concurrent fund locks: exactly one wins', async () => {
    const { default: postgres } = await import('postgres');
    const sql = postgres(url!, { max: 4, prepare: false });

    async function reservedClient(): Promise<{ client: SqlClient; release: () => void }> {
      const reserved = await sql.reserve();
      const client: SqlClient = {
        async query<T = Record<string, unknown>>(
          text: string,
          params?: unknown[],
        ): Promise<QueryResult<T>> {
          const result = await reserved.unsafe(text, (params ?? []) as never[]);
          return {
            rows: [...(result as unknown as T[])],
            affectedRows: (result as unknown as { count?: number }).count ?? 0,
          };
        },
      };
      return { client, release: () => void reserved.release() };
    }

    const a = await reservedClient();
    const b = await reservedClient();
    try {
      // setup: one user funded with 200
      const userRow = await a.client.query<{ id: string }>(
        `insert into users (email) values ($1) returning id`,
        [`${randomUUID()}@concurrency.test`],
      );
      const userId = userRow.rows[0]!.id;
      await depositConfirmation(a.client, {
        userId,
        amount: Money.of('200'),
        idempotencyKey: randomUUID(),
      });

      // fire two 177.16 locks truly concurrently on separate connections
      const lock = (client: SqlClient) =>
        purchaseFundLock(client, {
          userId,
          amount: Money.of('177.16'),
          idempotencyKey: randomUUID(),
        });
      const results = await Promise.allSettled([lock(a.client), lock(b.client)]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toBeInstanceOf(LedgerError);
      expect((rejected[0]!.reason as LedgerError).code).toBe('INSUFFICIENT_BALANCE');

      // final state: exactly one lock applied
      const accounts = await ensureUserAccounts(a.client, userId);
      expect(await getBalance(a.client, accounts.available)).toBe('22.84000000');
      expect(await getBalance(a.client, accounts.locked)).toBe('177.16000000');
    } finally {
      a.release();
      b.release();
      await sql.end();
    }
  });
});
