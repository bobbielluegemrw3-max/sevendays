/**
 * Domain enums for Seven Days Derby v1.0.
 * Sources: docs/01,03,04,05,06,07 and Decision Log 038-051.
 * These are business rules — do not extend without a spec/Decision Log change.
 */

export const HORSE_TYPES = ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'] as const;
export type HorseType = (typeof HORSE_TYPES)[number];

export const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'] as const;
export type Rarity = (typeof RARITIES)[number];

export const ABILITY_NAMES = ['speed', 'power', 'stamina', 'recovery', 'luck'] as const;
export type AbilityName = (typeof ABILITY_NAMES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const HORSE_STATUSES = [
  'ACTIVE', // in P2P circulation / racing
  'BURNED', // removed by Burn — can never return to P2P
  'DAY7_CLEARED', // exited P2P, buyback scheduled
  'MEMORIALIZED', // all buyback payments PAID, memorial NFT created
] as const;
export type HorseStatus = (typeof HORSE_STATUSES)[number];

export const ECONOMY_STATUSES = ['NORMAL', 'WATCH', 'WINTER', 'EMERGENCY'] as const;
export type EconomyStatus = (typeof ECONOMY_STATUSES)[number];

/** Severity order: EMERGENCY > WINTER > WATCH > NORMAL (04_ECONOMY_ENGINE.md). */
export const ECONOMY_STATUS_SEVERITY: Record<EconomyStatus, number> = {
  NORMAL: 0,
  WATCH: 1,
  WINTER: 2,
  EMERGENCY: 3,
};

export const MARKETPLACE_STATES = ['OPEN', 'MARKET_LOCKED', 'MAINTENANCE'] as const;
export type MarketplaceState = (typeof MARKETPLACE_STATES)[number];

export const TRAINING_TYPES = ['SPEED_TRAINING', 'POWER_TRAINING', 'RECOVERY_TRAINING'] as const;
export type TrainingType = (typeof TRAINING_TYPES)[number];

export const BUFF_RARITIES = ['N', 'R', 'SR'] as const;
export type BuffRarity = (typeof BUFF_RARITIES)[number];

export const BUFF_STATUSES = ['ACTIVE', 'CONSUMED'] as const;
export type BuffStatus = (typeof BUFF_STATUSES)[number];

/** Weather derived deterministically from race_seed (Decision 039). */
export const WEATHERS = ['SUNNY', 'RAIN', 'CLOUDY', 'STORM'] as const;
export type Weather = (typeof WEATHERS)[number];

export const PURCHASE_SESSION_STATUSES = [
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'REFUNDED',
  'CANCELLED',
  'EXPIRED', // unassigned at batch completion (Decision 043)
] as const;
export type PurchaseSessionStatus = (typeof PURCHASE_SESSION_STATUSES)[number];

export const BATCH_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'PARTIAL_FAILED',
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const BATCH_STEP_STATUSES = [
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
] as const;
export type BatchStepStatus = (typeof BATCH_STEP_STATUSES)[number];

/** Ledger account types (06_DATABASE.md). */
export const ACCOUNT_TYPES = [
  'USER_AVAILABLE',
  'USER_LOCKED',
  'PLATFORM_MINT_REVENUE',
  'PLATFORM_BUYBACK_RESERVE',
  'PLATFORM_MLM_RESERVE',
  'PLATFORM_OPERATING_RESERVE',
  'PLATFORM_EMERGENCY_RESERVE',
  'PLATFORM_SETTLEMENT_CLEARING',
  'PLATFORM_DEPOSIT_CLEARING',
  'PLATFORM_WITHDRAWAL_CLEARING',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ENTRY_DIRECTIONS = ['DEBIT', 'CREDIT'] as const;
export type EntryDirection = (typeof ENTRY_DIRECTIONS)[number];

/**
 * Ledger transaction types. RESERVE_ALLOCATION and
 * BLOCKCHAIN_DEPOSIT_CONFIRMATION are spec-named; the rest are
 * implementation artifacts covering every money movement in the spec.
 */
export const TRANSACTION_TYPES = [
  'RESERVE_ALLOCATION',
  'BLOCKCHAIN_DEPOSIT_CONFIRMATION',
  'PURCHASE_FUND_LOCK',
  'PURCHASE_REFUND',
  'ASSIGNMENT_SETTLEMENT',
  'DAY0_MINT_SETTLEMENT',
  'BUYBACK_PAYMENT',
  'MLM_REWARD_PAYMENT',
  'WITHDRAWAL_FUND_LOCK',
  'WITHDRAWAL_BROADCAST',
  'WITHDRAWAL_CONFIRMATION',
  'WITHDRAWAL_REJECTION_REFUND',
  'ADMIN_ADJUSTMENT',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const LEDGER_TRANSACTION_STATUSES = ['POSTED', 'REVERSED'] as const;
export type LedgerTransactionStatus = (typeof LEDGER_TRANSACTION_STATUSES)[number];

/** API error codes (07_API.md). */
export const ERROR_CODES = [
  'MARKETPLACE_LOCKED',
  'INSUFFICIENT_BALANCE',
  'PURCHASE_EXPIRED',
  'ASSIGNMENT_NOT_FOUND',
  'BUYBACK_NOT_FOUND',
  'REVENGE_BUFF_NOT_FOUND',
  'LEDGER_UNBALANCED',
  'INVALID_BATCH_STATE',
  'RACE_SEED_VERIFICATION_FAILED',
  'RACE_SNAPSHOT_VERIFICATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ADMIN_ROLES = ['FINANCE_ADMIN', 'SUPER_ADMIN'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
