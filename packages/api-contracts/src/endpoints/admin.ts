import { z } from 'zod';
import {
  computeEconomyMetrics,
  currentEconomyStatus,
} from '@sevendays/economy-engine';
import { ADMIN_ROLES } from '@sevendays/domain';
import { approveWithdrawal, rejectWithdrawal } from '@sevendays/blockchain';
import { approveRecovery, runBatch, buildProductionHandlers } from '@sevendays/settlement-engine';
import { ApiError } from '../errors.js';
import type { ApiRegistry, HandlerContext } from '../router.js';

/** Admin APIs (07_API.md) — JWT + role validation; every action audited. */

function requireAdminRole(ctx: HandlerContext): void {
  if (ctx.auth.kind !== 'admin' || ctx.auth.roles.length === 0) {
    throw new ApiError('FORBIDDEN', 'Admin role required');
  }
}

async function audit(ctx: HandlerContext, action: string, referenceType: string, referenceId: string): Promise<void> {
  await ctx.client.query(
    `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id)
     values ('ADMIN', $1, $2, $3, $4)`,
    [ctx.userId, action, referenceType, referenceId],
  );
}

export function registerAdminEndpoints(registry: ApiRegistry): void {
  registry.register({
    method: 'GET',
    path: '/api/v1/admin/dashboard',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const latest = await ctx.client.query<{ id: string; batch_date: string; status: string }>(
        `select id, batch_date::text as batch_date, status::text as status
         from batch_runs order by batch_date desc limit 1`,
      );
      const batch = latest.rows[0] ?? null;
      const metrics = batch
        ? await computeEconomyMetrics(ctx.client, { asOfDate: batch.batch_date, batchRunId: batch.id })
        : null;
      const status = batch
        ? await currentEconomyStatus(ctx.client, batch.batch_date)
        : 'NORMAL';
      return { latest_batch: batch, economy_status: status, metrics };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/batches',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select b.id, b.batch_date::text as batch_date, b.status::text as status,
                b.completed_at::text as completed_at, b.failed_at::text as failed_at,
                (select count(*) from batch_steps s where s.batch_run_id = b.id and s.status = 'COMPLETED') as completed_steps
         from batch_runs b order by b.batch_date desc limit 60`,
      );
      return { batches: rows.rows };
    },
  });

  // Retry: PARTIAL_FAILED batches only — retryable steps re-run through the
  // orchestrator. FAILED batches require the Recovery Procedure instead.
  registry.register({
    method: 'POST',
    path: '/api/v1/admin/batches/:id/retry',
    auth: 'admin',
    idempotencyKeyRequired: true,
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const batch = await ctx.client.query<{ batch_date: string; status: string }>(
        `select batch_date::text as batch_date, status::text as status from batch_runs where id = $1`,
        [ctx.params.id],
      );
      if (!batch.rows[0]) throw new ApiError('NOT_FOUND', 'Batch not found');
      if (batch.rows[0].status !== 'PARTIAL_FAILED') {
        throw new ApiError(
          'INVALID_BATCH_STATE',
          `Retry requires PARTIAL_FAILED (got ${batch.rows[0].status}); FAILED batches need Recovery`,
        );
      }
      await audit(ctx, 'ADMIN_BATCH_RETRY', 'batch_run', ctx.params.id!);
      const result = await runBatch(ctx.client, {
        batchDate: batch.rows[0].batch_date,
        handlers: buildProductionHandlers(),
      });
      return { batch_run_id: result.batchRunId, status: result.status };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/recovery/:id/approve',
    auth: 'admin',
    idempotencyKeyRequired: true,
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const result = await approveRecovery(ctx.client, {
        recoveryId: ctx.params.id!,
        approverUserId: ctx.userId,
      });
      await audit(ctx, 'ADMIN_RECOVERY_APPROVE', 'recovery_snapshot', ctx.params.id!);
      return { approval_status: result.approvalStatus };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/audit',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select actor_type::text as actor_type, actor_id, action, reference_type, reference_id,
                metadata_json, created_at::text as created_at
         from audit_logs order by created_at desc limit 200`,
      );
      return { audit: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/liquidity/reports',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select report_date::text as report_date, metrics_json, created_at::text as created_at
         from liquidity_reports order by report_date desc limit 60`,
      );
      return { reports: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/stress-tests',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select r.scenario, r.passed, r.detail_json, b.batch_date::text as batch_date
         from stress_test_results r join batch_runs b on b.id = r.batch_run_id
         order by b.batch_date desc, r.scenario limit 200`,
      );
      return { stress_tests: rows.rows };
    },
  });

  // Large-withdrawal Admin Review (Decision 060): dual approval by one
  // FINANCE_ADMIN + one SUPER_ADMIN, two distinct persons. Package
  // functions write the approvals/audit; DB constraints enforce the rules.
  registry.register({
    method: 'GET',
    path: '/api/v1/admin/withdrawals',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select w.id, w.user_id, w.chain_id, w.to_address,
                w.requested_amount::text as requested_amount,
                w.status::text as status, w.requested_at::text as requested_at,
                coalesce(json_agg(json_build_object('admin_user_id', a.admin_user_id, 'role', a.admin_role))
                         filter (where a.id is not null), '[]') as approvals
         from blockchain_withdrawals w
         left join withdrawal_review_approvals a on a.withdrawal_id = w.id
         where w.status = 'ADMIN_REVIEW'
         group by w.id
         order by w.requested_at
         limit 100`,
      );
      return { withdrawals: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/withdrawals/:id/approve',
    auth: 'admin',
    idempotencyKeyRequired: true,
    input: z.object({ role: z.enum(ADMIN_ROLES) }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      if (ctx.auth.kind !== 'admin' || !ctx.auth.roles.includes(input.role)) {
        throw new ApiError('FORBIDDEN', `Approver does not hold role ${input.role}`);
      }
      try {
        // Duplicate approvals replay idempotently inside approveWithdrawal;
        // release still requires two DISTINCT admins (DB-enforced).
        const result = await approveWithdrawal(ctx.client, {
          withdrawalId: ctx.params.id!,
          adminUserId: ctx.userId,
          adminRole: input.role,
        });
        return { approved_roles: result.approvedRoles, released: result.released };
      } catch (error) {
        const message = (error as Error).message;
        if (/not in ADMIN_REVIEW/.test(message)) throw new ApiError('NOT_FOUND', message);
        throw error;
      }
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/withdrawals/:id/reject',
    auth: 'admin',
    idempotencyKeyRequired: true,
    handler: async (ctx) => {
      requireAdminRole(ctx);
      try {
        await rejectWithdrawal(ctx.client, { withdrawalId: ctx.params.id!, adminUserId: ctx.userId });
      } catch (error) {
        const message = (error as Error).message;
        if (/not in ADMIN_REVIEW/.test(message)) throw new ApiError('NOT_FOUND', message);
        throw error;
      }
      return { status: 'REJECTED' };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/policies',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const tables = [
        'liquidity_policies', 'reserve_policies', 'buff_policies', 'price_tables',
        'assignment_algorithm_versions', 'race_engine_versions', 'economy_policies',
        'horse_generation_versions',
      ];
      const policies: Record<string, unknown> = {};
      for (const table of tables) {
        const rows = await ctx.client.query(
          `select version, activated_at::text as activated_at, deactivated_at::text as deactivated_at
           from ${table} order by created_at desc limit 10`,
        );
        policies[table] = rows.rows;
      }
      return { policies };
    },
  });
}
