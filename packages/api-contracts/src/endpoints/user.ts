import { z } from 'zod';
import { Money, batchDateFor, addDays, insertNotification } from '@sevendays/shared';
import {
  MIN_WITHDRAWAL_AMOUNT,
  DEFAULT_CHAIN,
  TRAINING_TYPES,
  renderNotification,
} from '@sevendays/domain';
import { ensureUserAccounts, getBalance, withdrawalFundLock } from '@sevendays/ledger';
import {
  cancelPurchaseSession,
  createPurchaseSession,
  getMarketplaceState,
  verifyReplayInputs,
} from '@sevendays/settlement-engine';
import { verifyWalletLink } from '@sevendays/blockchain';
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
      // trained_for_next_race mirrors the POST /training target: today's race
      // unless today's batch already completed (then tonight's training was
      // recorded against tomorrow's race).
      const today = batchDateFor(new Date());
      const completedToday = await ctx.client.query(
        `select 1 from batch_runs where batch_date = $1 and status = 'COMPLETED'`,
        [today],
      );
      const effectiveRaceDate = completedToday.rows[0] ? addDays(today, 1) : today;
      const rows = await ctx.client.query(
        `select h.id, h.name, h.status::text as status, h.current_day, h.horse_type::text as horse_type,
                h.rarity::text as rarity, h.condition::text as condition, h.fatigue::text as fatigue,
                h.dna_hash,
                exists(
                  select 1 from training_sessions t
                  where t.horse_id = h.id and t.effective_race_date = $2
                ) as trained_for_next_race
         from horses h where h.owner_user_id = $1 order by h.created_at desc limit 100`,
        [ctx.userId, effectiveRaceDate],
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

  // Wallet <-> account linking (Decision 072). Linking requires a fresh
  // personal_sign proof; a wallet maps to exactly one game account.
  registry.register({
    method: 'GET',
    path: '/api/v1/account/wallets',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select wallet_address, created_at::text as created_at
         from user_wallets where user_id = $1 order by created_at`,
        [ctx.userId],
      );
      return { wallets: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/account/link-wallet',
    auth: 'user',
    input: z.object({
      address: z.string().min(4),
      message: z.string().min(10).max(500),
      signature: z.string().min(10),
    }),
    handler: async (ctx, input) => {
      const verified = await verifyWalletLink({
        userId: ctx.userId,
        address: input.address,
        message: input.message,
        signature: input.signature,
      });
      if (!verified.ok) {
        throw new ApiError('WALLET_SIGNATURE_INVALID', `Wallet proof rejected: ${verified.reason}`);
      }
      try {
        await ctx.client.query(
          `insert into user_wallets (user_id, wallet_address) values ($1, $2)`,
          [ctx.userId, verified.address],
        );
      } catch (error) {
        if (/uq_user_wallet_address|duplicate key/i.test((error as Error).message)) {
          throw new ApiError(
            'WALLET_ALREADY_LINKED',
            'This wallet is already linked to an account (each wallet can belong to exactly one account)',
          );
        }
        throw error;
      }
      return { linked: verified.address };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/account/unlink-wallet',
    auth: 'user',
    input: z.object({ address: z.string().min(4) }),
    handler: async (ctx, input) => {
      const removed = await ctx.client.query(
        `delete from user_wallets where user_id = $1 and wallet_address = lower($2)`,
        [ctx.userId, input.address],
      );
      if ((removed.affectedRows ?? 0) === 0) throw new ApiError('NOT_FOUND', 'Wallet not linked');
      return { unlinked: input.address.toLowerCase() };
    },
  });

  // Daily training selection (Decision 066). One per horse per
  // effective_race_date (DB unique); the day's intake closes at Batch Lock.
  registry.register({
    method: 'POST',
    path: '/api/v1/horses/:id/training',
    auth: 'user',
    input: z.object({ training_type: z.string() }),
    handler: async (ctx, input) => {
      if (!(TRAINING_TYPES as readonly string[]).includes(input.training_type)) {
        throw new ApiError(
          'INVALID_TRAINING_TYPE',
          `training_type must be one of: ${TRAINING_TYPES.join(', ')}`,
        );
      }
      const horse = await ctx.client.query<{ owner_user_id: string; name: string; status: string }>(
        `select owner_user_id, name, status::text as status from horses where id = $1`,
        [ctx.params.id],
      );
      if (!horse.rows[0]) throw new ApiError('HORSE_NOT_FOUND', 'Horse not found');
      if (horse.rows[0].owner_user_id !== ctx.userId) {
        throw new ApiError('NOT_HORSE_OWNER', 'Only the owner can train this horse');
      }
      // Burned/memorialized/Day7 horses never race again — accepting their
      // training (and notifying "applied") would be a lie.
      if (horse.rows[0].status !== 'ACTIVE') {
        throw new ApiError('HORSE_NOT_ACTIVE', `Horse is ${horse.rows[0].status}; only ACTIVE horses can train`);
      }

      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', "Training intake is closed during Daily Settlement");
      }

      // While OPEN the training targets the next race to run: today's race
      // unless today's batch already completed (post-race evening).
      const today = batchDateFor(new Date());
      const completedToday = await ctx.client.query(
        `select 1 from batch_runs where batch_date = $1 and status = 'COMPLETED'`,
        [today],
      );
      const effectiveRaceDate = completedToday.rows[0] ? addDays(today, 1) : today;

      const snapshot = await ctx.client.query(
        `select 1
         from race_participant_snapshots s
         join races r on r.id = s.race_id
         join batch_runs b on b.id = r.batch_run_id
         where s.horse_id = $1 and b.batch_date = $2`,
        [ctx.params.id, effectiveRaceDate],
      );
      if (snapshot.rows[0]) {
        throw new ApiError('RACE_SNAPSHOT_ALREADY_CREATED', 'The race snapshot is already frozen');
      }

      // Training row + notification are one atomic unit — a crash can never
      // record the training while dropping its notification (or vice versa).
      try {
        await ctx.client.query('begin');
        await ctx.client.query(
          `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date)
           values ($1, $2, $3::training_type, $4, $5)`,
          [ctx.params.id, ctx.userId, input.training_type, today, effectiveRaceDate],
        );
        const rendered = renderNotification('TRAINING_COMPLETED', {
          horse_name: horse.rows[0].name,
          training_type: input.training_type,
        });
        await insertNotification(ctx.client, {
          userId: ctx.userId,
          type: 'TRAINING_COMPLETED',
          dedupeKey: `notif:TRAINING_COMPLETED:${ctx.params.id}:${effectiveRaceDate}`,
          payload: { ...rendered, horse_id: ctx.params.id, training_type: input.training_type },
        });
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/uq_training_horse_race_date|duplicate key/i.test((error as Error).message)) {
          throw new ApiError('TRAINING_ALREADY_EXISTS', 'This horse already trained for that race');
        }
        throw error;
      }

      return {
        horse_id: ctx.params.id,
        training_type: input.training_type,
        effective_race_date: effectiveRaceDate,
      };
    },
  });

  // Own-session list (the UI showed only the latest session, hiding the
  // rest — production finding, 2026-07-04). Same visibility rules as
  // GET /purchase/{id}.
  registry.register({
    method: 'GET',
    path: '/api/v1/purchase',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query(
        `select id, status::text as status, locked_amount::text as locked_amount,
                assigned_price::text as assigned_price, refund_amount::text as refund_amount,
                created_at::text as created_at
         from purchase_sessions where user_id = $1 order by created_at desc limit 20`,
        [ctx.userId],
      );
      return { sessions: rows.rows };
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
         from notifications
         where user_id = $1 or user_id is null -- broadcasts (Decision 065)
         order by created_at desc limit 50`,
        [ctx.userId],
      );
      return { notifications: rows.rows };
    },
  });
}
