import { deterministicScore, floorTimesRate } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  LISTING_TARGET_RATE_V1,
  OWNER_LISTING_ABSOLUTE_LIMIT,
  OWNER_LISTING_LIMIT_PER_BATCH,
  type EconomyStatus,
} from '@sevendays/domain';

/**
 * AI Profit Taking Selection (04_ECONOMY_ENGINE.md, Decisions 015-017).
 *
 * "AI" = Liquidity Policy Table + deterministic sort. It creates market
 * LISTINGS only — never transfers ownership, never picks individual horses
 * by judgement.
 *
 * listing_target_count = floor(eligible_horse_count * listing_target_rate)
 * Sort: current_day DESC -> last_listed_at ASC NULLS FIRST
 *       -> deterministic tiebreak DESC -> horse_uuid ASC
 * Tiebreak: SHA-256(batch_id + horse_uuid + liquidity_policy_version
 *                   + assignment_algorithm_version)
 * Owner limit: 1 per batch; ONE relaxation pass to 2 if the target is not
 * met. Pass 3 is forbidden (absolute limit 2).
 */

export interface EligibleHorse {
  horseId: string;
  ownerUserId: string;
  currentDay: number;
  lastListedAtMs: number | null;
  tiebreak: number;
}

export interface SelectionInput {
  batchRunId: string;
  economyStatus: EconomyStatus;
  liquidityPolicyVersion: string;
  assignmentAlgorithmVersion: string;
  eligibleDayMin?: number;
  eligibleDayMax?: number;
}

export interface SelectionResult {
  eligibleCount: number;
  targetCount: number;
  selected: EligibleHorse[];
  relaxationUsed: boolean;
}

export async function selectProfitTakingListings(
  client: SqlClient,
  input: SelectionInput,
): Promise<SelectionResult> {
  const dayMin = input.eligibleDayMin ?? 1;
  const dayMax = input.eligibleDayMax ?? 6;

  // Decision 086: Smart出品はオーナーが明示的に auto_list=true を選んだ馬だけが
  // 母集団。設定行が無い(未選択)ユーザーの馬は決して自動出品されない。
  const rows = await client.query<{
    id: string;
    owner_user_id: string;
    current_day: number;
    last_listed_at: string | null;
  }>(
    `select h.id, h.owner_user_id, h.current_day, h.last_listed_at::text as last_listed_at
     from horses h
     join user_trade_settings uts on uts.user_id = h.owner_user_id and uts.auto_list = true
     where h.status = 'ACTIVE'
       and h.current_day between $1 and $2
       and not exists (select 1 from market_listings l
                       where l.horse_id = h.id and l.status = 'LISTED')`,
    [dayMin, dayMax],
  );

  const eligible: EligibleHorse[] = rows.rows.map((h) => ({
    horseId: h.id,
    ownerUserId: h.owner_user_id,
    currentDay: h.current_day,
    lastListedAtMs: h.last_listed_at ? new Date(h.last_listed_at).getTime() : null,
    tiebreak: deterministicScore(
      input.batchRunId,
      h.id,
      input.liquidityPolicyVersion,
      input.assignmentAlgorithmVersion,
    ),
  }));

  eligible.sort((a, b) => {
    if (a.currentDay !== b.currentDay) return b.currentDay - a.currentDay;
    const aListed = a.lastListedAtMs ?? Number.NEGATIVE_INFINITY; // NULLS FIRST
    const bListed = b.lastListedAtMs ?? Number.NEGATIVE_INFINITY;
    if (aListed !== bListed) return aListed - bListed;
    if (a.tiebreak !== b.tiebreak) return b.tiebreak - a.tiebreak;
    return a.horseId < b.horseId ? -1 : a.horseId > b.horseId ? 1 : 0;
  });

  const rate = LISTING_TARGET_RATE_V1[input.economyStatus];
  const targetCount = floorTimesRate(eligible.length, rate);

  // Pass 1: max 1 per owner, in deterministic order.
  const perOwner = new Map<string, number>();
  const selected: EligibleHorse[] = [];
  for (const horse of eligible) {
    if (selected.length >= targetCount) break;
    if ((perOwner.get(horse.ownerUserId) ?? 0) >= OWNER_LISTING_LIMIT_PER_BATCH) continue;
    selected.push(horse);
    perOwner.set(horse.ownerUserId, (perOwner.get(horse.ownerUserId) ?? 0) + 1);
  }

  // Pass 2 (single deterministic relaxation to the absolute limit of 2).
  let relaxationUsed = false;
  if (selected.length < targetCount) {
    const chosen = new Set(selected.map((s) => s.horseId));
    for (const horse of eligible) {
      if (selected.length >= targetCount) break;
      if (chosen.has(horse.horseId)) continue;
      if ((perOwner.get(horse.ownerUserId) ?? 0) >= OWNER_LISTING_ABSOLUTE_LIMIT) continue;
      selected.push(horse);
      chosen.add(horse.horseId);
      perOwner.set(horse.ownerUserId, (perOwner.get(horse.ownerUserId) ?? 0) + 1);
      relaxationUsed = true;
    }
    // Pass 3 is forbidden: if the target is still unmet, it stays unmet.
  }

  return { eligibleCount: eligible.length, targetCount, selected, relaxationUsed };
}
