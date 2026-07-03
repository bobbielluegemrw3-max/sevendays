import { z } from 'zod';
import { Money } from '@sevendays/shared';
import { MIN_WITHDRAWAL_AMOUNT, DEFAULT_CHAIN } from '@sevendays/domain';
import { ensureUserAccounts, getBalance, withdrawalFundLock } from '@sevendays/ledger';
import {
  cancelPurchaseSession,
  createPurchaseSession,
  verifyReplayInputs,
} from '@sevendays/settlement-engine';
import { ApiError } from '../errors.js';
import type { ApiRegistry } from '../router.js';

/** User APIs (07_API.md) — JWT auth; reads are RLS-shaped (own rows only). */
export function registerUserEndpoints(registry: ApiRegistry): void {
  registry.register({
    method: 'GET',
    path: '/api/v1/me',
    auth: 'user',
    handler: async (ctx) => {
      const r = await ctx.client.query<{ id: string; email: string; status: string; created_at: string }>(
        `select id, email, status::text as status, created_at::text as created_at from users where id = $1`,
        [ctx.userId],
      );
      if (!r.rows[0]) throw new ApiError('NOT_FOUND', 'User not found');
      return r.rows[0];
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/wallet',
    auth: 'user',
    handler: async (ctx) => {
      const accounts = await ensureUserAccounts(ctx.client, ctx.userId);
      return {
        available: await getBalance(ctx.client, accounts.available),
        locked: await getBalance(ctx.client, accounts.locked),
        currency: 'USDT',
      };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/wallet/history',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select t.transaction_type::text as type, e.direction::text as direction,
                e.amount::text as amount, a.account_type::text as account,
                t.reference_type, t.reference_id, e.created_at::text as created_at
         from ledger_entries e
         join ledger_accounts a on a.id = e.account_id
         join ledger_transactions t on t.id = e.transaction_id
         where a.owner_type = 'USER' and a.owner_id = $1
         order by e.created_at desc limit 100`,
        [ctx.userId],
      );
      return { entries: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/wallet/deposit',
    auth: 'user',
    handler: async (ctx) => {
      const address = await ctx.client.query<{ address: string; chain_id: string }>(
        `select address, chain_id from deposit_addresses where user_id = $1 and chain_id = $2`,
        [ctx.userId, DEFAULT_CHAIN],
      );
      if (!address.rows[0]) {
        // HD address provisioning is the Phase 12 deposit worker's job.
        throw new ApiError('DEPOSIT_ADDRESS_UNAVAILABLE', 'Deposit address not yet provisioned');
      }
      return { ...address.rows[0], asset: 'USDT', confirmations_required: 128 };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/wallet/withdraw',
    auth: 'user',
    idempotencyKeyRequired: true,
    input: z.object({
      // Decision 064: at most 6 decimals (Polygon USDT on-chain scale).
      amount: z
        .string()
        .regex(/^\d+(\.\d{1,6})?$/, 'amount must be a decimal string with at most 6 decimal places'),
      to_address: z.string().min(4),
    }),
    handler: async (ctx, input) => {
      const amount = Money.of(input.amount);
      if (amount.lt(MIN_WITHDRAWAL_AMOUNT)) {
        throw new ApiError('WITHDRAWAL_BELOW_MINIMUM', `Minimum withdrawal is ${MIN_WITHDRAWAL_AMOUNT} USDT`);
      }
      // replay: same idempotency key returns the original request
      const existing = await ctx.client.query<{ id: string; status: string }>(
        `select w.id, w.status::text as status from blockchain_withdrawals w
         join ledger_transactions t on t.id = w.ledger_transaction_id
         where t.idempotency_key = $1`,
        [`wdlock:${ctx.idempotencyKey}`],
      );
      if (existing.rows[0]) return existing.rows[0];

      // Ledger fund lock BEFORE any broadcast (01_CONSTITUTION.md).
      const lock = await withdrawalFundLock(ctx.client, {
        userId: ctx.userId,
        amount,
        idempotencyKey: `wdlock:${ctx.idempotencyKey}`,
      });
      const row = await ctx.client.query<{ id: string; status: string }>(
        `insert into blockchain_withdrawals
           (user_id, chain_id, token_contract, to_address, requested_amount, network_fee_amount, net_amount,
            status, ledger_transaction_id)
         values ($1, $2, 'USDT', $3, $4, 0, $4, 'LOCKED', $5)
         returning id, status::text as status`,
        [ctx.userId, DEFAULT_CHAIN, input.to_address, amount.toFixed8(), lock.transactionId],
      );
      return row.rows[0]!;
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/horses',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, name, status::text as status, current_day, horse_type::text as horse_type,
                rarity::text as rarity, condition::text as condition, fatigue::text as fatigue
         from horses where owner_user_id = $1 order by created_at desc limit 100`,
        [ctx.userId],
      );
      return { horses: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/horses/:id',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, name, status::text as status, current_day, horse_type::text as horse_type,
                rarity::text as rarity, dna_hash, dna_modifier::text as dna_modifier,
                ability_json, condition::text as condition, fatigue::text as fatigue,
                mint_seed_hash, horse_generation_version
         from horses where id = $1 and owner_user_id = $2`,
        [ctx.params.id, ctx.userId],
      );
      if (!rows.rows[0]) throw new ApiError('NOT_FOUND', 'Horse not found');
      return rows.rows[0];
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/purchase',
    auth: 'user',
    idempotencyKeyRequired: true,
    handler: async (ctx) => {
      const result = await createPurchaseSession(ctx.client, {
        userId: ctx.userId,
        idempotencyKey: ctx.idempotencyKey!,
      });
      return { purchase_session_id: result.sessionId, already_exists: result.alreadyExists };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/purchase/:id/cancel',
    auth: 'user',
    handler: async (ctx) => {
      await cancelPurchaseSession(ctx.client, { sessionId: ctx.params.id!, userId: ctx.userId });
      return { cancelled: true };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/purchase/:id',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, status::text as status, locked_amount::text as locked_amount,
                assigned_price::text as assigned_price, refund_amount::text as refund_amount,
                created_at::text as created_at, settled_at::text as settled_at
         from purchase_sessions where id = $1 and user_id = $2`,
        [ctx.params.id, ctx.userId],
      );
      if (!rows.rows[0]) throw new ApiError('NOT_FOUND', 'Purchase session not found');
      return rows.rows[0];
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/assignments',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, horse_id, assigned_price::text as assigned_price, status::text as status,
                (market_listing_id is null) as was_day0_mint, created_at::text as created_at
         from ownership_assignments
         where buyer_user_id = $1 or seller_user_id = $1
         order by created_at desc limit 100`,
        [ctx.userId],
      );
      return { assignments: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/races',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select r.id, r.status::text as status, r.participant_count,
                b.batch_date::text as batch_date, r.race_engine_version
         from races r join batch_runs b on b.id = r.batch_run_id
         order by b.batch_date desc limit 30`,
      );
      return { races: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/races/:id',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select r.id, r.status::text as status, r.participant_count, r.race_engine_version,
                b.batch_date::text as batch_date,
                rc.commit_hash as seed_hash, rc.reveal_seed as revealed_seed
         from races r
         join batch_runs b on b.id = r.batch_run_id
         join randomness_commits rc on rc.id = r.seed_commit_id
         where r.id = $1`,
        [ctx.params.id],
      );
      if (!rows.rows[0]) throw new ApiError('NOT_FOUND', 'Race not found');
      return rows.rows[0];
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/races/:id/results',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select horse_id, final_score::text as final_score, final_rank, is_burned
         from race_results where race_id = $1 order by final_rank limit 1000`,
        [ctx.params.id],
      );
      return { results: rows.rows };
    },
  });

  // Race Replay verification: recompute everything from the revealed seed
  // and the immutable snapshot — anyone can audit any race.
  registry.register({
    method: 'GET',
    path: '/api/v1/races/:id/replay',
    auth: 'user',
    handler: async (ctx) => {
      const race = await ctx.client.query<{ race_engine_version: string }>(
        `select race_engine_version from races where id = $1`,
        [ctx.params.id],
      );
      if (!race.rows[0]) throw new ApiError('NOT_FOUND', 'Race not found');
      try {
        await verifyReplayInputs(ctx.client, ctx.params.id!, race.rows[0].race_engine_version);
        return { race_id: ctx.params.id, verified: true };
      } catch (error) {
        return {
          race_id: ctx.params.id,
          verified: false,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/revenge-buffs/current',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select buff_rarity::text as buff_rarity, buff_bonus_score::text as buff_bonus_score,
                status::text as status, applied_horse_id, generated_at::text as generated_at
         from revenge_buffs where user_id = $1 and status in ('ACTIVE', 'APPLIED')`,
        [ctx.userId],
      );
      if (!rows.rows[0]) throw new ApiError('REVENGE_BUFF_NOT_FOUND', 'No live revenge buff');
      return rows.rows[0];
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/buybacks',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select s.id, s.horse_id, s.status::text as status, s.total_amount::text as total_amount,
                s.day7_clear_date::text as day7_clear_date,
                (select count(*) from buyback_schedule_payments p
                 where p.buyback_schedule_id = s.id and p.status = 'PAID') as payments_paid
         from buyback_schedules s where s.user_id = $1 order by s.created_at desc`,
        [ctx.userId],
      );
      return { buybacks: rows.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/buybacks/:id',
    auth: 'user',
    handler: async (ctx) => {
      const schedule = await ctx.client.query(
        `select id, horse_id, status::text as status, total_amount::text as total_amount,
                day7_clear_date::text as day7_clear_date
         from buyback_schedules where id = $1 and user_id = $2`,
        [ctx.params.id, ctx.userId],
      );
      if (!schedule.rows[0]) throw new ApiError('BUYBACK_NOT_FOUND', 'Buyback schedule not found');
      const payments = await ctx.client.query(
        `select payment_number, due_date::text as due_date, amount::text as amount,
                status::text as status, paid_at::text as paid_at
         from buyback_schedule_payments where buyback_schedule_id = $1 order by payment_number`,
        [ctx.params.id],
      );
      return { ...schedule.rows[0], payments: payments.rows };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/notifications',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, notification_type, payload_json, read_at::text as read_at, created_at::text as created_at
         from notifications where user_id = $1 order by created_at desc limit 50`,
        [ctx.userId],
      );
      return { notifications: rows.rows };
    },
  });
}
