import { z } from 'zod';
import {
  SUPPORT_BONUS_MAX_TIERS_V1,
  SUPPORT_BONUS_TIER_AMOUNTS_V1,
  SUPPORT_BONUS_TIER_THRESHOLDS_V1,
} from '@sevendays/domain';
import { supportTierStatus } from '@sevendays/settlement-engine';
import { ApiError } from '../errors.js';
import type { ApiRegistry, HandlerContext } from '../router.js';

/**
 * Support Bonus surfaces (サポートボーナス, Decision 074) — the invite /
 * placement network of a user's stable.
 *
 * Naming rule (PRELAUNCH_COPY_RISKS R3): user-facing copy never says
 * MLM / commission / referral reward. Placement is ONE-SHOT for everyone
 * except the audited SUPER_ADMIN override (the DB trigger enforces both).
 */

/** Display-safe identity: `ab***@domain` — never the full address. */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return `${email.slice(0, 2)}***`;
  return `${email.slice(0, Math.min(2, at))}***@${email.slice(at + 1)}`;
}

async function auditAdmin(
  ctx: HandlerContext,
  action: string,
  referenceType: string,
  referenceId: string,
): Promise<void> {
  await ctx.client.query(
    `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id)
     values ('ADMIN', $1, $2, $3, $4)`,
    [ctx.userId, action, referenceType, referenceId],
  );
}

export function registerSupportEndpoints(registry: ApiRegistry): void {
  registry.register({
    method: 'GET',
    path: '/api/v1/support/summary',
    auth: 'user',
    handler: async (ctx) => {
      const me = await ctx.client.query<{
        referral_code: string;
        direct_referrer_user_id: string | null;
        placement_parent_user_id: string | null;
      }>(
        `select referral_code, direct_referrer_user_id, placement_parent_user_id
         from users where id = $1`,
        [ctx.userId],
      );
      if (!me.rows[0]) throw new ApiError('NOT_FOUND', 'User not found');

      const tier = await supportTierStatus(ctx.client, ctx.userId);
      const pool = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from users
         where direct_referrer_user_id = $1 and placement_parent_user_id is null`,
        [ctx.userId],
      );
      const received = await ctx.client.query<{ total: string; n: number }>(
        `select coalesce(sum(e.amount), 0)::text as total, count(*)::int as n
         from ledger_entries e
         join ledger_accounts a on a.id = e.account_id
         join ledger_transactions t on t.id = e.transaction_id
         where a.owner_type = 'USER' and a.owner_id = $1 and a.account_type = 'USER_AVAILABLE'
           and t.transaction_type = 'MLM_REWARD_PAYMENT' and e.direction = 'CREDIT'`,
        [ctx.userId],
      );

      return {
        referral_code: me.rows[0].referral_code,
        has_sponsor: me.rows[0].direct_referrer_user_id !== null,
        is_placed: me.rows[0].placement_parent_user_id !== null,
        unlocked_tiers: tier.unlockedTiers,
        volume: tier.volume,
        max_tiers: SUPPORT_BONUS_MAX_TIERS_V1,
        tier_amounts: SUPPORT_BONUS_TIER_AMOUNTS_V1,
        tier_thresholds: SUPPORT_BONUS_TIER_THRESHOLDS_V1,
        pool_count: pool.rows[0]!.n,
        bonuses_received_total: received.rows[0]!.total,
        bonuses_received_count: received.rows[0]!.n,
      };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/support/pool',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query<{ id: string; email: string; created_at: string }>(
        `select id, email, created_at::text as created_at from users
         where direct_referrer_user_id = $1 and placement_parent_user_id is null
         order by created_at asc`,
        [ctx.userId],
      );
      return {
        members: rows.rows.map((r) => ({
          user_id: r.id,
          display: maskEmail(r.email),
          joined_at: r.created_at,
        })),
      };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/support/network',
    auth: 'user',
    handler: async (ctx) => {
      // Placement subtree, payout-relevant depth only (7 tiers down).
      const rows = await ctx.client.query<{
        id: string;
        parent_id: string | null;
        depth: number;
        placed_at: string | null;
        email: string;
      }>(
        `with recursive tree as (
           select u.id, u.placement_parent_user_id as parent_id, 1 as depth, u.placed_at
           from users u where u.placement_parent_user_id = $1
           union all
           select c.id, c.placement_parent_user_id, t.depth + 1, c.placed_at
           from tree t join users c on c.placement_parent_user_id = t.id
           where t.depth < $2
         )
         select t.id, t.parent_id, t.depth, t.placed_at::text as placed_at, u.email
         from tree t join users u on u.id = t.id
         order by t.depth asc, t.placed_at asc nulls last, t.id asc
         limit 500`,
        [ctx.userId, SUPPORT_BONUS_MAX_TIERS_V1],
      );
      return {
        nodes: rows.rows.map((r) => ({
          user_id: r.id,
          parent_user_id: r.parent_id,
          tier: r.depth,
          display: maskEmail(r.email),
          placed_at: r.placed_at,
        })),
      };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/support/bonuses',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select e.amount::text as amount,
                nullif(split_part(t.idempotency_key, ':t', 2), '')::int as tier,
                t.reference_id as burn_event_id,
                e.created_at::text as created_at
         from ledger_entries e
         join ledger_accounts a on a.id = e.account_id
         join ledger_transactions t on t.id = e.transaction_id
         where a.owner_type = 'USER' and a.owner_id = $1 and a.account_type = 'USER_AVAILABLE'
           and t.transaction_type = 'MLM_REWARD_PAYMENT' and e.direction = 'CREDIT'
         order by e.created_at desc limit 100`,
        [ctx.userId],
      );
      return { bonuses: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/support/place',
    auth: 'user',
    input: z.object({
      user_id: z.string().uuid(),
      parent_user_id: z.string().uuid(),
    }),
    handler: async (ctx, input) => {
      const target = await ctx.client.query<{
        id: string;
        direct_referrer_user_id: string | null;
        placement_parent_user_id: string | null;
      }>(
        `select id, direct_referrer_user_id, placement_parent_user_id from users where id = $1`,
        [input.user_id],
      );
      if (!target.rows[0]) throw new ApiError('NOT_FOUND', 'User not found');
      // Only the sponsor may place their own referrals.
      if (target.rows[0].direct_referrer_user_id !== ctx.userId) {
        throw new ApiError('SUPPORT_NOT_YOUR_REFERRAL', 'You can only place members you invited');
      }
      if (target.rows[0].placement_parent_user_id !== null) {
        // Natural idempotency: replaying the same placement succeeds quietly.
        if (target.rows[0].placement_parent_user_id === input.parent_user_id) {
          return { user_id: input.user_id, parent_user_id: input.parent_user_id, replay: true };
        }
        throw new ApiError('SUPPORT_ALREADY_PLACED', 'Placement is permanent and cannot be changed');
      }
      // The chosen parent must be the sponsor themself or inside the
      // sponsor's own placement subtree (Decision 074).
      if (input.parent_user_id !== ctx.userId) {
        const inScope = await ctx.client.query(
          `with recursive tree as (
             select u.id, 1 as depth from users u where u.placement_parent_user_id = $1
             union all
             select c.id, t.depth + 1 from tree t
             join users c on c.placement_parent_user_id = t.id
             where t.depth < 1000
           )
           select 1 from tree where id = $2 limit 1`,
          [ctx.userId, input.parent_user_id],
        );
        if (!inScope.rows[0]) {
          throw new ApiError('SUPPORT_PARENT_OUT_OF_SCOPE', 'Placement target must be inside your own network');
        }
      }

      // Placement + audit row commit atomically. A concurrent competing
      // placement serializes on the row lock and the write-once trigger
      // rejects the loser (PLACEMENT_IMMUTABLE) — no double placement.
      await ctx.client.query('begin');
      try {
        await ctx.client.query(`update users set placement_parent_user_id = $1 where id = $2`, [
          input.parent_user_id,
          input.user_id,
        ]);
        await ctx.client.query(
          `insert into placement_audit (user_id, old_parent_user_id, new_parent_user_id, actor_user_id, action)
           values ($1, null, $2, $3, 'PLACE')`,
          [input.user_id, input.parent_user_id, ctx.userId],
        );
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/PLACEMENT_CYCLE_DETECTED/.test((error as Error).message)) {
          throw new ApiError('SUPPORT_PLACEMENT_CYCLE', 'This placement would create a cycle');
        }
        if (/PLACEMENT_IMMUTABLE/.test((error as Error).message)) {
          throw new ApiError('SUPPORT_ALREADY_PLACED', 'Placement is permanent and cannot be changed');
        }
        throw error;
      }
      const placed = await ctx.client.query<{ placed_at: string }>(
        `select placed_at::text as placed_at from users where id = $1`,
        [input.user_id],
      );
      return {
        user_id: input.user_id,
        parent_user_id: input.parent_user_id,
        placed_at: placed.rows[0]!.placed_at,
      };
    },
  });

  // Admin exception path — SUPER_ADMIN only, audited twice (placement_audit
  // + audit_logs). The session override flag is reset even on failure.
  registry.register({
    method: 'POST',
    path: '/api/v1/admin/support/replace',
    auth: 'admin',
    input: z.object({
      user_id: z.string().uuid(),
      new_parent_user_id: z.string().uuid().nullable(),
      reason: z.string().min(4).max(500),
    }),
    handler: async (ctx, input) => {
      if (ctx.auth.kind !== 'admin' || !ctx.auth.roles.includes('SUPER_ADMIN')) {
        throw new ApiError('FORBIDDEN', 'SUPER_ADMIN role required');
      }
      const target = await ctx.client.query<{ placement_parent_user_id: string | null }>(
        `select placement_parent_user_id from users where id = $1`,
        [input.user_id],
      );
      if (!target.rows[0]) throw new ApiError('NOT_FOUND', 'User not found');
      const oldParent = target.rows[0].placement_parent_user_id;

      // TRANSACTION-LOCAL override flag (is_local = true): it dies with the
      // commit/rollback, so a crashed request can never return a pooled
      // connection whose session still bypasses placement immutability.
      // The change and both audit rows commit atomically.
      await ctx.client.query('begin');
      try {
        await ctx.client.query(
          `select set_config('sevendays.placement_admin_override', 'on', true)`,
        );
        await ctx.client.query(`update users set placement_parent_user_id = $1 where id = $2`, [
          input.new_parent_user_id,
          input.user_id,
        ]);
        await ctx.client.query(
          `insert into placement_audit (user_id, old_parent_user_id, new_parent_user_id, actor_user_id, action, reason)
           values ($1, $2, $3, $4, 'ADMIN_OVERRIDE', $5)`,
          [input.user_id, oldParent, input.new_parent_user_id, ctx.userId, input.reason],
        );
        await auditAdmin(ctx, 'SUPPORT_PLACEMENT_OVERRIDE', 'user', input.user_id);
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/PLACEMENT_CYCLE_DETECTED/.test((error as Error).message)) {
          throw new ApiError('SUPPORT_PLACEMENT_CYCLE', 'This placement would create a cycle');
        }
        throw error;
      }
      return {
        user_id: input.user_id,
        old_parent_user_id: oldParent,
        new_parent_user_id: input.new_parent_user_id,
      };
    },
  });
}
