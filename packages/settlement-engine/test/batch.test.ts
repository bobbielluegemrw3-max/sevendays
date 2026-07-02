import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { BATCH_STEPS_V1 } from '@sevendays/domain';
import {
  BatchError,
  createBatchRun,
  getMarketplaceState,
  runBatch,
  type StepContext,
} from '../src/index.js';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

let dateCounter = 0;
function nextDate(): string {
  dateCounter += 1;
  const day = String((dateCounter % 27) + 1).padStart(2, '0');
  const month = String(Math.floor(dateCounter / 27) + 1).padStart(2, '0');
  return `2032-${month}-${day}`;
}

async function stepStatuses(batchRunId: string): Promise<Map<string, string>> {
  const r = await client.query<{ step_key: string; status: string }>(
    `select step_key, status::text as status from batch_steps where batch_run_id = $1`,
    [batchRunId],
  );
  return new Map(r.rows.map((row) => [row.step_key, row.status]));
}

describe('batch creation', () => {
  it('registers all 37 steps in fixed order with stable idempotency keys', async () => {
    const date = nextDate();
    const id = await createBatchRun(client, date);
    const steps = await client.query<{ step_number: number; step_key: string; idempotency_key: string; retryable: boolean }>(
      `select step_number, step_key, idempotency_key, retryable from batch_steps
       where batch_run_id = $1 order by step_number`,
      [id],
    );
    expect(steps.rows).toHaveLength(37);
    steps.rows.forEach((row, i) => {
      expect(row.step_number).toBe(i + 1);
      expect(row.step_key).toBe(BATCH_STEPS_V1[i]!.key);
      expect(row.retryable).toBe(BATCH_STEPS_V1[i]!.retryable);
      expect(row.idempotency_key).toContain(date);
    });
  });

  it('is idempotent: one batch per date, ever', async () => {
    const date = nextDate();
    const first = await createBatchRun(client, date);
    const second = await createBatchRun(client, date);
    expect(second).toBe(first);
    const count = await client.query<{ count: string }>(
      `select count(*)::text as count from batch_steps where batch_run_id = $1`,
      [first],
    );
    expect(count.rows[0]!.count).toBe('37');
  });
});

describe('happy path', () => {
  it('runs all 37 steps, locks policies, locks and reopens the marketplace', async () => {
    const date = nextDate();
    const executed: string[] = [];
    let stateDuringRace = '';
    let policiesAtRace: StepContext['lockedPolicyVersions'] = null;

    const result = await runBatch(client, {
      batchDate: date,
      handlers: {
        RUN_RACE_ENGINE: async (ctx) => {
          executed.push(ctx.stepKey);
          stateDuringRace = await getMarketplaceState(ctx.client);
          policiesAtRace = ctx.lockedPolicyVersions;
        },
        EXECUTE_ASSIGNMENT: async (ctx) => {
          executed.push(ctx.stepKey);
        },
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect(executed).toEqual(['RUN_RACE_ENGINE', 'EXECUTE_ASSIGNMENT']); // spec order 8 < 25
    expect(stateDuringRace).toBe('MARKET_LOCKED'); // locked during the batch
    expect(await getMarketplaceState(client)).toBe('OPEN'); // reopened after

    // policy versions were locked at step 3 and visible to later steps
    expect(policiesAtRace).not.toBeNull();
    expect(policiesAtRace!.price_tables).toBe('price_table_v1.0');

    const statuses = await stepStatuses(result.batchRunId);
    expect([...statuses.values()].every((s) => s === 'COMPLETED')).toBe(true);

    // audit snapshot was written (step 35)
    const audit = await client.query<{ count: string }>(
      `select count(*)::text as count from audit_logs
       where action = 'DAILY_AUDIT_SNAPSHOT' and reference_id = $1`,
      [result.batchRunId],
    );
    expect(audit.rows[0]!.count).toBe('1');
  });

  it('re-running a completed batch is a no-op', async () => {
    const date = nextDate();
    const first = await runBatch(client, { batchDate: date });
    let called = 0;
    const second = await runBatch(client, {
      batchDate: date,
      handlers: {
        RUN_RACE_ENGINE: async () => {
          called += 1;
        },
      },
    });
    expect(first.status).toBe('COMPLETED');
    expect(second.status).toBe('COMPLETED');
    expect(called).toBe(0); // nothing re-executed
  });
});

describe('failure paths', () => {
  it('non-retryable step failure: batch FAILED, marketplace stays locked, later steps untouched', async () => {
    const date = nextDate();
    const result = await runBatch(client, {
      batchDate: date,
      handlers: {
        EXECUTE_BURNS: async () => {
          throw new Error('burn worker crashed');
        },
      },
    });

    expect(result.status).toBe('FAILED');
    expect(result.failedStepKey).toBe('EXECUTE_BURNS');
    expect(await getMarketplaceState(client)).toBe('MARKET_LOCKED');

    const statuses = await stepStatuses(result.batchRunId);
    expect(statuses.get('EXECUTE_BURNS')).toBe('FAILED');
    expect(statuses.get('GENERATE_REVENGE_BUFFS')).toBe('PENDING'); // never ran
    expect(statuses.get('REOPEN_MARKETPLACE')).toBe('PENDING');

    // resume without recovery is forbidden
    await expect(runBatch(client, { batchDate: date })).rejects.toThrow(BatchError);
    await expect(runBatch(client, { batchDate: date })).rejects.toThrow('Admin Recovery');

    // unblock the shared marketplace for subsequent tests
    await client.query(
      `update marketplace_status set state = 'OPEN', locked_by_batch_run_id = null where id = true`,
    );
  });

  it('retryable step failure: PARTIAL_FAILED, then retry resumes and completes', async () => {
    const date = nextDate();
    let attempts = 0;
    const flaky = async (): Promise<void> => {
      attempts += 1;
      if (attempts === 1) throw new Error('MLM payment provider timeout');
    };

    const first = await runBatch(client, {
      batchDate: date,
      handlers: { PAY_MLM_REWARDS: flaky },
    });
    expect(first.status).toBe('PARTIAL_FAILED');
    expect(first.failedStepKey).toBe('PAY_MLM_REWARDS');
    expect(await getMarketplaceState(client)).toBe('MARKET_LOCKED');

    // re-run: FAILED retryable step retries automatically, batch completes
    const second = await runBatch(client, {
      batchDate: date,
      handlers: { PAY_MLM_REWARDS: flaky },
    });
    expect(second.status).toBe('COMPLETED');
    expect(attempts).toBe(2);
    expect(await getMarketplaceState(client)).toBe('OPEN');

    const retryCount = await client.query<{ retry_count: number }>(
      `select retry_count from batch_steps
       where batch_run_id = $1 and step_key = 'PAY_MLM_REWARDS'`,
      [second.batchRunId],
    );
    expect(retryCount.rows[0]!.retry_count).toBe(1);
  });

  it('earlier completed steps are never re-executed on resume', async () => {
    const date = nextDate();
    let raceRuns = 0;
    let reportAttempts = 0;
    const handlers = {
      RUN_RACE_ENGINE: async (): Promise<void> => {
        raceRuns += 1;
      },
      CREATE_LIQUIDITY_REPORT: async (): Promise<void> => {
        reportAttempts += 1;
        if (reportAttempts === 1) throw new Error('report generation failed');
      },
    };

    const first = await runBatch(client, { batchDate: date, handlers });
    expect(first.status).toBe('PARTIAL_FAILED');

    const second = await runBatch(client, { batchDate: date, handlers });
    expect(second.status).toBe('COMPLETED');
    expect(raceRuns).toBe(1); // race engine ran exactly once across both runs
  });
});
