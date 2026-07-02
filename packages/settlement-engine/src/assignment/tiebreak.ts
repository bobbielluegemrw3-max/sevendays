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

/** SHA-256(batch_id + purchase_session_uuid + assignment_algorithm_version) */
export function purchaseTiebreakScore(
  batchRunId: string,
  purchaseSessionUuid: string,
  assignmentAlgorithmVersion: string,
): number {
  return deterministicScore(batchRunId, purchaseSessionUuid, assignmentAlgorithmVersion);
}
