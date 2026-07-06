import { deterministicScore } from '@sevendays/shared';

/**
 * Deterministic queue tie-breakers (05_SETTLEMENT_ENGINE.md).
 * v1.0 has a single market pool.
 */

export const MARKET_POOL_MAIN = 'main';

/** SHA-256(batch_id + market_pool_id + horse_uuid + assignment_algorithm_version) */
export function marketTiebreakScore(
  batchRunId: string,
  horseUuid: string,
  assignmentAlgorithmVersion: string,
  marketPoolId: string = MARKET_POOL_MAIN,
): number {
  return deterministicScore(batchRunId, marketPoolId, horseUuid, assignmentAlgorithmVersion);
}

/** Manual listings (Decision 076) are created OUTSIDE a batch; their stored
 *  tiebreak is derived from the horse and the listing timestamp instead.
 *  (The nightly queue recomputes its own batch-scoped tiebreak either way.) */
export function manualMarketTiebreakScore(horseUuid: string, listedAtIso: string): number {
  return deterministicScore('manual_listing', horseUuid, listedAtIso);
}

/** SHA-256(batch_id + purchase_session_uuid + assignment_algorithm_version) */
export function purchaseTiebreakScore(
  batchRunId: string,
  purchaseSessionUuid: string,
  assignmentAlgorithmVersion: string,
): number {
  return deterministicScore(batchRunId, purchaseSessionUuid, assignmentAlgorithmVersion);
}
