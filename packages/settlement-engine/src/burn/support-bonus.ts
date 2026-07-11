import { Money, insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  MLM_REWARD_AMOUNT,
  PRICE_TABLE_V1,
  SUPPORT_BONUS_DIRECT_REQUIRED_FROM_TIER,
  SUPPORT_BONUS_MAX_TIERS_V1,
  SUPPORT_BONUS_ORG_THRESHOLDS_V1,
  SUPPORT_BONUS_TIER_AMOUNTS_V1,
  SUPPORT_BONUS_TIER_THRESHOLDS_V1,
  renderNotification,
} from '@sevendays/domain';
import { getBalance, getPlatformAccountId, supportBonusPayment } from '@sevendays/ledger';

/**
 * Support Bonus (サポートボーナス, Decision 074) — on each burn, walk UP the
 * placement tree at most 7 tiers and pay T1=3 / T2=2 / T3-7=1 USDT from the
 * pre-funded PLATFORM_MLM_RESERVE. An ancestor at distance d is paid only if
 * ACTIVE (Decision 041 semantics; an invalid tier is unclaimed — no roll-up)
 * and its unlocked tier count >= d. Anything unpaid stays in the reserve
 * (no redistribution — the EMERGENCY-mode safety surplus).
 *
 * Tier unlocking (Decision 077) is a point-in-time stock evaluated at this
 * batch (downgrades freely): ORG volume — ACTIVE horses' current value held
 * by ACTIVE members of the PLACEMENT subtree down to 7 levels — governs
 * every tier; DIRECT-referral volume is additionally required from tier 5
 * (org volume alone does not separate the top tiers).
 *
 * Idempotent: ledger keys are `mlm:{burnEventId}:t{tier}` and notification
 * dedupe keys mirror them, so a step retry converges.
 */

// SQL fragment generated from the domain price table (trusted literals) so
// volume sums happen in exact NUMERIC math; boundary comparisons then run in
// TS on integer cents (prices are 2-decimal, so sums are exact 2-decimal).
const PRICE_CASE = Object.entries(PRICE_TABLE_V1)
  .map(([day, price]) => `when ${Number(day)} then ${price}::numeric`)
  .join(' ');

/** Exact cents from a NUMERIC::text like "10400.00" (no float math). */
function usdtTextToCents(text: string): number {
  const [intPart, fracPart = ''] = text.split('.');
  const frac = (fracPart + '00').slice(0, 2);
  return Number(intPart) * 100 + Number(frac);
}

/**
 * Decision 077 unlock rule (pure): ORG volume (placement subtree <=7 levels)
 * governs every tier; DIRECT volume is additionally required from tier 5.
 */
export function computeUnlockedTiers(orgVolumeText: string, directVolumeText: string): number {
  const org = usdtTextToCents(orgVolumeText);
  const direct = usdtTextToCents(directVolumeText);
  let unlocked = 1;
  for (let tier = 2; tier <= SUPPORT_BONUS_MAX_TIERS_V1; tier += 1) {
    if (org < Number(SUPPORT_BONUS_ORG_THRESHOLDS_V1[tier - 1]) * 100) break;
    if (
      tier >= SUPPORT_BONUS_DIRECT_REQUIRED_FROM_TIER &&
      direct < Number(SUPPORT_BONUS_TIER_THRESHOLDS_V1[tier - 1]) * 100
    ) {
      break;
    }
    unlocked = tier;
  }
  return unlocked;
}

// Decision 087: 手動出品中(Market Lock)の馬はティアボリュームから除外する。
// 凍結中の馬はBURNリスクを負っていないため、含めると「手動出品で駐車したまま
// ティアを維持する」ノーリスクの水増しが可能になる。SMART出品中は走り続ける
// (リスク継続)ので通常どおり数える。
const NOT_MARKET_LOCKED = `not exists (select 1 from market_listings ml
                       where ml.horse_id = h.id and ml.status = 'LISTED' and ml.source = 'MANUAL')`;

/** DIRECT volumes (Decision 074 metric) for a set of users, as NUMERIC text. */
async function directVolumes(client: SqlClient, ids: readonly string[]): Promise<Map<string, string>> {
  const r = await client.query<{ id: string; volume: string }>(
    `select u.id, coalesce(sum(case h.current_day ${PRICE_CASE} end), 0)::text as volume
     from users u
     left join users r on r.direct_referrer_user_id = u.id and r.status = 'ACTIVE'
     left join horses h on h.owner_user_id = r.id and h.status = 'ACTIVE' and ${NOT_MARKET_LOCKED}
     where u.id = any($1)
     group by u.id`,
    [ids],
  );
  return new Map(r.rows.map((row) => [row.id, row.volume]));
}

/** ORG volumes (placement subtree, <=7 levels down) for a set of users. */
async function orgVolumes(client: SqlClient, ids: readonly string[]): Promise<Map<string, string>> {
  const r = await client.query<{ id: string; volume: string }>(
    `with recursive org as (
       select a.id as root_id, a.id as member_id, 0 as depth
       from users a where a.id = any($1)
       union all
       select o.root_id, c.id, o.depth + 1
       from org o join users c on c.placement_parent_user_id = o.member_id
       where o.depth < ${SUPPORT_BONUS_MAX_TIERS_V1}
     )
     select o.root_id as id, coalesce(sum(case h.current_day ${PRICE_CASE} end), 0)::text as volume
     from org o
     join users m on m.id = o.member_id and m.status = 'ACTIVE'
     left join horses h on h.owner_user_id = o.member_id and h.status = 'ACTIVE' and ${NOT_MARKET_LOCKED}
     where o.depth >= 1
     group by o.root_id`,
    [ids],
  );
  return new Map(r.rows.map((row) => [row.id, row.volume]));
}

export interface SupportTierStatus {
  /** Placement-subtree (<=7 levels) volume — governs every tier. */
  orgVolume: string;
  /** Direct referrals' volume — additionally required from tier 5. */
  directVolume: string;
  /** 1..7 — tier 1 is unconditional. */
  unlockedTiers: number;
}

/** Point-in-time tier status for one user (same math the batch uses). */
export async function supportTierStatus(
  client: SqlClient,
  userId: string,
): Promise<SupportTierStatus> {
  const [org, direct] = await Promise.all([
    orgVolumes(client, [userId]),
    directVolumes(client, [userId]),
  ]);
  const orgVolume = org.get(userId) ?? '0';
  const directVolume = direct.get(userId) ?? '0';
  return { orgVolume, directVolume, unlockedTiers: computeUnlockedTiers(orgVolume, directVolume) };
}

export interface SupportBonusBurn {
  burnedOwnerUserId: string;
  burnEventId: string;
}

/**
 * Pay support bonuses for ALL of the race's burns in one pass.
 *
 * Called AFTER every burn of the night is persisted (statuses already
 * BURNED), so ancestor chains and tier volumes are evaluated exactly once
 * against a single post-burn snapshot — the outcome does not depend on
 * burn processing order, and a crash-retry re-evaluates the identical
 * state (payments themselves are ledger-idempotent).
 *
 * Returns the number of NEW payments posted (replays return 0).
 */
export async function paySupportBonusesForBurns(
  client: SqlClient,
  burns: readonly SupportBonusBurn[],
): Promise<number> {
  if (burns.length === 0) return 0;

  // Ops early warning (owner request 2026-07-07): flag the reserve BEFORE
  // it actually fails a payment. Marker is picked up by log-based alerting
  // (infra/monitoring alerts.sh: SUPPORT_RESERVE_LOW). Numbers here are for
  // the log line only — actual payments still go through exact Money math
  // and the ledger refuses to overdraw either way.
  const reserveId = await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE');
  const reserve = Number(await getBalance(client, reserveId));
  const threeNightCap = burns.length * Number(MLM_REWARD_AMOUNT) * 3;
  if (reserve < threeNightCap) {
    console.warn(
      `SUPPORT_RESERVE_LOW: PLATFORM_MLM_RESERVE ${reserve.toFixed(2)} USDT < 3 nights of full-tier liability ${threeNightCap.toFixed(2)} USDT (${burns.length} burns tonight)`,
    );
  }

  // 1. Placement ancestors for every burned owner in one recursive walk
  //    (unplaced owners have none — their full 10 stays in the reserve).
  //    The same owner can appear once even with several burned horses.
  const ownerIds = [...new Set(burns.map((b) => b.burnedOwnerUserId))];
  const ancestors = await client.query<{
    owner_id: string;
    tier: number;
    id: string;
    status: string;
  }>(
    `with recursive chain as (
       select u.id as owner_id, u.placement_parent_user_id as ancestor_id, 1 as tier
       from users u where u.id = any($1)
       union all
       select c.owner_id, p.placement_parent_user_id, c.tier + 1
       from chain c join users p on p.id = c.ancestor_id
       where c.tier < $2 and p.placement_parent_user_id is not null
     )
     select c.owner_id, c.tier, a.id, a.status::text as status
     from chain c join users a on a.id = c.ancestor_id
     order by c.owner_id, c.tier`,
    [ownerIds, SUPPORT_BONUS_MAX_TIERS_V1],
  );
  if (ancestors.rows.length === 0) return 0;
  const chainByOwner = new Map<string, { tier: number; id: string; status: string }[]>();
  for (const row of ancestors.rows) {
    const list = chainByOwner.get(row.owner_id) ?? [];
    list.push(row);
    chainByOwner.set(row.owner_id, list);
  }

  // 2. Unlocked tiers per distinct ancestor — one evaluation for the whole
  //    race against the same post-burn snapshot (Decision 077: org subtree
  //    <=7 levels for every tier, plus the direct metric from tier 5).
  const ancestorIds = [...new Set(ancestors.rows.map((r) => r.id))];
  const [orgById, directById] = await Promise.all([
    orgVolumes(client, ancestorIds),
    directVolumes(client, ancestorIds),
  ]);
  const unlockedById = new Map(
    ancestorIds.map((id) => [id, computeUnlockedTiers(orgById.get(id) ?? '0', directById.get(id) ?? '0')]),
  );

  // 3. Pay qualifying tiers per burn event; skipped tiers are never debited.
  let payments = 0;
  for (const burn of burns) {
    for (const ancestor of chainByOwner.get(burn.burnedOwnerUserId) ?? []) {
      if (ancestor.status !== 'ACTIVE') continue;
      if ((unlockedById.get(ancestor.id) ?? 1) < ancestor.tier) continue;
      const amount = SUPPORT_BONUS_TIER_AMOUNTS_V1[ancestor.tier - 1]!;
      const payment = await supportBonusPayment(client, {
        userId: ancestor.id,
        amount: Money.of(amount),
        idempotencyKey: `mlm:${burn.burnEventId}:t${ancestor.tier}`,
        referenceType: 'horse_burn_event',
        referenceId: burn.burnEventId,
      });
      if (!payment.alreadyPosted) payments += 1;

      const rendered = renderNotification('SUPPORT_BONUS_PAID', {
        amount,
        tier: ancestor.tier,
      });
      await insertNotification(client, {
        userId: ancestor.id,
        type: 'SUPPORT_BONUS_PAID',
        dedupeKey: `notif:SUPPORT_BONUS_PAID:${burn.burnEventId}:${ancestor.tier}`,
        payload: { ...rendered, burn_event_id: burn.burnEventId, tier: ancestor.tier },
      });
    }
  }
  return payments;
}
