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
import { ensureUserAccounts, getPlatformAccountId, postAdminAdjustment } from '@sevendays/ledger';
import { Money } from '@sevendays/shared';
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
      const user = await ctx.client.query<{ last_seen_at: string | null }>(
        `select u.id, u.email, u.status::text as status, u.created_at::text as created_at,
                u.last_seen_at::text as last_seen_at,
                (u.last_seen_at is not null and u.last_seen_at > now() - interval '5 minutes') as online,
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
      // 最終ログイン(Supabase auth)。PGlite等 auth スキーマ不在では null。
      let lastSignInAt: string | null = null;
      try {
        const r = await ctx.client.query<{ last_sign_in_at: string | null }>(
          `select last_sign_in_at::text as last_sign_in_at from auth.users where id = $1`,
          [ctx.params.id],
        );
        lastSignInAt = r.rows[0]?.last_sign_in_at ?? null;
      } catch {
        lastSignInAt = null;
      }
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
      // USDT入出金履歴
      const deposits = await ctx.client.query(
        `select amount::text as amount, status::text as status, tx_hash,
                detected_at::text as detected_at, confirmed_at::text as confirmed_at
         from blockchain_deposits where user_id = $1
         order by detected_at desc limit 15`,
        [ctx.params.id],
      );
      const withdrawals = await ctx.client.query(
        `select requested_amount::text as requested_amount, net_amount::text as net_amount,
                status::text as status, to_address, tx_hash,
                requested_at::text as requested_at
         from blockchain_withdrawals where user_id = $1
         order by requested_at desc limit 15`,
        [ctx.params.id],
      );
      // 馬購入履歴(購入セッション)
      const purchases = await ctx.client.query(
        `select status::text as status, locked_amount::text as locked_amount,
                assigned_price::text as assigned_price, refund_amount::text as refund_amount,
                created_at::text as created_at, settled_at::text as settled_at
         from purchase_sessions where user_id = $1
         order by created_at desc limit 15`,
        [ctx.params.id],
      );
      // 利確履歴(Day7走破の買戻し200 USDT × 7分割)
      const buybacks = await ctx.client.query(
        `select b.id, h.name as horse_name, b.status::text as status,
                b.total_amount::text as total_amount, b.day7_clear_date::text as day7_clear_date,
                (select count(*)::int from buyback_schedule_payments p
                  where p.buyback_schedule_id = b.id and p.status = 'PAID') as paid_count,
                (select coalesce(sum(p.amount), 0)::text from buyback_schedule_payments p
                  where p.buyback_schedule_id = b.id and p.status = 'PAID') as paid_amount
         from buyback_schedules b
         join horses h on h.id = b.horse_id
         where b.user_id = $1
         order by b.created_at desc limit 15`,
        [ctx.params.id],
      );
      // 売却履歴(マーケット出品が他オーナーへ割当てられたもの)
      const sales = await ctx.client.query(
        `select l.listing_price::text as listing_price, l.status::text as status,
                l.current_day, l.listed_at::text as listed_at, h.name as horse_name
         from market_listings l
         join horses h on h.id = l.horse_id
         where l.seller_user_id = $1
         order by l.listed_at desc limit 15`,
        [ctx.params.id],
      );
      // MLM: 上位チェーン(MAP位置)と組織規模(7段まで)
      const upline = await ctx.client.query(
        `with recursive up as (
           select u.id, u.email, u.direct_referrer_user_id, 0 as depth
           from users u where u.id = $1
           union all
           select p.id, p.email, p.direct_referrer_user_id, up.depth + 1
           from users p join up on p.id = up.direct_referrer_user_id
           where up.depth < 12
         )
         select email, depth from up where depth > 0 order by depth`,
        [ctx.params.id],
      );
      const orgSize = await ctx.client.query<{ size: number }>(
        `with recursive org as (
           select id, 0 as depth from users where id = $1
           union all
           select c.id, org.depth + 1 from users c
           join org on c.direct_referrer_user_id = org.id
           where org.depth < 7
         )
         select (count(*) - 1)::int as size from org`,
        [ctx.params.id],
      );
      const grants = await ctx.client.query(
        `select g.id, g.amount::text as amount, g.reason, g.status,
                ru.email as requested_by_email, g.created_at::text as created_at
         from admin_fund_grants g join users ru on ru.id = g.requested_by
         where g.user_id = $1
         order by g.created_at desc limit 10`,
        [ctx.params.id],
      );
      // アイテム取得履歴(購入/BURNドロップ/ギフト受領/管理付与)
      const itemAcquisitions = await ctx.client.query(
        `select item_key, source, unit_price::text as unit_price, status,
                acquired_at::text as acquired_at
         from user_items where user_id = $1
         order by acquired_at desc limit 20`,
        [ctx.params.id],
      );
      // アイテム送付履歴(送った/受け取った)
      const itemTransfers = await ctx.client.query(
        `select t.created_at::text as created_at,
                ui.item_key,
                su.email as sender_email,
                rue.email as recipient_email,
                (t.sender_user_id = $1) as is_sender
         from user_transfers t
         join user_items ui on ui.id = t.user_item_id
         join users su on su.id = t.sender_user_id
         join users rue on rue.id = t.recipient_user_id
         where t.asset_type = 'ITEM' and (t.sender_user_id = $1 or t.recipient_user_id = $1)
         order by t.created_at desc limit 20`,
        [ctx.params.id],
      );
      return {
        user: { ...user.rows[0]!, last_sign_in_at: lastSignInAt },
        horses: horses.rows,
        items: items.rows,
        item_usages: usages.rows,
        direct_referrals: children.rows,
        deposits: deposits.rows,
        withdrawals: withdrawals.rows,
        purchases: purchases.rows,
        buybacks: buybacks.rows,
        sales: sales.rows,
        upline: upline.rows,
        org_size: orgSize.rows[0]?.size ?? 0,
        fund_grants: grants.rows,
        item_acquisitions: itemAcquisitions.rows,
        item_transfers: itemTransfers.rows,
      };
    },
  });

  /* ---- 管理者アクション(2026-07-09) ------------------------------------- */

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/users/:id/grant-item',
    auth: 'admin',
    input: z.object({
      item_key: z.string().min(1).max(64),
      quantity: z.number().int().min(1).max(10),
    }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      const target = await ctx.client.query(`select id from users where id = $1`, [ctx.params.id]);
      if (target.rows.length === 0) throw new ApiError('NOT_FOUND', 'User not found');
      const item = await ctx.client.query<{ key: string }>(
        `select key from item_catalog where key = $1 and active`,
        [input.item_key],
      );
      if (item.rows.length === 0) throw new ApiError('NOT_FOUND', 'Item not found or inactive');
      const qty = input.quantity ?? 1;
      // unit_price=0: 管理付与は精算原資を持たない(BURN時のSupport原資 0)。
      // 効果はitem_keyで決まるためゲームプレイ上は購入品と同等。
      for (let i = 0; i < qty; i++) {
        await ctx.client.query(
          `insert into user_items (user_id, item_key, unit_price, source)
           values ($1, $2, 0, 'GIFT')`,
          [ctx.params.id, input.item_key],
        );
      }
      await audit(ctx, `ADMIN_ITEM_GRANT:${input.item_key}x${qty}`, 'user', ctx.params.id!);
      return { granted: qty, item_key: input.item_key };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/users/:id/status',
    auth: 'admin',
    input: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      if (ctx.params.id === ctx.userId) {
        throw new ApiError('FORBIDDEN', 'Cannot change your own account status');
      }
      const updated = await ctx.client.query<{ id: string }>(
        `update users set status = $2::user_status where id = $1 returning id`,
        [ctx.params.id, input.status],
      );
      if (updated.rows.length === 0) throw new ApiError('NOT_FOUND', 'User not found');
      await audit(ctx, `ADMIN_USER_STATUS:${input.status}`, 'user', ctx.params.id!);
      return { id: ctx.params.id, status: input.status };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/users/:id/fund-grant',
    auth: 'admin',
    idempotencyKeyRequired: true,
    input: z.object({
      amount: z.number().positive().max(100000),
      reason: z.string().min(1).max(500),
    }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      const target = await ctx.client.query(`select id from users where id = $1`, [ctx.params.id]);
      if (target.rows.length === 0) throw new ApiError('NOT_FOUND', 'User not found');
      // 憲法: Admin adjustments require dual approval — まず申請(PENDING)を作る。
      const row = await ctx.client.query<{ id: string }>(
        `insert into admin_fund_grants (user_id, amount, reason, requested_by, idempotency_key)
         values ($1, $2, $3, $4, $5)
         on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
         returning id`,
        [ctx.params.id, input.amount, input.reason, ctx.userId, ctx.idempotencyKey],
      );
      await audit(ctx, 'ADMIN_FUND_GRANT_REQUESTED', 'admin_fund_grant', row.rows[0]!.id);
      return { id: row.rows[0]!.id, status: 'PENDING' };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/fund-grants',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select g.id, g.amount::text as amount, g.reason, g.status,
                g.created_at::text as created_at, g.approved_at::text as approved_at,
                u.email as user_email, ru.email as requested_by_email, g.requested_by
         from admin_fund_grants g
         join users u on u.id = g.user_id
         join users ru on ru.id = g.requested_by
         order by (g.status = 'PENDING') desc, g.created_at desc
         limit 50`,
      );
      return { grants: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/fund-grants/:id/approve',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const grant = await ctx.client.query<{
        id: string; user_id: string; amount: string; reason: string;
        requested_by: string; status: string; idempotency_key: string;
      }>(
        `select id, user_id, amount::text as amount, reason, requested_by, status, idempotency_key
         from admin_fund_grants where id = $1`,
        [ctx.params.id],
      );
      const g = grant.rows[0];
      if (!g) throw new ApiError('NOT_FOUND', 'Grant not found');
      if (g.status !== 'PENDING') throw new ApiError('GRANT_NOT_PENDING', `Grant is ${g.status}`);
      if (g.requested_by === ctx.userId) {
        throw new ApiError('FORBIDDEN', 'Dual approval requires a different admin');
      }
      const user = await ensureUserAccounts(ctx.client, g.user_id);
      // ⚠️ テストネット(Amoy)運用中の暫定原資(2026-07-13): デバッグ体験用の
      // テストUSDT付与のため、マイナス許容の入金クリアリング勘定から出す
      // (2026-07-03のbobbi宛500付与と同じ仕訳)。運営準備金(残9.40)では枯渇する。
      // メインネット移行時に必ず PLATFORM_OPERATING_RESERVE へ戻すこと
      // (HANDOVER.md メインネット移行チェックリストに記載)。
      const source = await getPlatformAccountId(ctx.client, 'PLATFORM_DEPOSIT_CLEARING');
      const amount = Money.of(g.amount);
      // postAdminAdjustment が二重承認(FINANCE_ADMIN+SUPER_ADMIN の合算)と
      // 監査ログをアトミックに強制する。
      const posted = await postAdminAdjustment(ctx.client, {
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: `admin-fund-grant:${g.id}`,
        referenceType: 'admin_fund_grant',
        referenceId: g.id,
        reason: g.reason,
        approvedBy1: g.requested_by,
        approvedBy2: ctx.userId,
        entries: [
          { accountId: source, direction: 'DEBIT', amount },
          { accountId: user.available, direction: 'CREDIT', amount },
        ],
      });
      await ctx.client.query(
        `update admin_fund_grants
         set status = 'APPROVED', approved_by = $2, approved_at = now(), ledger_transaction_id = $3
         where id = $1`,
        [g.id, ctx.userId, posted.transactionId],
      );
      return { id: g.id, status: 'APPROVED', ledger_transaction_id: posted.transactionId };
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
      const conditions = await ctx.client.query(
        `select weather::text as weather, track_condition::text as track,
                surface::text as surface, count(*)::int as count
         from races where surface is not null
         group by 1, 2, 3 order by 4 desc`,
      );
      return { catalog: catalog.rows, condition_distribution: conditions.rows };
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
                r.participant_count, r.weather::text as weather,
                r.track_condition::text as track_condition, r.surface::text as surface,
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
        // 2026-07-12: /races は本番モード固定(旧 DAILY_DERBY_LIVE env 廃止)
        daily_derby_live: true,
      };
    },
  });
}
