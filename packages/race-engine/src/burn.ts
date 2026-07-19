import { floorTimesRate } from '@sevendays/shared';
import { BURN_TARGET_RATE_V1, nightlyBurnRateV2, type EconomyStatus } from '@sevendays/domain';
import type { RankedParticipant } from './ranking.js';

/**
 * Burn selection (01_CONSTITUTION.md — immutable rules):
 *   Burn Target Count = floor(Eligible Horses * Burn Target Rate)
 * Targets are the BOTTOM `count` horses of the finalized deterministic
 * ranking. Ties never burn extra horses — ranking is already a total order.
 */

export function burnTargetCount(eligibleCount: number, economyStatus: EconomyStatus): number {
  return floorTimesRate(eligibleCount, BURN_TARGET_RATE_V1[economyStatus]);
}

/**
 * ADR-012(承認 2026-07-10): 夜間ジッター版。率はステータス基準率+シード由来の
 * 対称ジッター(平均=基準率を厳守・器8.0〜13.5%固定)。floor則は憲法どおり不変。
 * 返り値に採用した率も含める(races.burn_rate への記録と台帳公開用)。
 */
export function burnTargetCountV2(
  eligibleCount: number,
  economyStatus: EconomyStatus,
  raceSeed: string,
  amplitude?: string,
): { count: number; rate: string } {
  const rate = nightlyBurnRateV2(raceSeed, economyStatus, amplitude);
  return { count: floorTimesRate(eligibleCount, rate), rate };
}

/** The horseUuids to burn: bottom `count` ranks of the finalized ranking. */
export function selectBurnTargets(
  ranking: readonly RankedParticipant[],
  count: number,
): string[] {
  if (count <= 0) return [];
  if (count > ranking.length) {
    throw new RangeError(
      `BURN_COUNT_EXCEEDS_PARTICIPANTS: ${count} > ${ranking.length}`,
    );
  }
  const threshold = ranking.length - count;
  return ranking.filter((r) => r.finalRank > threshold).map((r) => r.horseUuid);
}

/**
 * Decision 111 (2026-07-19): V2はLV帯(current_day)ごとのBURN選定。
 * 総数は憲法の器(floor則・8.0〜13.5%)のまま変えず、「選び方」だけを帯別にする —
 * 帯サイズに比例した最大剰余法で総数を配分し、各帯の中のスコア下位から選ぶ。
 * これにより新規帯が高LV帯の総合値と直接比較されて全滅する構造をなくし、
 * どの帯でも「同期より上手く育てた馬が残る」competitionになる。経済(総BURN数)は不変。
 * 全て決定論: 配分の同順位は 剰余大→帯サイズ大→若い帯 の順で解決する。
 */
export function allocateBurnsByBandV2(
  bandSizes: ReadonlyMap<number, number>,
  count: number,
): Map<number, number> {
  const days = [...bandSizes.keys()].sort((a, b) => a - b);
  const total = days.reduce((sum, d) => sum + bandSizes.get(d)!, 0);
  const alloc = new Map<number, number>(days.map((d) => [d, 0]));
  if (count <= 0) return alloc;
  if (count > total) {
    throw new RangeError(`BURN_COUNT_EXCEEDS_PARTICIPANTS: ${count} > ${total}`);
  }
  let assigned = 0;
  const remainders: { day: number; frac: number; size: number }[] = [];
  for (const d of days) {
    const size = bandSizes.get(d)!;
    const exact = (count * size) / total;
    const base = Math.min(size, Math.floor(exact));
    alloc.set(d, base);
    assigned += base;
    remainders.push({ day: d, frac: exact - base, size });
  }
  remainders.sort((a, b) => b.frac - a.frac || b.size - a.size || a.day - b.day);
  let guard = 0;
  while (assigned < count) {
    for (const r of remainders) {
      if (assigned >= count) break;
      if (alloc.get(r.day)! < r.size) {
        alloc.set(r.day, alloc.get(r.day)! + 1);
        assigned += 1;
      }
    }
    guard += 1;
    if (guard > count + 2) throw new Error('BURN_BAND_ALLOCATION_DIVERGED');
  }
  return alloc;
}

/** 帯別選定の本体: グローバル順位はそのまま、帯の中の下位 alloc 頭を対象にする。 */
export function selectBurnTargetsBandedV2(
  ranking: readonly RankedParticipant[],
  dayByHorse: ReadonlyMap<string, number>,
  count: number,
): string[] {
  if (count <= 0) return [];
  if (count > ranking.length) {
    throw new RangeError(`BURN_COUNT_EXCEEDS_PARTICIPANTS: ${count} > ${ranking.length}`);
  }
  const bands = new Map<number, RankedParticipant[]>();
  for (const r of ranking) {
    const day = dayByHorse.get(r.horseUuid);
    if (day === undefined) {
      throw new Error(`BURN_BAND_MISSING_DAY: ${r.horseUuid}`);
    }
    const list = bands.get(day);
    if (list) list.push(r);
    else bands.set(day, [r]);
  }
  const sizes = new Map<number, number>();
  bands.forEach((list, day) => sizes.set(day, list.length));
  const alloc = allocateBurnsByBandV2(sizes, count);
  const out: string[] = [];
  for (const [day, list] of [...bands.entries()].sort((a, b) => a[0] - b[0])) {
    const k = alloc.get(day) ?? 0;
    if (k <= 0) continue;
    const ordered = [...list].sort((a, b) => a.finalRank - b.finalRank);
    out.push(...ordered.slice(ordered.length - k).map((r) => r.horseUuid));
  }
  return out;
}
