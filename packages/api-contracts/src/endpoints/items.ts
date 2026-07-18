import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Money, addDays, batchDateFor, insertNotification } from '@sevendays/shared';
import {
  AFFINITY_JA,
  ITEM_BY_KEY_V2,
  ITEM_BY_KEY_V3,
  ITEM_CATALOG_V2,
  ITEM_CATALOG_V3,
  SURFACE_JA,
  TRACK_JA,
  WEATHER_JA,
  isRaceEngineV2,
  raceNightNameV2,
  renderNotification,
  type RaceEffectV3,
  type TrainingEffectV3,
} from '@sevendays/domain';
import { getBalance, ensureUserAccounts, itemPurchase } from '@sevendays/ledger';
import { getMarketplaceState } from '@sevendays/settlement-engine';
import { ApiError } from '../errors.js';
import type { ApiRegistry, HandlerContext } from '../router.js';

/**
 * Item System APIs (Decisions 078/079, ITEM_REVISION.md).
 *
 * Money: purchases park in PLATFORM_ITEM_CLEARING; the batch settles each
 * USED unit by outcome (burn -> support reserve / survive -> operating).
 * Gifting (Decision 079) rides the generic user_transfers table — the same
 * rails planned for in-site USDT transfers.
 */

const GIFTS_PER_DAY_LIMIT = 20;

/** カタログV2(Decision 109)へのゲート: アクティブエンジンがv2か(調教APIと同じ判定)。 */
async function isEngineV2Active(ctx: HandlerContext): Promise<boolean> {
  const active = await ctx.client.query<{ version: string }>(
    `select version from race_engine_versions
     where activated_at is not null and deactivated_at is null`,
  );
  return active.rows.length === 1 && isRaceEngineV2(active.rows[0]!.version);
}

/** V2の対象サイクル = 朝→夜→翌朝の順で未COMPLETEDの最初(調教-4aと同じ規則)。 */
async function targetCycleV2(ctx: HandlerContext): Promise<{ date: string; slot: 'MORNING' | 'NIGHT' }> {
  const today = batchDateFor(new Date());
  const candidates: { date: string; slot: 'MORNING' | 'NIGHT' }[] = [
    { date: today, slot: 'MORNING' },
    { date: today, slot: 'NIGHT' },
    { date: addDays(today, 1), slot: 'MORNING' },
  ];
  for (const c of candidates) {
    const done = await ctx.client.query(
      `select 1 from batch_runs where batch_date = $1 and slot = $2::race_slot and status = 'COMPLETED'`,
      [c.date, c.slot],
    );
    if (!done.rows[0]) return c;
  }
  return candidates[candidates.length - 1]!;
}

/** Same next-race boundary as training (Decision 066). */
async function effectiveRaceDateFor(ctx: HandlerContext): Promise<string> {
  const today = batchDateFor(new Date());
  const completedToday = await ctx.client.query(
    `select 1 from batch_runs where batch_date = $1 and status = 'COMPLETED'`,
    [today],
  );
  return completedToday.rows[0] ? addDays(today, 1) : today;
}

async function catalogRow(ctx: HandlerContext, itemKey: string) {
  const row = await ctx.client.query<{
    key: string;
    price: string;
    sellable: boolean;
    giftable: boolean;
    active: boolean;
    usable_day_min: number | null;
    usable_day_max: number | null;
    item_class: 'V1' | 'TRAINING' | 'RACE';
  }>(
    `select key, price::text as price, sellable, giftable, active, usable_day_min, usable_day_max,
            item_class
     from item_catalog where key = $1`,
    [itemKey],
  );
  if (!row.rows[0] || !row.rows[0].active) {
    throw new ApiError('ITEM_NOT_FOUND', 'Unknown or discontinued item');
  }
  return row.rows[0];
}

export function registerItemEndpoints(registry: ApiRegistry): void {
  registry.register({
    method: 'GET',
    path: '/api/v1/items/catalog',
    auth: 'user',
    handler: async (ctx) => {
      const active = await ctx.client.query<{ key: string; active: boolean }>(
        `select key, active from item_catalog`,
      );
      const activeByKey = new Map(active.rows.map((r) => [r.key, r.active]));
      // カタログV2(Decision 109): V2シーズンは2分類の新カタログだけを見せる
      if (await isEngineV2Active(ctx)) {
        return {
          engine_v2: true,
          items: ITEM_CATALOG_V3.filter((i) => activeByKey.get(i.key) === true).map((i) => ({
            key: i.key,
            name_ja: i.nameJa,
            name_en: i.nameEn,
            band: i.band,
            item_class: i.itemClass,
            price: i.price,
            sellable: i.sellable,
            giftable: i.giftable,
            effect: i.effect,
            description_ja: i.descriptionJa,
          })),
        };
      }
      return {
        engine_v2: false,
        items: ITEM_CATALOG_V2.filter((i) => activeByKey.get(i.key) !== false).map((i) => ({
          key: i.key,
          name_ja: i.nameJa,
          name_en: i.nameEn,
          band: i.band,
          affinity: i.affinity,
          affinity_ja: AFFINITY_JA[i.affinity],
          price: i.price,
          sellable: i.sellable,
          giftable: i.giftable,
          usable_day_min: i.usableDayMin ?? null,
          usable_day_max: i.usableDayMax ?? null,
          description_ja: i.descriptionJa,
        })),
      };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/items/inventory',
    auth: 'user',
    handler: async (ctx) => {
      const units = await ctx.client.query<{ item_key: string; n: number }>(
        `select item_key, count(*)::int as n from user_items
         where user_id = $1 and status = 'AVAILABLE'
         group by item_key order by item_key`,
        [ctx.userId],
      );
      const pending = await ctx.client.query<{
        usage_id: string;
        horse_id: string;
        horse_name: string;
        item_key: string;
        effective_race_date: string;
      }>(
        `select u.id as usage_id, u.horse_id, h.name as horse_name, u.item_key,
                u.effective_race_date::text as effective_race_date,
                u.slot::text as slot, u.usage_kind
         from item_usages u join horses h on h.id = u.horse_id
         where u.user_id = $1 and u.status = 'PENDING'
         order by u.created_at desc`,
        [ctx.userId],
      );
      return { available: units.rows, pending: pending.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/items/purchase',
    auth: 'user',
    input: z.object({
      item_key: z.string(),
      quantity: z.number().int().min(1).max(10).default(1),
    }),
    handler: async (ctx, input) => {
      const item = await catalogRow(ctx, input.item_key);
      if (!item.sellable) throw new ApiError('ITEM_NOT_SELLABLE', 'This item cannot be purchased');
      // シーズンとカタログの整合(Decision 109): V2=新カタログのみ/V1=旧カタログのみ
      const v2Season = await isEngineV2Active(ctx);
      if (v2Season === (item.item_class === 'V1')) {
        throw new ApiError('ITEM_NOT_FOUND', 'This item is not available this season');
      }
      const quantity = input.quantity ?? 1;
      const total = Money.of(item.price).mulFloor(String(quantity));
      const accounts = await ensureUserAccounts(ctx.client, ctx.userId);
      const balance = await getBalance(ctx.client, accounts.available);
      if (Money.of(balance).lt(total)) {
        throw new ApiError('INSUFFICIENT_BALANCE', 'Not enough available balance');
      }
      await ctx.client.query('begin');
      try {
        const unitIds: string[] = [];
        for (let i = 0; i < quantity; i += 1) {
          const unit = await ctx.client.query<{ id: string }>(
            `insert into user_items (user_id, item_key, unit_price, source)
             values ($1, $2, $3, 'PURCHASE') returning id`,
            [ctx.userId, input.item_key, item.price],
          );
          unitIds.push(unit.rows[0]!.id);
        }
        await itemPurchase(
          ctx.client,
          {
            userId: ctx.userId,
            amount: total,
            idempotencyKey: `item-buy:${randomUUID()}`,
            referenceType: 'user_item',
            referenceId: unitIds[0]!,
          },
          { manageTransaction: false },
        );
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        throw error;
      }
      return { item_key: input.item_key, quantity, total: total.toString() };
    },
  });

  // Apply an owned unit to a horse for the next race (Boost Item).
  registry.register({
    method: 'POST',
    path: '/api/v1/horses/:id/item',
    auth: 'user',
    input: z.object({
      item_key: z.string(),
      // DUAL_PREP(完全装備/野営一式)の備え先グループ
      weather_group: z.enum(['RAIN_GROUP', 'SUN_GROUP']).optional(),
      track_group: z.enum(['MUD_GROUP', 'FIRM_GROUP']).optional(),
    }),
    handler: async (ctx, input) => {
      const item = await catalogRow(ctx, input.item_key);
      const horse = await ctx.client.query<{
        owner_user_id: string;
        status: string;
        current_day: number;
        name: string;
      }>(
        `select owner_user_id, status::text as status, current_day, name from horses where id = $1`,
        [ctx.params.id],
      );
      if (!horse.rows[0]) throw new ApiError('HORSE_NOT_FOUND', 'Horse not found');
      if (horse.rows[0].owner_user_id !== ctx.userId) {
        throw new ApiError('NOT_HORSE_OWNER', 'Only the owner can use items on this horse');
      }
      if (horse.rows[0].status !== 'ACTIVE') {
        throw new ApiError('HORSE_NOT_ACTIVE', `Horse is ${horse.rows[0].status}`);
      }
      // 手動出品中(Market Lock)は今夜走らない — アイテムを実消費させない(087監査)
      const marketLocked = await ctx.client.query(
        `select 1 from market_listings where horse_id = $1 and status = 'LISTED' and source = 'MANUAL'`,
        [ctx.params.id],
      );
      if (marketLocked.rows[0]) {
        throw new ApiError('HORSE_MARKET_LOCKED', 'A manually listed horse does not race tonight');
      }
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Item intake is closed during Daily Settlement');
      }
      if (
        (item.usable_day_min !== null && horse.rows[0].current_day < item.usable_day_min) ||
        (item.usable_day_max !== null && horse.rows[0].current_day > item.usable_day_max)
      ) {
        throw new ApiError(
          'ITEM_DAY_RANGE',
          `This item is usable on Day${item.usable_day_min}〜${item.usable_day_max} only`,
        );
      }

      // ---- カタログV2(Decision 109) ------------------------------------
      const v2Season = await isEngineV2Active(ctx);
      if (v2Season === (item.item_class === 'V1')) {
        throw new ApiError('ITEM_NOT_FOUND', 'This item is not available this season');
      }
      if (v2Season) {
        const def = ITEM_BY_KEY_V3.get(input.item_key);
        if (!def) throw new ApiError('ITEM_NOT_FOUND', 'Unknown item');
        // TRAINING系のうち即時適用(星霜の砂)だけがこのAPIを使う。ロール系は調教確定で添付。
        if (def.itemClass === 'TRAINING') {
          const effect = def.effect as TrainingEffectV3;
          if (effect.kind !== 'DECAY_SHIELD') {
            throw new ApiError(
              'ITEM_TRAINING_ATTACH_ONLY',
              'Attach this item on a training confirm instead',
            );
          }
          await ctx.client.query('begin');
          try {
            const unit = await ctx.client.query<{ id: string }>(
              `select id from user_items
               where user_id = $1 and item_key = $2 and status = 'AVAILABLE'
               order by acquired_at asc, id asc limit 1 for update`,
              [ctx.userId, input.item_key],
            );
            if (!unit.rows[0]) throw new ApiError('ITEM_NOT_OWNED', 'You do not own this item');
            await ctx.client.query(`update user_items set status = 'CONSUMED' where id = $1`, [unit.rows[0].id]);
            await ctx.client.query(
              `update horses set decay_shield_v2 = decay_shield_v2 + $2 where id = $1`,
              [ctx.params.id, effect.races],
            );
            await ctx.client.query('commit');
          } catch (error) {
            await ctx.client.query('rollback').catch(() => undefined);
            throw error;
          }
          return { horse_id: ctx.params.id, item_key: input.item_key, decay_shield_added: effect.races };
        }

        // RACE系: 次サイクルへの備え。DUAL_PREPは備え先グループの指定が必須。
        const effect = def.effect as RaceEffectV3;
        let params: { weatherGroup: string; trackGroup: string } | null = null;
        if (effect.kind === 'DUAL_PREP') {
          if (!input.weather_group || !input.track_group) {
            throw new ApiError('ITEM_PARAMS_REQUIRED', 'Choose a weather group and a track group');
          }
          params = { weatherGroup: input.weather_group, trackGroup: input.track_group };
        }
        const target = await targetCycleV2(ctx);
        await ctx.client.query('begin');
        try {
          const unit = await ctx.client.query<{ id: string; unit_price: string }>(
            `select id, unit_price::text as unit_price from user_items
             where user_id = $1 and item_key = $2 and status = 'AVAILABLE'
             order by acquired_at asc, id asc limit 1 for update`,
            [ctx.userId, input.item_key],
          );
          if (!unit.rows[0]) throw new ApiError('ITEM_NOT_OWNED', 'You do not own this item');
          await ctx.client.query(
            `insert into item_usages
               (user_item_id, horse_id, user_id, item_key, unit_price,
                effective_race_date, slot, usage_kind, params_json)
             values ($1, $2, $3, $4, $5, $6, $7::race_slot, 'RACE', $8)`,
            [unit.rows[0].id, ctx.params.id, ctx.userId, input.item_key, unit.rows[0].unit_price,
             target.date, target.slot, params ? JSON.stringify(params) : null],
          );
          await ctx.client.query(`update user_items set status = 'APPLIED' where id = $1`, [unit.rows[0].id]);
          await ctx.client.query('commit');
        } catch (error) {
          await ctx.client.query('rollback').catch(() => undefined);
          if (/uq_item_usage_horse_race/i.test((error as Error).message)) {
            throw new ApiError('ITEM_ALREADY_APPLIED', 'This horse already has a race item for that cycle');
          }
          throw error;
        }
        return {
          horse_id: ctx.params.id,
          item_key: input.item_key,
          effective_race_date: target.date,
          slot: target.slot,
          params,
        };
      }

      const effectiveRaceDate = await effectiveRaceDateFor(ctx);

      await ctx.client.query('begin');
      try {
        // Oldest AVAILABLE unit first; lock it against concurrent applies.
        const unit = await ctx.client.query<{ id: string; unit_price: string }>(
          `select id, unit_price::text as unit_price from user_items
           where user_id = $1 and item_key = $2 and status = 'AVAILABLE'
           order by acquired_at asc, id asc limit 1 for update`,
          [ctx.userId, input.item_key],
        );
        if (!unit.rows[0]) throw new ApiError('ITEM_NOT_OWNED', 'You do not own this item');
        await ctx.client.query(
          `insert into item_usages (user_item_id, horse_id, user_id, item_key, unit_price, effective_race_date)
           values ($1, $2, $3, $4, $5, $6)`,
          [unit.rows[0].id, ctx.params.id, ctx.userId, input.item_key, unit.rows[0].unit_price, effectiveRaceDate],
        );
        await ctx.client.query(`update user_items set status = 'APPLIED' where id = $1`, [
          unit.rows[0].id,
        ]);
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/uq_item_usage_horse_race/i.test((error as Error).message)) {
          throw new ApiError('ITEM_ALREADY_APPLIED', 'This horse already has an item for that race');
        }
        throw error;
      }
      return { horse_id: ctx.params.id, item_key: input.item_key, effective_race_date: effectiveRaceDate };
    },
  });

  // Cancel a pending usage (same next-race window; unit returns to inventory).
  registry.register({
    method: 'POST',
    path: '/api/v1/horses/:id/item/cancel',
    auth: 'user',
    handler: async (ctx) => {
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Item intake is closed during Daily Settlement');
      }
      // V2 (Decision 109): RACE系だけ取消可(凍結前)。TRAINING系は確定即最終(107)。
      const v2Season = await isEngineV2Active(ctx);
      const effectiveRaceDate = await effectiveRaceDateFor(ctx);
      await ctx.client.query('begin');
      try {
        const usage = v2Season
          ? await ctx.client.query<{ id: string; user_item_id: string }>(
              `update item_usages set status = 'CANCELLED'
               where horse_id = $1 and user_id = $2 and status = 'PENDING' and usage_kind = 'RACE'
               returning id, user_item_id`,
              [ctx.params.id, ctx.userId],
            )
          : await ctx.client.query<{ id: string; user_item_id: string }>(
          `update item_usages set status = 'CANCELLED'
           where horse_id = $1 and user_id = $2 and effective_race_date = $3 and status = 'PENDING'
           returning id, user_item_id`,
          [ctx.params.id, ctx.userId, effectiveRaceDate],
        );
        if (!usage.rows[0]) throw new ApiError('ITEM_USAGE_NOT_FOUND', 'No pending item on this horse');
        // 100点診断(2026-07-18): 複数行取消(V2は過去サイクルの残留PENDINGも同時に
        // 掃除される)で在庫を1個しか戻さないとユニットが宙に浮く — 全行ぶん戻す
        for (const row of usage.rows) {
          await ctx.client.query(`update user_items set status = 'AVAILABLE' where id = $1`, [
            row.user_item_id,
          ]);
        }
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        throw error;
      }
      return { horse_id: ctx.params.id, cancelled: true };
    },
  });

  // Item history: purchases / gifts both ways / usages, newest first.
  registry.register({
    method: 'GET',
    path: '/api/v1/items/transactions',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query<{
        id: string;
        kind: string;
        item_key: string;
        quantity: number;
        counterparty: string | null;
        horse_name: string | null;
        created_at: string;
      }>(
        `(
          -- Purchases from the ledger (inventory rows change owners via gifts,
          -- so they cannot be the source of purchase history).
          select t.id::text as id, 'PURCHASED' as kind, ui.item_key,
                 round(e.amount / ui.unit_price)::int as quantity,
                 null as counterparty, null as horse_name, t.created_at::text as created_at
          from ledger_transactions t
          join ledger_entries e on e.transaction_id = t.id and e.direction = 'DEBIT'
          join ledger_accounts a on a.id = e.account_id
            and a.owner_type = 'USER' and a.owner_id = $1 and a.account_type = 'USER_AVAILABLE'
          join user_items ui on ui.id = t.reference_id
          where t.transaction_type = 'ITEM_PURCHASE' and ui.unit_price > 0
        )
        union all
        (
          select ui.id::text, 'RECEIVED', ui.item_key, 1, null, null, ui.acquired_at::text
          from user_items ui
          where ui.user_id = $1 and ui.source = 'BURN_DROP'
        )
        union all
        (
          select min(t.id::text), 'RECEIVED', ui.item_key, count(*)::int,
                 max(coalesce(su.stable_name,
                          case when su.email like '%@user.sevendays' then 'ウォレットユーザー'
                               else left(su.email, 2) || '***' end)),
                 null, t.created_at::text
          from user_transfers t
          join user_items ui on ui.id = t.user_item_id
          join users su on su.id = t.sender_user_id
          where t.recipient_user_id = $1 and t.asset_type = 'ITEM'
          group by ui.item_key, t.created_at, t.sender_user_id
        )
        union all
        (
          select min(t.id::text), 'SENT', ui.item_key, count(*)::int,
                 max(coalesce(ru.stable_name,
                          case when ru.email like '%@user.sevendays' then 'ウォレットユーザー'
                               else left(ru.email, 2) || '***' end)),
                 null, t.created_at::text
          from user_transfers t
          join user_items ui on ui.id = t.user_item_id
          join users ru on ru.id = t.recipient_user_id
          where t.sender_user_id = $1 and t.asset_type = 'ITEM'
          group by ui.item_key, t.created_at, t.recipient_user_id
        )
        union all
        (
          select u.id::text, 'USED', u.item_key, 1, null, h.name, u.created_at::text
          from item_usages u join horses h on h.id = u.horse_id
          where u.user_id = $1 and u.status <> 'CANCELLED'
        )
        order by created_at desc
        limit 100`,
        [ctx.userId],
      );
      return { transactions: rows.rows };
    },
  });

  // Revealed race conditions (public after each race) + today's batch date.
  // Decision 082: 設定1〜6は廃止 — 天候×馬場×コースがアイテム係数を決める。
  registry.register({
    method: 'GET',
    path: '/api/v1/items/conditions',
    auth: 'user',
    handler: async (ctx) => {
      const rows = await ctx.client.query<{
        date: string; weather: string; track: string; surface: string;
      }>(
        `select b.batch_date::text as date, r.weather::text as weather,
                r.track_condition::text as track, r.surface::text as surface
         from races r
         join batch_runs b on b.id = r.batch_run_id
         where r.surface is not null and r.status = 'FINALIZED'
         order by b.batch_date desc
         limit 62`,
        [],
      );
      const history = rows.rows.reverse().map((r) => {
        const c = {
          weather: r.weather as never,
          track: r.track as never,
          surface: r.surface as never,
        };
        return {
          date: r.date,
          weather: r.weather,
          track: r.track,
          surface: r.surface,
          weather_ja: WEATHER_JA[c.weather],
          track_ja: TRACK_JA[c.track],
          surface_ja: SURFACE_JA[c.surface],
          night_name: raceNightNameV2(c),
        };
      });
      return { history, today: batchDateFor(new Date()) };
    },
  });

  // Gift units to another user by email (Decision 079; bulk since redesign).
  registry.register({
    method: 'POST',
    path: '/api/v1/items/gift',
    auth: 'user',
    input: z.object({
      recipient_email: z.string().email(),
      item_key: z.string(),
      quantity: z.number().int().min(1).max(50).default(1),
    }),
    handler: async (ctx, input) => {
      const item = await catalogRow(ctx, input.item_key);
      if (!item.giftable) throw new ApiError('ITEM_NOT_GIFTABLE', 'This item cannot be gifted');

      const recipient = await ctx.client.query<{ id: string }>(
        `select id from users where lower(email) = lower($1) and status = 'ACTIVE'`,
        [input.recipient_email],
      );
      if (!recipient.rows[0]) {
        throw new ApiError('GIFT_RECIPIENT_NOT_FOUND', 'No active user with that email');
      }
      const recipientId = recipient.rows[0].id;
      if (recipientId === ctx.userId) {
        throw new ApiError('GIFT_SELF', 'You cannot gift items to yourself');
      }
      // Anti-abuse (Decision 079): flat daily cap over ALL outgoing transfers.
      const sentToday = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from user_transfers
         where sender_user_id = $1 and created_at >= now() - interval '24 hours'`,
        [ctx.userId],
      );
      if (sentToday.rows[0]!.n >= GIFTS_PER_DAY_LIMIT) {
        throw new ApiError('GIFT_LIMIT', 'Daily transfer limit reached');
      }

      const sender = await ctx.client.query<{ email: string; stable_name: string | null }>(
        `select email, stable_name from users where id = $1`,
        [ctx.userId],
      );
      const senderEmail = sender.rows[0]!.email;
      // Decision 097: 差出人は厩舎名優先(「○○厩舎から届いた」)
      const maskedSender = sender.rows[0]!.stable_name
        ?? (senderEmail.endsWith('@user.sevendays')
          ? 'ウォレットユーザー'
          : `${senderEmail.slice(0, 2)}***`);

      const quantity = input.quantity ?? 1;
      await ctx.client.query('begin');
      try {
        const units = await ctx.client.query<{ id: string }>(
          `select id from user_items
           where user_id = $1 and item_key = $2 and status = 'AVAILABLE'
           order by acquired_at asc, id asc limit $3 for update`,
          [ctx.userId, input.item_key, quantity],
        );
        if (units.rows.length < quantity) {
          throw new ApiError('ITEM_NOT_OWNED', `You own only ${units.rows.length} of this item`);
        }
        const unitIds = units.rows.map((u) => u.id);
        await ctx.client.query(
          `update user_items set user_id = $2, source = 'GIFT' where id = any($1)`,
          [unitIds, recipientId],
        );
        for (const unitId of unitIds) {
          await ctx.client.query(
            `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, user_item_id, idempotency_key)
             values ($1, $2, 'ITEM', $3, $4)`,
            [ctx.userId, recipientId, unitId, `gift:${unitId}`],
          );
        }
        const rendered = renderNotification('ITEM_GIFT_RECEIVED', {
          sender: maskedSender,
          item_name:
            ITEM_BY_KEY_V2.get(input.item_key)?.nameJa ??
            ITEM_BY_KEY_V3.get(input.item_key)?.nameJa ??
            input.item_key,
        });
        await insertNotification(ctx.client, {
          userId: recipientId,
          type: 'ITEM_GIFT_RECEIVED',
          dedupeKey: `notif:ITEM_GIFT_RECEIVED:gift:${unitIds[0]!}`,
          payload: { ...rendered, item_key: input.item_key, quantity },
        });
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/user_transfers_idempotency_key|duplicate key/i.test((error as Error).message)) {
          throw new ApiError('ITEM_NOT_OWNED', 'Unit already transferred');
        }
        throw error;
      }
      return { item_key: input.item_key, recipient: input.recipient_email, quantity };
    },
  });
}
