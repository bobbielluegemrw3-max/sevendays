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
