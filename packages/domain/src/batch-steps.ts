/**
 * Daily Settlement Batch step definitions v1.0 (05_SETTLEMENT_ENGINE.md).
 * Order is fixed by batch_algorithm_version and MUST NOT change.
 * `retryable` implements the Admin Recovery retry allow/forbid lists.
 */

export interface BatchStepDef {
  readonly stepNumber: number;
  readonly key: string;
  readonly retryable: boolean;
}

export const BATCH_STEPS_V1: readonly BatchStepDef[] = [
  { stepNumber: 1, key: 'START_BATCH', retryable: false },
  { stepNumber: 2, key: 'LOCK_MARKETPLACE', retryable: false },
  { stepNumber: 3, key: 'LOCK_POLICY_VERSIONS', retryable: false },
  { stepNumber: 4, key: 'LOCK_PURCHASE_SESSIONS', retryable: false },
  { stepNumber: 5, key: 'CREATE_RACES', retryable: false },
  { stepNumber: 6, key: 'COMMIT_RACE_SEEDS', retryable: false },
  { stepNumber: 7, key: 'CREATE_PARTICIPANT_SNAPSHOTS', retryable: false },
  { stepNumber: 8, key: 'RUN_RACE_ENGINE', retryable: false },
  { stepNumber: 9, key: 'REVEAL_RACE_SEEDS', retryable: false },
  { stepNumber: 10, key: 'VERIFY_RACE_REPLAY_INPUTS', retryable: false },
  { stepNumber: 11, key: 'FINALIZE_RACE_RANKINGS', retryable: false },
  { stepNumber: 12, key: 'CALCULATE_BURN_TARGET_COUNT', retryable: false },
  { stepNumber: 13, key: 'SELECT_BURN_TARGETS', retryable: false },
  { stepNumber: 14, key: 'EXECUTE_BURNS', retryable: false },
  { stepNumber: 15, key: 'GENERATE_REVENGE_BUFFS', retryable: false },
  { stepNumber: 16, key: 'PAY_MLM_REWARDS', retryable: true },
  { stepNumber: 17, key: 'INCREMENT_CURRENT_DAY', retryable: false },
  { stepNumber: 18, key: 'PROCESS_DAY7_CLEAR', retryable: false },
  { stepNumber: 19, key: 'CREATE_BUYBACK_SCHEDULES', retryable: false },
  { stepNumber: 20, key: 'PAY_DUE_BUYBACKS', retryable: true },
  { stepNumber: 21, key: 'RUN_PROFIT_TAKING_SELECTION', retryable: false },
  { stepNumber: 22, key: 'CREATE_MARKET_LISTINGS', retryable: false },
  { stepNumber: 23, key: 'BUILD_HORSE_QUEUE', retryable: false },
  { stepNumber: 24, key: 'BUILD_BUYER_QUEUE', retryable: false },
  { stepNumber: 25, key: 'EXECUTE_ASSIGNMENT', retryable: false },
  { stepNumber: 26, key: 'EXECUTE_RESERVE_ALLOCATION', retryable: false },
  { stepNumber: 27, key: 'REFUND_UNASSIGNED_SESSIONS', retryable: true },
  { stepNumber: 28, key: 'FINALIZE_OWNERSHIP_TRANSFERS', retryable: false },
  { stepNumber: 29, key: 'LEDGER_RECONCILIATION', retryable: false },
  { stepNumber: 30, key: 'CREATE_MEMORIAL_NFTS', retryable: false },
  { stepNumber: 31, key: 'CREATE_LIQUIDITY_REPORT', retryable: true },
  { stepNumber: 32, key: 'RUN_STRESS_TESTS', retryable: true },
  { stepNumber: 33, key: 'CALCULATE_TOMORROW_ECONOMY_STATUS', retryable: false },
  { stepNumber: 34, key: 'SAVE_TOMORROW_POLICY', retryable: true },
  { stepNumber: 35, key: 'CREATE_AUDIT_SNAPSHOT', retryable: true },
  { stepNumber: 36, key: 'REOPEN_MARKETPLACE', retryable: false },
  { stepNumber: 37, key: 'COMPLETE_BATCH', retryable: false },
] as const;

/** Stress test scenarios run daily (04_ECONOMY_ENGINE.md, Decision 045). */
export const STRESS_SCENARIOS_V1 = [
  'BASE',
  'WINTER_30', // Mint demand -30%
  'WINTER_90', // Mint demand -90%
  'HIGH_SURVIVAL',
  'LOW_BURN',
  'P2P_FREEZE',
  'BUFF_OVERPOWER',
  'MASS_WITHDRAWAL', // 20% of wallet balances withdrawn
] as const;
export type StressScenario = (typeof STRESS_SCENARIOS_V1)[number];
