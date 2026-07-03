import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, expectDbError } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import {
  runBatch,
  getMarketplaceState,
  requestRecovery,
  approveRecovery,
  executeRecovery,
  checkRecoveryTimeouts,
  RecoveryError,
} from '../src/index.js';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  return r.rows[0]!.id;
}

async function newAdmin(role: 'FINANCE_ADMIN' | 'SUPER_ADMIN'): Promise<string> {
  const id = await newUser();
  await client.query(
    `insert into admin_role_grants (user_id, role) values ($1, $2::admin_role)`,
    [id, role],
  );
  return id;
}

async function failedBatch(date: string): Promise<{ batchRunId: string; date: string }> {
  const result = await runBatch(client, {
    batchDate: date,
    handlers: {
      EXECUTE_BURNS: async () => {
        throw new Error('burn worker crashed');
      },
    },
  });
  expect(result.status).toBe('FAILED');
  return { batchRunId: result.batchRunId, date };
}

describe('recovery request and dual approval', () => {
  it('full recovery walk: request -> dual approve -> execute -> batch completes, marketplace reopens', async () => {
    const { batchRunId } = await failedBatch('2037-01-01');
    expect(await getMarketplaceState(client)).toBe('MARKET_LOCKED');

    const requester = await newUser();
    const recoveryId = await requestRecovery(client, {
      batchRunId,
      reason: 'burn worker crash — infrastructure fixed',
      requestedBy: requester,
    });

    // only one open recovery per batch
    await expect(
      requestRecovery(client, { batchRunId, reason: 'dup', requestedBy: requester }),
    ).rejects.toThrow(RecoveryError);

    // execution before approval is forbidden
    await expect(
      executeRecovery(client, { recoveryId, executedBy: requester }),
    ).rejects.toThrow('APPROVED');

    // non-admin cannot approve
    const nobody = await newUser();
    await expect(
      approveRecovery(client, { recoveryId, approverUserId: nobody }),
    ).rejects.toThrow('ACTIVE admin');

    // two distinct admins covering FINANCE + SUPER
    const finance = await newAdmin('FINANCE_ADMIN');
    const superAdmin = await newAdmin('SUPER_ADMIN');
    const first = await approveRecovery(client, { recoveryId, approverUserId: finance });
    expect(first.approvalStatus).toBe('PENDING'); // one approval is not enough

    // the same admin approving twice does not complete the pair
    const again = await approveRecovery(client, { recoveryId, approverUserId: finance });
    expect(again.approvalStatus).toBe('PENDING');

    const second = await approveRecovery(client, { recoveryId, approverUserId: superAdmin });
    expect(second.approvalStatus).toBe('APPROVED');

    // approved execution: burns succeed this time -> batch completes
    const result = await executeRecovery(client, {
      recoveryId,
      executedBy: superAdmin,
      handlers: {}, // default no-op burn handler succeeds
    });
    expect(result.status).toBe('COMPLETED');
    expect(await getMarketplaceState(client)).toBe('OPEN');

    // snapshot closed with before/after hashes; logs tell the whole story
    const snapshot = await client.query<{
      before_snapshot_hash: string;
      after_snapshot_hash: string | null;
      completed_at: string | null;
    }>(
      `select before_snapshot_hash, after_snapshot_hash, completed_at::text as completed_at
       from recovery_snapshots where id = $1`,
      [recoveryId],
    );
    expect(snapshot.rows[0]!.after_snapshot_hash).not.toBeNull();
    expect(snapshot.rows[0]!.completed_at).not.toBeNull();
    expect(snapshot.rows[0]!.after_snapshot_hash).not.toBe(snapshot.rows[0]!.before_snapshot_hash);

    const logs = await client.query<{ action: string }>(
      `select action from recovery_logs where recovery_snapshot_id = $1 order by created_at`,
      [recoveryId],
    );
    expect(logs.rows.map((l) => l.action)).toEqual([
      'REQUESTED', 'APPROVED_1', 'APPROVED_2', 'EXECUTE_START', 'COMPLETED',
    ]);
  });

  it('rejects recovery requests for healthy batches', async () => {
    const ok = await runBatch(client, { batchDate: '2037-02-01' });
    expect(ok.status).toBe('COMPLETED');
    await expect(
      requestRecovery(client, { batchRunId: ok.batchRunId, reason: 'x', requestedBy: await newUser() }),
    ).rejects.toThrow('FAILED/PARTIAL_FAILED');
  });

  it('a BANNED admin cannot approve', async () => {
    const { batchRunId } = await failedBatch('2037-03-01');
    const recoveryId = await requestRecovery(client, {
      batchRunId,
      reason: 'test',
      requestedBy: await newUser(),
    });
    const banned = await newAdmin('SUPER_ADMIN');
    await client.query(`update users set status = 'BANNED' where id = $1`, [banned]);
    await expect(
      approveRecovery(client, { recoveryId, approverUserId: banned }),
    ).rejects.toThrow('ACTIVE admin');
    // release the marketplace for later tests
    await client.query(`update marketplace_status set state = 'OPEN', locked_by_batch_run_id = null where id = true`);
  });
});

describe('immutability holds even in recovery mode', () => {
  it('outcome tables reject writes while the recovery flag is on', async () => {
    await client.query(`select set_config('sevendays.recovery_mode', 'on', false)`);
    try {
      const audit = await client.query<{ id: string }>(
        `insert into audit_logs (actor_type, action) values ('SYSTEM', 'RECOVERY_PROBE') returning id`,
      );
      await expectDbError(
        client.query(`update audit_logs set action = 'TAMPERED' where id = $1`, [audit.rows[0]!.id]),
        'IMMUTABLE_RECORD',
      );
      // ledger stays immutable too
      const tx = await client.query<{ id: string }>(
        `insert into ledger_transactions (transaction_type, idempotency_key)
         values ('ADMIN_ADJUSTMENT', $1) returning id`,
        [randomUUID()],
      );
      await expectDbError(
        client.query(`update ledger_transactions set reference_type = 'x' where id = $1`, [
          tx.rows[0]!.id,
        ]),
        'LEDGER_IMMUTABLE',
      );
    } finally {
      await client.query(`select set_config('sevendays.recovery_mode', '', false)`);
    }
  });

  it('without the flag, failed non-retryable steps stay frozen (no backdoor)', async () => {
    const { batchRunId } = await failedBatch('2037-04-01');
    await expectDbError(
      client.query(
        `update batch_steps set status = 'PENDING'
         where batch_run_id = $1 and step_key = 'EXECUTE_BURNS'`,
        [batchRunId],
      ),
      'RETRY_FORBIDDEN',
    );
    await client.query(`update marketplace_status set state = 'OPEN', locked_by_batch_run_id = null where id = true`);
  });
});

describe('24-hour recovery timeout', () => {
  it('escalates stale open recoveries to EMERGENCY with audit trail', async () => {
    const { batchRunId } = await failedBatch('2037-05-01');
    const recoveryId = await requestRecovery(client, {
      batchRunId,
      reason: 'will time out',
      requestedBy: await newUser(),
    });
    // backdate the request past the 24h limit
    await client.query(
      `update recovery_snapshots set created_at = now() - interval '25 hours' where id = $1`,
      [recoveryId],
    );

    const timedOut = await checkRecoveryTimeouts(client, '2037-05-02');
    expect(timedOut.map((t) => t.recoveryId)).toContain(recoveryId);
    expect(timedOut[0]!.hoursOpen).toBeGreaterThan(24);
    expect(timedOut[0]!.emergencyRecordedFor).toBe('2037-05-02');

    const audit = await client.query<{ count: string }>(
      `select count(*)::text as count from audit_logs
       where action = 'RECOVERY_TIMEOUT_EMERGENCY' and reference_id = $1`,
      [recoveryId],
    );
    expect(audit.rows[0]!.count).toBe('1');

    const evaluation = await client.query<{ final_status: string }>(
      `select final_status::text as final_status from economy_status_evaluations
       where evaluation_date = '2037-05-02'`,
    );
    expect(evaluation.rows[0]!.final_status).toBe('EMERGENCY');

    await client.query(`update marketplace_status set state = 'OPEN', locked_by_batch_run_id = null where id = true`);
  });
});
