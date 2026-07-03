import { sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import type { AdminRole } from '@sevendays/domain';
import { runBatch } from '../batch/orchestrator.js';
import type { BatchResult, StepHandlers } from '../batch/types.js';

/**
 * Admin Recovery Procedure (05_SETTLEMENT_ENGINE.md).
 *
 * - Marketplace stays MARKET_LOCKED while the batch is FAILED/PARTIAL_FAILED
 *   (orchestrator guarantees this).
 * - Recovery requires dual approval by two DISTINCT ACTIVE admins whose
 *   roles jointly cover FINANCE_ADMIN + SUPER_ADMIN.
 * - A Recovery Snapshot is saved before recovery starts; every action is
 *   logged in recovery_logs.
 * - Execution re-runs failed steps under the DB recovery-mode flag. Race
 *   results, burns, seeds, snapshots, and posted ledger rows keep their
 *   unconditional immutability — recovery re-executes idempotent work but
 *   can NEVER rewrite outcomes.
 * - Recovery not completed within 24 hours escalates to EMERGENCY.
 */

export type RecoveryErrorCode =
  | 'INVALID_BATCH_STATE'
  | 'RECOVERY_NOT_FOUND'
  | 'DUAL_APPROVAL_REQUIRED'
  | 'RECOVERY_ALREADY_OPEN';

export class RecoveryError extends Error {
  constructor(
    readonly code: RecoveryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecoveryError';
  }
}

export const RECOVERY_TIMEOUT_HOURS = 24;

async function log(
  client: SqlClient,
  recoveryId: string,
  batchRunId: string,
  actorUserId: string | null,
  action: string,
  detail?: { stepKey?: string; reason?: string; result?: string },
): Promise<void> {
  await client.query(
    `insert into recovery_logs (recovery_snapshot_id, batch_run_id, actor_user_id, action, step_key, reason, result)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      recoveryId,
      batchRunId,
      actorUserId,
      action,
      detail?.stepKey ?? null,
      detail?.reason ?? null,
      detail?.result ?? null,
    ],
  );
}

async function stateHash(client: SqlClient, batchRunId: string): Promise<string> {
  const state = await client.query<{ snapshot: string }>(
    `select json_build_object(
       'steps', (select json_agg(json_build_object('n', step_number, 's', status) order by step_number)
                 from batch_steps where batch_run_id = $1),
       'batch', (select status from batch_runs where id = $1),
       'results', (select count(*) from race_results r join races x on x.id = r.race_id where x.batch_run_id = $1),
       'burns', (select count(*) from horse_burns b join races x on x.id = b.race_id where x.batch_run_id = $1),
       'assignments', (select count(*) from ownership_assignments where batch_run_id = $1)
     )::text as snapshot`,
    [batchRunId],
  );
  return sha256Parts('recovery', batchRunId, state.rows[0]!.snapshot);
}

async function activeAdminRoles(client: SqlClient, userId: string): Promise<AdminRole[]> {
  const r = await client.query<{ role: AdminRole; status: string }>(
    `select g.role::text as role, u.status::text as status
     from admin_role_grants g join users u on u.id = g.user_id
     where g.user_id = $1 and g.revoked_at is null`,
    [userId],
  );
  return r.rows.filter((row) => row.status === 'ACTIVE').map((row) => row.role);
}

// ---------------------------------------------------------------------------

export async function requestRecovery(
  client: SqlClient,
  input: { batchRunId: string; reason: string; requestedBy: string },
): Promise<string> {
  const batch = await client.query<{ status: string }>(
    `select status::text as status from batch_runs where id = $1`,
    [input.batchRunId],
  );
  const status = batch.rows[0]?.status;
  if (status !== 'FAILED' && status !== 'PARTIAL_FAILED') {
    throw new RecoveryError(
      'INVALID_BATCH_STATE',
      `Recovery requires a FAILED/PARTIAL_FAILED batch (got ${status ?? 'missing'})`,
    );
  }

  const beforeHash = await stateHash(client, input.batchRunId);
  try {
    const created = await client.query<{ id: string }>(
      `insert into recovery_snapshots (batch_run_id, recovery_reason, before_snapshot_hash)
       values ($1, $2, $3) returning id`,
      [input.batchRunId, input.reason, beforeHash],
    );
    const recoveryId = created.rows[0]!.id;
    await log(client, recoveryId, input.batchRunId, input.requestedBy, 'REQUESTED', {
      reason: input.reason,
    });
    return recoveryId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('uq_recovery_open_per_batch')) {
      throw new RecoveryError(
        'RECOVERY_ALREADY_OPEN',
        `Batch ${input.batchRunId} already has an open recovery`,
      );
    }
    throw error;
  }
}

export async function approveRecovery(
  client: SqlClient,
  input: { recoveryId: string; approverUserId: string },
): Promise<{ approvalStatus: string }> {
  const recovery = await client.query<{
    batch_run_id: string;
    approval_status: string;
    approved_by_1: string | null;
    approved_by_2: string | null;
    completed_at: string | null;
  }>(
    `select batch_run_id, approval_status::text as approval_status,
            approved_by_1, approved_by_2, completed_at::text as completed_at
     from recovery_snapshots where id = $1`,
    [input.recoveryId],
  );
  const row = recovery.rows[0];
  if (!row) throw new RecoveryError('RECOVERY_NOT_FOUND', `Recovery ${input.recoveryId} not found`);
  if (row.completed_at !== null) {
    throw new RecoveryError('INVALID_BATCH_STATE', 'Recovery already completed');
  }

  const roles = await activeAdminRoles(client, input.approverUserId);
  if (roles.length === 0) {
    throw new RecoveryError(
      'DUAL_APPROVAL_REQUIRED',
      'Approver must be an ACTIVE admin (FINANCE_ADMIN or SUPER_ADMIN)',
    );
  }
  if (row.approved_by_1 === input.approverUserId || row.approved_by_2 === input.approverUserId) {
    return { approvalStatus: row.approval_status }; // idempotent re-approval
  }

  if (row.approved_by_1 === null) {
    await client.query(
      `update recovery_snapshots set approved_by_1 = $2 where id = $1`,
      [input.recoveryId, input.approverUserId],
    );
    await log(client, input.recoveryId, row.batch_run_id, input.approverUserId, 'APPROVED_1');
    return { approvalStatus: 'PENDING' };
  }

  // Second approval: distinct user (DB check) + combined role coverage.
  const roles1 = await activeAdminRoles(client, row.approved_by_1);
  const combined = new Set<AdminRole>([...roles1, ...roles]);
  if (!combined.has('FINANCE_ADMIN') || !combined.has('SUPER_ADMIN')) {
    throw new RecoveryError(
      'DUAL_APPROVAL_REQUIRED',
      'Approvers must jointly hold FINANCE_ADMIN and SUPER_ADMIN',
    );
  }
  await client.query(
    `update recovery_snapshots
     set approved_by_2 = $2, approval_status = 'APPROVED'
     where id = $1`,
    [input.recoveryId, input.approverUserId],
  );
  await log(client, input.recoveryId, row.batch_run_id, input.approverUserId, 'APPROVED_2');
  return { approvalStatus: 'APPROVED' };
}

export async function executeRecovery(
  client: SqlClient,
  input: { recoveryId: string; executedBy: string; handlers?: StepHandlers },
): Promise<BatchResult> {
  const recovery = await client.query<{
    batch_run_id: string;
    approval_status: string;
    completed_at: string | null;
    batch_date: string;
    batch_status: string;
  }>(
    `select r.batch_run_id, r.approval_status::text as approval_status,
            r.completed_at::text as completed_at,
            b.batch_date::text as batch_date, b.status::text as batch_status
     from recovery_snapshots r join batch_runs b on b.id = r.batch_run_id
     where r.id = $1`,
    [input.recoveryId],
  );
  const row = recovery.rows[0];
  if (!row) throw new RecoveryError('RECOVERY_NOT_FOUND', `Recovery ${input.recoveryId} not found`);
  if (row.completed_at !== null) {
    throw new RecoveryError('INVALID_BATCH_STATE', 'Recovery already completed');
  }
  if (row.approval_status !== 'APPROVED') {
    throw new RecoveryError(
      'DUAL_APPROVAL_REQUIRED',
      `Recovery execution requires APPROVED status (got ${row.approval_status})`,
    );
  }

  await log(client, input.recoveryId, row.batch_run_id, input.executedBy, 'EXECUTE_START');

  // Under the recovery flag, reset FAILED steps to PENDING for re-execution.
  // Outcome tables stay immutable regardless of this flag.
  await client.query(`select set_config('sevendays.recovery_mode', 'on', false)`);
  try {
    await client.query(
      `update batch_steps set status = 'PENDING', error_code = null
       where batch_run_id = $1 and status = 'FAILED'`,
      [row.batch_run_id],
    );
    if (row.batch_status === 'FAILED') {
      await client.query(
        `update batch_runs set status = 'PARTIAL_FAILED' where id = $1`,
        [row.batch_run_id],
      );
    }
  } finally {
    await client.query(`select set_config('sevendays.recovery_mode', '', false)`).catch(() => undefined);
  }

  const handlerArgs = input.handlers === undefined ? {} : { handlers: input.handlers };
  const result = await runBatch(client, { batchDate: row.batch_date, ...handlerArgs });

  if (result.status === 'COMPLETED') {
    const afterHash = await stateHash(client, row.batch_run_id);
    await client.query(
      `update recovery_snapshots set after_snapshot_hash = $2, completed_at = now() where id = $1`,
      [input.recoveryId, afterHash],
    );
    await log(client, input.recoveryId, row.batch_run_id, input.executedBy, 'COMPLETED', {
      result: 'batch COMPLETED',
    });
  } else {
    const detail: { stepKey?: string; result?: string } = {
      result: result.errorMessage?.slice(0, 300) ?? 'unknown',
    };
    if (result.failedStepKey !== undefined) detail.stepKey = result.failedStepKey;
    await log(client, input.recoveryId, row.batch_run_id, input.executedBy, 'EXECUTE_FAILED', detail);
  }
  return result;
}

export interface TimedOutRecovery {
  recoveryId: string;
  batchRunId: string;
  batchDate: string;
  hoursOpen: number;
}

/**
 * Recovery Timeout (05_SETTLEMENT_ENGINE.md): open recoveries older than 24
 * hours force EMERGENCY mode — an immutable EMERGENCY evaluation is recorded
 * for the following day and a critical audit entry is written.
 */
export async function checkRecoveryTimeouts(
  client: SqlClient,
  asOfDate: string,
): Promise<TimedOutRecovery[]> {
  const stale = await client.query<{
    id: string;
    batch_run_id: string;
    batch_date: string;
    hours_open: string;
  }>(
    `select r.id, r.batch_run_id, b.batch_date::text as batch_date,
            (extract(epoch from (now() - r.created_at)) / 3600)::text as hours_open
     from recovery_snapshots r join batch_runs b on b.id = r.batch_run_id
     where r.completed_at is null
       and r.created_at < now() - interval '${RECOVERY_TIMEOUT_HOURS} hours'`,
  );

  const timedOut: TimedOutRecovery[] = [];
  for (const row of stale.rows) {
    timedOut.push({
      recoveryId: row.id,
      batchRunId: row.batch_run_id,
      batchDate: row.batch_date,
      hoursOpen: Number(row.hours_open),
    });
    await client.query(
      `insert into audit_logs (actor_type, action, reference_type, reference_id, metadata_json)
       values ('SYSTEM', 'RECOVERY_TIMEOUT_EMERGENCY', 'recovery_snapshot', $1, $2)`,
      [row.id, JSON.stringify({ batch_date: row.batch_date, hours_open: row.hours_open })],
    );
    await client.query(
      `insert into economy_status_evaluations
         (evaluation_date, economy_policy_version, metrics_json, recommended_status, final_status, consecutive_match_days)
       values ($1, 'economy_policy_v1.0', $2, 'EMERGENCY', 'EMERGENCY', 1)
       on conflict (evaluation_date) do nothing`,
      [asOfDate, JSON.stringify({ reason: 'RECOVERY_TIMEOUT', recovery_id: row.id })],
    );
    await log(client, row.id, row.batch_run_id, null, 'TIMEOUT_EMERGENCY', {
      result: `open ${Number(row.hours_open).toFixed(1)}h > ${RECOVERY_TIMEOUT_HOURS}h`,
    });
  }
  return timedOut;
}
