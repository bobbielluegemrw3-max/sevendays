import { newUuid, sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import type { BatchStatus, BatchStepStatus, RaceSlotV2 } from '@sevendays/domain';
import { lockPolicyVersions, type PolicyTable } from '@sevendays/economy-engine';
import { reconcile } from '@sevendays/ledger';
import { createBatchRun } from './create.js';
import { getMarketplaceState, lockMarketplace, reopenMarketplace } from './marketplace.js';
import { BatchError, type BatchResult, type StepContext, type StepHandlers } from './types.js';

/**
 * Daily Settlement Batch orchestrator (05_SETTLEMENT_ENGINE.md).
 *
 * Steps run strictly in the fixed 1..37 order. The orchestrator is
 * resumable and idempotent:
 *   - COMPLETED steps are skipped on re-run
 *   - FAILED retryable steps re-run automatically (retry_count++)
 *   - FAILED non-retryable steps abort with RECOVERY_REQUIRED — only the
 *     Admin Recovery Procedure (Phase 10) may proceed from there
 *   - a step failure marks the batch FAILED (non-retryable) or
 *     PARTIAL_FAILED (retryable) and leaves the Marketplace LOCKED
 *
 * Framework steps (1, 2, 3, 29, 35, 36, 37) have built-in handlers.
 * Domain steps are provided by later phases via `handlers`; missing
 * handlers are no-ops so the skeleton is runnable before all features exist.
 */

interface StepRow {
  id: string;
  step_number: number;
  step_key: string;
  status: BatchStepStatus;
  retryable: boolean;
  idempotency_key: string;
  retry_count: number;
}

export interface RunBatchOptions {
  batchDate: string;
  /** Race slot (Decision 102). Defaults to NIGHT — the V1 cadence. */
  slot?: RaceSlotV2;
  handlers?: StepHandlers;
}

export async function runBatch(client: SqlClient, options: RunBatchOptions): Promise<BatchResult> {
  const { batchDate } = options;
  const slot = options.slot ?? 'NIGHT';

  // Single-runner guarantee (audit fix F-A): a session-scoped advisory lock
  // prevents two runners (scheduler retry + manual trigger) from executing
  // the same batch concurrently. A crashed runner's lock is released
  // automatically when its connection dies, so takeover needs no lease table.
  const lock = await client.query<{ acquired: boolean }>(
    `select pg_try_advisory_lock(hashtext('sevendays_batch:' || $1 || ':' || $2)) as acquired`,
    [batchDate, slot],
  );
  if (!lock.rows[0]?.acquired) {
    throw new BatchError(
      'INVALID_BATCH_STATE',
      `Batch ${batchDate} ${slot} is already being executed by another runner`,
    );
  }
  try {
    return await runBatchLocked(client, options, slot);
  } finally {
    await client
      .query(`select pg_advisory_unlock(hashtext('sevendays_batch:' || $1 || ':' || $2))`, [batchDate, slot])
      .catch(() => undefined);
  }
}

async function runBatchLocked(
  client: SqlClient,
  options: RunBatchOptions,
  slot: RaceSlotV2,
): Promise<BatchResult> {
  const { batchDate } = options;
  const handlers = options.handlers ?? {};
  const traceId = newUuid();
  const batchRunId = await createBatchRun(client, batchDate, slot);

  const runStatus = await getBatchStatus(client, batchRunId);
  if (runStatus === 'COMPLETED') {
    return { batchRunId, batchDate, slot, status: 'COMPLETED' };
  }
  if (runStatus === 'FAILED') {
    // FAILED means a non-retryable step failed — recovery only.
    const failed = await firstFailedStep(client, batchRunId);
    throw new BatchError(
      'RECOVERY_REQUIRED',
      `Batch ${batchDate} ${slot} is FAILED at step ${failed?.step_key ?? '?'}; Admin Recovery required`,
    );
  }

  await setBatchStatus(client, batchRunId, 'RUNNING');

  let lockedPolicyVersions = await loadLockedPolicyVersions(client, batchRunId);

  const steps = await loadSteps(client, batchRunId);
  for (const step of steps) {
    if (step.status === 'COMPLETED') continue;

    if (step.status === 'RUNNING' && !step.retryable) {
      // Interrupted mid-step (crash). Non-retryable work must not blindly
      // re-run — that is exactly what Admin Recovery exists for.
      await setBatchStatus(client, batchRunId, 'FAILED');
      throw new BatchError(
        'RECOVERY_REQUIRED',
        `Step ${step.step_key} was interrupted while RUNNING; Admin Recovery required`,
      );
    }

    const isRetry = step.status === 'FAILED' || step.status === 'RUNNING';
    await client.query(
      `update batch_steps
       set status = 'RUNNING', started_at = coalesce(started_at, now()),
           retry_count = retry_count + $2, error_code = null
       where id = $1`,
      [step.id, isRetry ? 1 : 0],
    );

    const ctx: StepContext = {
      client,
      batchRunId,
      batchDate,
      slot,
      stepNumber: step.step_number,
      stepKey: step.step_key,
      idempotencyKey: step.idempotency_key,
      traceId,
      lockedPolicyVersions,
    };

    try {
      const handler = builtinHandlers[step.step_key] ?? handlers[step.step_key] ?? noop;
      await handler(ctx);
      if (step.step_key === 'LOCK_POLICY_VERSIONS') {
        lockedPolicyVersions = await loadLockedPolicyVersions(client, batchRunId);
      }
      await client.query(
        `update batch_steps set status = 'COMPLETED', completed_at = now() where id = $1`,
        [step.id],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await client.query(
        `update batch_steps set status = 'FAILED', error_code = $2 where id = $1`,
        [step.id, message.slice(0, 500)],
      );
      const batchStatus: BatchStatus = step.retryable ? 'PARTIAL_FAILED' : 'FAILED';
      await setBatchStatus(client, batchRunId, batchStatus);
      // Marketplace stays MARKET_LOCKED (05_SETTLEMENT_ENGINE.md).
      return {
        batchRunId,
        batchDate,
        slot,
        status: batchStatus,
        failedStepKey: step.step_key,
        failedStepNumber: step.step_number,
        errorMessage: message,
      };
    }
  }

  await client.query(
    `update batch_runs set status = 'COMPLETED', completed_at = now(), failed_at = null where id = $1`,
    [batchRunId],
  );
  return { batchRunId, batchDate, slot, status: 'COMPLETED' };
}

const noop = async (): Promise<void> => {
  /* domain step not yet implemented — filled in by later phases */
};

// ---------------------------------------------------------------------------
// Built-in framework step handlers
// ---------------------------------------------------------------------------

const builtinHandlers: Record<string, (ctx: StepContext) => Promise<void>> = {
  START_BATCH: async (ctx) => {
    // Batch row already RUNNING; assert marketplace exists.
    await getMarketplaceState(ctx.client);
  },

  LOCK_MARKETPLACE: async (ctx) => {
    await lockMarketplace(ctx.client, ctx.batchRunId);
  },

  LOCK_POLICY_VERSIONS: async (ctx) => {
    const locked = await lockPolicyVersions(ctx.client);
    await ctx.client.query(
      `update batch_runs set locked_policy_versions_json = $2 where id = $1`,
      [ctx.batchRunId, JSON.stringify(locked)],
    );
  },

  LEDGER_RECONCILIATION: async (ctx) => {
    const report = await reconcile(ctx.client);
    if (!report.ok) {
      throw new Error(
        `LEDGER_UNBALANCED: reconciliation failed: ${report.issues
          .map((i) => `${i.check}: ${i.detail}`)
          .join('; ')}`,
      );
    }
  },

  CREATE_AUDIT_SNAPSHOT: async (ctx) => {
    const counts = await ctx.client.query<{ metric: string; value: string }>(
      `select 'races' as metric, count(*)::text as value from races where batch_run_id = $1
       union all
       select 'assignments', count(*)::text from ownership_assignments where batch_run_id = $1
       union all
       select 'listings', count(*)::text from market_listings where batch_run_id = $1
       union all
       select 'completed_steps', count(*)::text from batch_steps where batch_run_id = $1 and status = 'COMPLETED'`,
      [ctx.batchRunId],
    );
    const snapshot = Object.fromEntries(counts.rows.map((r) => [r.metric, r.value]));
    const hash = sha256Parts(ctx.batchRunId, ctx.batchDate, JSON.stringify(snapshot));
    await ctx.client.query(
      `insert into audit_logs (actor_type, action, reference_type, reference_id, after_hash, metadata_json)
       values ('SYSTEM', 'DAILY_AUDIT_SNAPSHOT', 'batch_run', $1, $2, $3)`,
      [ctx.batchRunId, hash, JSON.stringify(snapshot)],
    );
  },

  REOPEN_MARKETPLACE: async (ctx) => {
    await reopenMarketplace(ctx.client, ctx.batchRunId);
  },

  COMPLETE_BATCH: async () => {
    // Final status update happens after the loop; nothing else to do.
  },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function getBatchStatus(client: SqlClient, batchRunId: string): Promise<BatchStatus> {
  const r = await client.query<{ status: BatchStatus }>(
    `select status::text as status from batch_runs where id = $1`,
    [batchRunId],
  );
  return r.rows[0]!.status;
}

async function setBatchStatus(
  client: SqlClient,
  batchRunId: string,
  status: BatchStatus,
): Promise<void> {
  await client.query(
    `update batch_runs set status = $2::batch_status,
       failed_at = case when $2 in ('FAILED', 'PARTIAL_FAILED') then now() else failed_at end
     where id = $1`,
    [batchRunId, status],
  );
}

async function loadSteps(client: SqlClient, batchRunId: string): Promise<StepRow[]> {
  const r = await client.query<StepRow>(
    `select id, step_number, step_key, status::text as status, retryable, idempotency_key, retry_count
     from batch_steps where batch_run_id = $1 order by step_number`,
    [batchRunId],
  );
  return r.rows;
}

async function firstFailedStep(client: SqlClient, batchRunId: string): Promise<StepRow | null> {
  const r = await client.query<StepRow>(
    `select id, step_number, step_key, status::text as status, retryable, idempotency_key, retry_count
     from batch_steps where batch_run_id = $1 and status = 'FAILED'
     order by step_number limit 1`,
    [batchRunId],
  );
  return r.rows[0] ?? null;
}

async function loadLockedPolicyVersions(
  client: SqlClient,
  batchRunId: string,
): Promise<Record<PolicyTable, string> | null> {
  const r = await client.query<{ locked: Record<PolicyTable, string> | null }>(
    `select locked_policy_versions_json as locked from batch_runs where id = $1`,
    [batchRunId],
  );
  return r.rows[0]?.locked ?? null;
}
