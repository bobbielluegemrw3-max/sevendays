import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Money, addDays, batchDateFor, insertNotification } from '@sevendays/shared';
import {
  ITEM_BY_KEY_V1,
  ITEM_CATALOG_V1,
  renderNotification,
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
  }>(
    `select key, price::text as price, sellable, giftable, active, usable_day_min, usable_day_max
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
      return {
        items: ITEM_CATALOG_V1.filter((i) => activeByKey.get(i.key) !== false).map((i) => ({
          key: i.key,
          name_ja: i.nameJa,
          name_en: i.nameEn,
          band: i.band,
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
                u.effective_race_date::text as effective_race_date
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
    input: z.object({ item_key: z.string() }),
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
      const effectiveRaceDate = await effectiveRaceDateFor(ctx);
      await ctx.client.query('begin');
      try {
        const usage = await ctx.client.query<{ id: string; user_item_id: string }>(
          `update item_usages set status = 'CANCELLED'
           where horse_id = $1 and user_id = $2 and effective_race_date = $3 and status = 'PENDING'
           returning id, user_item_id`,
          [ctx.params.id, ctx.userId, effectiveRaceDate],
        );
        if (!usage.rows[0]) throw new ApiError('ITEM_USAGE_NOT_FOUND', 'No pending item on this horse');
        await ctx.client.query(`update user_items set status = 'AVAILABLE' where id = $1`, [
          usage.rows[0].user_item_id,
        ]);
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        throw error;
      }
      return { horse_id: ctx.params.id, cancelled: true };
    },
  });

  // Gift a unit to another user by email (Decision 079).
  registry.register({
    method: 'POST',
    path: '/api/v1/items/gift',
    auth: 'user',
    input: z.object({
      recipient_email: z.string().email(),
      item_key: z.string(),
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

      const sender = await ctx.client.query<{ email: string }>(
        `select email from users where id = $1`,
        [ctx.userId],
      );
      const senderEmail = sender.rows[0]!.email;
      const maskedSender = senderEmail.endsWith('@user.sevendays')
        ? 'ウォレットユーザー'
        : `${senderEmail.slice(0, 2)}***`;

      await ctx.client.query('begin');
      try {
        const unit = await ctx.client.query<{ id: string }>(
          `select id from user_items
           where user_id = $1 and item_key = $2 and status = 'AVAILABLE'
           order by acquired_at asc, id asc limit 1 for update`,
          [ctx.userId, input.item_key],
        );
        if (!unit.rows[0]) throw new ApiError('ITEM_NOT_OWNED', 'You do not own this item');
        await ctx.client.query(
          `update user_items set user_id = $2, source = 'GIFT' where id = $1`,
          [unit.rows[0].id, recipientId],
        );
        await ctx.client.query(
          `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, user_item_id, idempotency_key)
           values ($1, $2, 'ITEM', $3, $4)`,
          [ctx.userId, recipientId, unit.rows[0].id, `gift:${unit.rows[0].id}`],
        );
        const rendered = renderNotification('ITEM_GIFT_RECEIVED', {
          sender: maskedSender,
          item_name: ITEM_BY_KEY_V1.get(input.item_key)?.nameJa ?? input.item_key,
        });
        await insertNotification(ctx.client, {
          userId: recipientId,
          type: 'ITEM_GIFT_RECEIVED',
          dedupeKey: `notif:ITEM_GIFT_RECEIVED:gift:${unit.rows[0].id}`,
          payload: { ...rendered, item_key: input.item_key },
        });
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        if (/user_transfers_idempotency_key|duplicate key/i.test((error as Error).message)) {
          throw new ApiError('ITEM_NOT_OWNED', 'Unit already transferred');
        }
        throw error;
      }
      return { item_key: input.item_key, recipient: input.recipient_email };
    },
  });
}
