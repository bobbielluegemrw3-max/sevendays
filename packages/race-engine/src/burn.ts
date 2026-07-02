import { floorTimesRate } from '@sevendays/shared';
import { BURN_TARGET_RATE_V1, type EconomyStatus } from '@sevendays/domain';
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
