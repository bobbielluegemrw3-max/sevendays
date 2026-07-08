import { z } from 'zod';
import {
  computeEconomyMetrics,
  currentEconomyStatus,
} from '@sevendays/economy-engine';
import { ADMIN_ROLES } from '@sevendays/domain';
import { approveWithdrawal, rejectWithdrawal } from '@sevendays/blockchain';
import {
  approveRecovery,
  executeRecovery,
  runBatch,
  buildProductionHandlers,
} from '@sevendays/settlement-engine';
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

  // Recovery surface (Decision 067): list / detail / approve / execute.
  registry.register({
    method: 'GET',
    path: '/api/v1/admin/recovery',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select r.id, r.batch_run_id, b.batch_date::text as batch_date,
                b.status::text as batch_status, r.recovery_reason,
                r.approval_status::text as approval_status,
                r.approved_by_1, r.approved_by_2,
                r.created_at::text as created_at, r.completed_at::text as completed_at
         from recovery_snapshots r
         join batch_runs b on b.id = r.batch_run_id
         order by r.created_at desc limit 50`,
      );
      return { recoveries: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/recovery/:id',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select r.id, r.batch_run_id, b.batch_date::text as batch_date,
                b.status::text as batch_status, r.recovery_reason,
                r.approval_status::text as approval_status,
                r.approved_by_1, r.approved_by_2, r.before_snapshot_hash, r.after_snapshot_hash,
                r.created_at::text as created_at, r.completed_at::text as completed_at
         from recovery_snapshots r
         join batch_runs b on b.id = r.batch_run_id
         where r.id = $1`,
        [ctx.params.id],
      );
      if (!rows.rows[0]) throw new ApiError('RECOVERY_NOT_FOUND', 'Recovery not found');
      const logs = await ctx.client.query(
        `select actor_user_id, action, step_key, reason, result, created_at::text as created_at
         from recovery_logs where recovery_snapshot_id = $1 order by created_at`,
        [ctx.params.id],
      );
      return { ...rows.rows[0], logs: logs.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/recovery/:id/approve',
    auth: 'admin',
    idempotencyKeyRequired: true,
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const current = await ctx.client.query<{ approval_status: string }>(
        `select approval_status::text as approval_status from recovery_snapshots where id = $1`,
        [ctx.params.id],
      );
      if (!current.rows[0]) throw new ApiError('RECOVERY_NOT_FOUND', 'Recovery not found');
      if (current.rows[0].approval_status === 'APPROVED') {
        throw new ApiError('RECOVERY_ALREADY_APPROVED', 'Recovery is already fully approved');
      }
      const result = await approveRecovery(ctx.client, {
        recoveryId: ctx.params.id!,
        approverUserId: ctx.userId,
      });
      await audit(ctx, 'ADMIN_RECOVERY_APPROVE', 'recovery_snapshot', ctx.params.id!);
      return { approval_status: result.approvalStatus };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/recovery/:id/execute',
    auth: 'admin',
    idempotencyKeyRequired: true,
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const current = await ctx.client.query<{ approval_status: string; completed_at: string | null }>(
        `select approval_status::text as approval_status, completed_at::text as completed_at
         from recovery_snapshots where id = $1`,
        [ctx.params.id],
      );
      if (!current.rows[0]) throw new ApiError('RECOVERY_NOT_FOUND', 'Recovery not found');
      if (current.rows[0].completed_at !== null) {
        throw new ApiError('INVALID_RECOVERY_STATE', 'Recovery already completed');
      }
      if (current.rows[0].approval_status !== 'APPROVED') {
        throw new ApiError(
          'RECOVERY_REQUIRES_DUAL_APPROVAL',
          'Recovery must be approved by two distinct admins before execution',
        );
      }
      await audit(ctx, 'ADMIN_RECOVERY_EXECUTE', 'recovery_snapshot', ctx.params.id!);
      const result = await executeRecovery(ctx.client, {
        recoveryId: ctx.params.id!,
        executedBy: ctx.userId,
        handlers: buildProductionHandlers(),
      });
      return { batch_run_id: result.batchRunId, status: result.status };
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

  /* ---- 運営ビュー(2026-07-09): 経済・ユーザー・アイテム・レース ---------- */

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/economy/overview',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const platform = await ctx.client.query(
        `select a.account_type::text as account_type, coalesce(b.balance, 0)::text as balance
         from ledger_accounts a
         left join ledger_account_balances b on b.account_id = a.id
         where a.owner_type = 'PLATFORM'
         order by a.account_type`,
      );
      const userTotals = await ctx.client.query(
        `select a.account_type::text as account_type,
                count(distinct a.owner_id)::int as holders,
                coalesce(sum(b.balance), 0)::text as total
         from ledger_accounts a
         left join ledger_account_balances b on b.account_id = a.id
         where a.owner_type = 'USER'
         group by 1 order by 1`,
      );
      const users = await ctx.client.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'ACTIVE')::int as active
         from users`,
      );
      const horses = await ctx.client.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'ACTIVE')::int as active
         from horses`,
      );
      const recentTx = await ctx.client.query(
        `select transaction_type::text as transaction_type, count(*)::int as count,
                max(created_at)::text as last_at
         from ledger_transactions
         where created_at > now() - interval '7 days'
         group by 1 order by 2 desc limit 20`,
      );
      return {
        platform_accounts: platform.rows,
        user_totals: userTotals.rows,
        users: users.rows[0],
        horses: horses.rows[0],
        recent_transactions: recentTx.rows,
      };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/users/search',
    auth: 'admin',
    input: z.object({
      query: z.string().max(200).default(''),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select u.id, u.email, u.status::text as status, u.created_at::text as created_at,
                r.email as referrer_email,
                coalesce(b.balance, 0)::text as balance,
                (select count(*)::int from horses h where h.owner_user_id = u.id and h.status = 'ACTIVE') as active_horses,
                (select count(*)::int from horse_burns hb where hb.owner_user_id_at_snapshot = u.id) as burns,
                (select count(*)::int from user_items ui where ui.user_id = u.id and ui.status = 'AVAILABLE') as items_available,
                (select count(*)::int from users c where c.direct_referrer_user_id = u.id) as direct_referrals
         from users u
         left join users r on r.id = u.direct_referrer_user_id
         left join ledger_accounts a on a.owner_id = u.id and a.account_type = 'USER_AVAILABLE'
         left join ledger_account_balances b on b.account_id = a.id
         where $1 = '' or u.email ilike '%' || $1 || '%'
         order by u.created_at desc
         limit $2`,
        [(input.query ?? '').trim(), input.limit ?? 30],
      );
      return { users: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/users/:id',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const user = await ctx.client.query(
        `select u.id, u.email, u.status::text as status, u.created_at::text as created_at,
                r.email as referrer_email,
                coalesce(av.balance, 0)::text as balance_available,
                coalesce(lk.balance, 0)::text as balance_locked
         from users u
         left join users r on r.id = u.direct_referrer_user_id
         left join ledger_accounts aa on aa.owner_id = u.id and aa.account_type = 'USER_AVAILABLE'
         left join ledger_account_balances av on av.account_id = aa.id
         left join ledger_accounts la on la.owner_id = u.id and la.account_type = 'USER_LOCKED'
         left join ledger_account_balances lk on lk.account_id = la.id
         where u.id = $1`,
        [ctx.params.id],
      );
      if (user.rows.length === 0) throw new ApiError('NOT_FOUND', 'User not found');
      const horses = await ctx.client.query(
        `select id, name, status::text as status, current_day, rarity::text as rarity,
                horse_type::text as horse_type, created_at::text as created_at
         from horses where owner_user_id = $1
         order by created_at desc limit 50`,
        [ctx.params.id],
      );
      const items = await ctx.client.query(
        `select item_key, status, count(*)::int as count
         from user_items where user_id = $1
         group by 1, 2 order by 1, 2`,
        [ctx.params.id],
      );
      const usages = await ctx.client.query(
        `select item_key, effective_race_date::text as effective_race_date,
                status, settled_outcome
         from item_usages where user_id = $1
         order by created_at desc limit 20`,
        [ctx.params.id],
      );
      const children = await ctx.client.query(
        `select id, email, created_at::text as created_at
         from users where direct_referrer_user_id = $1
         order by created_at desc limit 100`,
        [ctx.params.id],
      );
      return {
        user: user.rows[0],
        horses: horses.rows,
        items: items.rows,
        item_usages: usages.rows,
        direct_referrals: children.rows,
      };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/items/overview',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const catalog = await ctx.client.query(
        `select c.key, c.name_ja, c.band, c.price::text as price, c.active,
                coalesce(p.cnt, 0)::int as purchased,
                coalesce(p.revenue, '0') as revenue,
                coalesce(d.cnt, 0)::int as dropped,
                coalesce(g.cnt, 0)::int as gifted,
                coalesce(u.cnt, 0)::int as used
         from item_catalog c
         left join (select item_key, count(*)::int cnt, sum(unit_price)::text revenue
                    from user_items where source = 'PURCHASE' group by 1) p on p.item_key = c.key
         left join (select item_key, count(*)::int cnt
                    from user_items where source = 'BURN_DROP' group by 1) d on d.item_key = c.key
         left join (select ui.item_key, count(*)::int cnt
                    from user_transfers t join user_items ui on ui.id = t.user_item_id
                    where t.asset_type = 'ITEM' group by 1) g on g.item_key = c.key
         left join (select item_key, count(*)::int cnt
                    from item_usages where status <> 'CANCELLED' group by 1) u on u.item_key = c.key
         order by c.band, c.price::numeric`,
      );
      const settings = await ctx.client.query(
        `select item_setting, count(*)::int as count
         from races where item_setting is not null
         group by 1 order by 1`,
      );
      return { catalog: catalog.rows, setting_distribution: settings.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/races/overview',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const races = await ctx.client.query(
        `select r.id, br.batch_date::text as batch_date, r.status::text as status,
                r.participant_count, r.item_setting,
                (select count(*)::int from horse_burns hb where hb.race_id = r.id) as burns,
                (select count(*)::int from item_usages iu where iu.race_id = r.id) as item_usages,
                r.completed_at::text as completed_at
         from races r
         join batch_runs br on br.id = r.batch_run_id
         order by br.batch_date desc, r.created_at desc
         limit 30`,
      );
      return {
        races: races.rows,
        daily_derby_live: process.env.DAILY_DERBY_LIVE === '1',
      };
    },
  });
}
