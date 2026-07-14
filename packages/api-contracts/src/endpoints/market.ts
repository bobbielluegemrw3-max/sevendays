import { z } from 'zod';
import { batchDateFor } from '@sevendays/shared';
import { PRICE_TABLE_V1 } from '@sevendays/domain';
import { getMarketplaceState, manualMarketTiebreakScore } from '@sevendays/settlement-engine';
import { ApiError } from '../errors.js';
import type { ApiRegistry } from '../router.js';

/**
 * Visible marketplace + manual listings (Decision 076).
 *
 * The buy side stays reservation-based (POST /purchase, unchanged); this
 * module adds the SELL side and the visible "place":
 *   - POST /market/list    — list an ACTIVE Day1-6 horse at the CURRENT
 *     ladder price (no free pricing). Market Lock: the horse stops racing
 *     while listed (snapshot exclusion lives in the settlement engine).
 *   - POST /market/unlist  — request delisting; takes effect AFTER the next
 *     batch (tonight's matching still sees the listing; a sale wins).
 *   - GET  /market/place   — the shelf (all LISTED horses in matching
 *     order), tonight's demand count, recent matches (anonymized), and the
 *     caller's own manual listings.
 * Listing operations are limited to ONE per horse per day.
 */

/** Display-safe buyer handle for the public match feed (never a wallet). */
function maskedUser(id: string): string {
  return `U-${id.slice(0, 4)}`;
}

export function registerMarketEndpoints(registry: ApiRegistry): void {
  registry.register({
    method: 'POST',
    path: '/api/v1/market/list',
    auth: 'user',
    input: z.object({ horse_id: z.string().uuid() }),
    handler: async (ctx, input) => {
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Marketplace is locked during settlement');
      }
      const horse = await ctx.client.query<{
        owner_user_id: string;
        status: string;
        current_day: number;
        last_manual_market_action_date: string | null;
        gifted_at: string | null;
      }>(
        `select owner_user_id, status::text as status, current_day,
                last_manual_market_action_date::text as last_manual_market_action_date,
                gifted_at::text as gifted_at
         from horses where id = $1`,
        [input.horse_id],
      );
      if (!horse.rows[0]) throw new ApiError('HORSE_NOT_FOUND', 'Horse not found');
      const h = horse.rows[0];
      if (h.owner_user_id !== ctx.userId) throw new ApiError('NOT_HORSE_OWNER', 'Not your horse');
      if (h.status !== 'ACTIVE') throw new ApiError('HORSE_NOT_ACTIVE', 'Horse is not active');
      // Decision 094: 譲渡された馬は手動出品不可(意図的な換金操作だけを塞ぐ。
      // スマート出品の対象からは除外しない — 売却回避メタを作らないため)。
      if (h.gifted_at) {
        throw new ApiError('HORSE_GIFTED_NO_MANUAL_LISTING', 'Gifted horses cannot be listed manually');
      }
      if (h.current_day < 1 || h.current_day > 6) {
        throw new ApiError('MARKET_DAY_RANGE', 'Only Day1-Day6 horses can be listed');
      }
      const today = batchDateFor(new Date());
      if (h.last_manual_market_action_date === today) {
        throw new ApiError('MARKET_ACTION_LIMIT', 'One listing operation per horse per day');
      }
      const live = await ctx.client.query<{ id: string; source: string }>(
        `select id, source from market_listings where horse_id = $1 and status = 'LISTED'`,
        [input.horse_id],
      );
      if (live.rows[0]) {
        throw new ApiError('MARKET_ALREADY_LISTED', 'This horse is already listed');
      }

      const price = PRICE_TABLE_V1[h.current_day]!;
      const listedAtIso = new Date().toISOString();
      const inserted = await ctx.client.query<{ id: string; listed_at: string }>(
        `insert into market_listings
           (horse_id, seller_user_id, listing_price, current_day, batch_run_id,
            deterministic_market_tiebreak_score, source)
         values ($1, $2, $3, $4, null, $5, 'MANUAL')
         on conflict (horse_id) where status = 'LISTED' do nothing
         returning id, listed_at::text as listed_at`,
        [
          input.horse_id,
          ctx.userId,
          price,
          h.current_day,
          manualMarketTiebreakScore(input.horse_id, listedAtIso),
        ],
      );
      if (!inserted.rows[0]) {
        // lost a race against another listing writer — same outcome as the pre-check
        throw new ApiError('MARKET_ALREADY_LISTED', 'This horse is already listed');
      }
      await ctx.client.query(
        `update horses set last_manual_market_action_date = $2::date, last_listed_at = now()
         where id = $1`,
        [input.horse_id, today],
      );
      return {
        listing_id: inserted.rows[0].id,
        horse_id: input.horse_id,
        price,
        listed_at: inserted.rows[0].listed_at,
        race_ineligible_while_listed: true,
      };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/market/unlist',
    auth: 'user',
    input: z.object({ horse_id: z.string().uuid() }),
    handler: async (ctx, input) => {
      if ((await getMarketplaceState(ctx.client)) !== 'OPEN') {
        throw new ApiError('MARKETPLACE_LOCKED', 'Marketplace is locked during settlement');
      }
      const listing = await ctx.client.query<{ id: string; cancel_after_batch: boolean }>(
        `select l.id, l.cancel_after_batch
         from market_listings l
         where l.horse_id = $1 and l.seller_user_id = $2
           and l.status = 'LISTED' and l.source = 'MANUAL'`,
        [input.horse_id, ctx.userId],
      );
      if (!listing.rows[0]) throw new ApiError('NOT_FOUND', 'No manual listing for this horse');
      // Replaying an identical unlist converges quietly (no daily-action cost).
      if (listing.rows[0].cancel_after_batch) {
        return { listing_id: listing.rows[0].id, cancel_pending: true, replay: true };
      }
      const today = batchDateFor(new Date());
      const acted = await ctx.client.query<{ d: string | null }>(
        `select last_manual_market_action_date::text as d from horses where id = $1`,
        [input.horse_id],
      );
      if (acted.rows[0]?.d === today) {
        throw new ApiError('MARKET_ACTION_LIMIT', 'One listing operation per horse per day');
      }
      await ctx.client.query(
        `update market_listings set cancel_after_batch = true where id = $1`,
        [listing.rows[0].id],
      );
      await ctx.client.query(
        `update horses set last_manual_market_action_date = $2::date where id = $1`,
        [input.horse_id, today],
      );
      return { listing_id: listing.rows[0].id, cancel_pending: true };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/market/place',
    auth: 'user',
    handler: async (ctx) => {
      // The shelf, in tonight's matching order (Decision 012: oldest first).
      const shelf = await ctx.client.query(
        `select l.id as listing_id, l.horse_id, l.listing_price::text as price,
                l.current_day, l.listed_at::text as listed_at,
                h.name, h.dna_hash, h.horse_type::text as horse_type, h.rarity::text as rarity
         from market_listings l
         join horses h on h.id = l.horse_id
         where l.status = 'LISTED' and h.status = 'ACTIVE' and l.current_day between 1 and 6
         order by l.listed_at asc, l.current_day desc, l.horse_id asc
         limit 200`,
      );
      const demand = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from purchase_sessions where status = 'PENDING_ASSIGNMENT'`,
      );
      // Decision 085: SOLDカード用にアート素材(dna_hash/rarity)を含め、
      // Day0新規発行の成約も is_mint フラグ付きで棚の実績として返す。
      const recent = await ctx.client.query<{
        horse_name: string;
        price: string;
        buyer: string;
        created_at: string;
        dna_hash: string;
        rarity: string;
        is_mint: boolean;
      }>(
        `select h.name as horse_name, a.assigned_price::text as price,
                a.buyer_user_id::text as buyer, a.created_at::text as created_at,
                h.dna_hash, h.rarity::text as rarity,
                (a.market_listing_id is null) as is_mint
         from ownership_assignments a
         join horses h on h.id = a.horse_id
         where a.status = 'SETTLED'
         order by a.created_at desc limit 20`,
      );
      // Decision 086: SMART出品も所有者に見せる(従来はMANUALのみで、自分の馬が
      // 自動出品されても一覧に出なかった)。sourceでバッジを出し分ける。
      const mine = await ctx.client.query(
        `select l.id as listing_id, l.horse_id, l.listing_price::text as price,
                l.current_day, l.listed_at::text as listed_at, l.cancel_after_batch,
                l.source::text as source,
                h.name, h.dna_hash, h.rarity::text as rarity
         from market_listings l
         join horses h on h.id = l.horse_id
         where l.seller_user_id = $1 and l.status = 'LISTED'
         order by l.listed_at asc`,
        [ctx.userId],
      );
      return {
        shelf: shelf.rows,
        pending_buy_count: demand.rows[0]!.n,
        recent_matches: recent.rows.map((r) => ({
          horse_name: r.horse_name,
          price: r.price,
          buyer: maskedUser(r.buyer),
          matched_at: r.created_at,
          dna_hash: r.dna_hash,
          rarity: r.rarity,
          is_mint: r.is_mint,
        })),
        my_listings: mine.rows,
      };
    },
  });
}
