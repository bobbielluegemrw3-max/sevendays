import { Money, insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  MLM_REWARD_AMOUNT,
  PRICE_TABLE_V1,
  SUPPORT_BONUS_MAX_TIERS_V1,
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
 * Tier unlocking is a point-in-time stock: the combined CURRENT value
 * (PRICE_TABLE_V1) of ACTIVE horses held by the ancestor's DIRECT referrals
 * (sponsor relation), evaluated at this batch — so tiers downgrade
 * automatically when the volume is not maintained.
 *
 * Idempotent: ledger keys are `mlm:{burnEventId}:t{tier}` and notification
 * dedupe keys mirror them, so a step retry converges.
 */

// SQL fragments generated from the domain constants (trusted literals, both
// sides numeric) so the boundary comparisons happen in exact NUMERIC math —
// a float64 re-sum in JS could land 3001.00 at 3000.999… and misgrade.
const PRICE_CASE = Object.entries(PRICE_TABLE_V1)
  .map(([day, price]) => `when ${Number(day)} then ${price}::numeric`)
  .join(' ');
const TIER_CASE = SUPPORT_BONUS_TIER_THRESHOLDS_V1
  .map((min, i) => ({ min, tier: i + 1 }))
  .sort((a, b) => b.tier - a.tier)
  .map(({ min, tier }) => `when s.volume >= ${min}::numeric then ${tier}`)
  .join(' ');

export interface SupportTierStatus {
  /** Combined current value of ACTIVE horses held by direct referrals. */
  volume: string;
  /** 1..7 — tier 1 is unconditional. */
  unlockedTiers: number;
}

/** Point-in-time tier status for one user (same math the batch uses). */
export async function supportTierStatus(
  client: SqlClient,
  userId: string,
): Promise<SupportTierStatus> {
  const r = await client.query<{ volume: string; unlocked: number }>(
    `select s.volume::text as volume, (case ${TIER_CASE} else 1 end)::int as unlocked
     from (
       select u.id, coalesce(sum(case h.current_day ${PRICE_CASE} end), 0) as volume
       from users u
       left join users r on r.direct_referrer_user_id = u.id and r.status = 'ACTIVE'
       left join horses h on h.owner_user_id = r.id and h.status = 'ACTIVE'
       where u.id = $1
       group by u.id
     ) s`,
    [userId],
  );
  const row = r.rows[0];
  return row ? { volume: row.volume, unlockedTiers: row.unlocked } : { volume: '0', unlockedTiers: 1 };
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
  //    race (exact NUMERIC comparison in SQL).
  const ancestorIds = [...new Set(ancestors.rows.map((r) => r.id))];
  const tiers = await client.query<{ id: string; unlocked: number }>(
    `select s.id, (case ${TIER_CASE} else 1 end)::int as unlocked
     from (
       select u.id, coalesce(sum(case h.current_day ${PRICE_CASE} end), 0) as volume
       from users u
       left join users r on r.direct_referrer_user_id = u.id and r.status = 'ACTIVE'
       left join horses h on h.owner_user_id = r.id and h.status = 'ACTIVE'
       where u.id = any($1)
       group by u.id
     ) s`,
    [ancestorIds],
  );
  const unlockedById = new Map(tiers.rows.map((r) => [r.id, r.unlocked]));

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
