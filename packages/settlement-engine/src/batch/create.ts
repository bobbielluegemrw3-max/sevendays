import { BATCH_STEPS_V1 } from '@sevendays/domain';
import type { SqlClient } from '@sevendays/shared';

export const BATCH_ALGORITHM_VERSION = 'batch_v1.0';

/**
 * Create (or return) the batch run for a MYT calendar date, registering all
 * 37 steps in the fixed spec order. Idempotent: one batch per date, ever.
 */
export async function createBatchRun(client: SqlClient, batchDate: string): Promise<string> {
  await client.query(
    `insert into batch_runs (batch_date, batch_algorithm_version)
     values ($1, $2)
     on conflict (batch_date) do nothing`,
    [batchDate, BATCH_ALGORITHM_VERSION],
  );
  const run = await client.query<{ id: string }>(
    `select id from batch_runs where batch_date = $1`,
    [batchDate],
  );
  const batchRunId = run.rows[0]!.id;

  for (const step of BATCH_STEPS_V1) {
    await client.query(
      `insert into batch_steps (batch_run_id, step_number, step_key, retryable, idempotency_key)
       values ($1, $2, $3, $4, $5)
       on conflict (batch_run_id, step_number) do nothing`,
      [
        batchRunId,
        step.stepNumber,
        step.key,
        step.retryable,
        `batch:${batchDate}:${String(step.stepNumber).padStart(2, '0')}:${step.key}`,
      ],
    );
  }
  return batchRunId;
}
