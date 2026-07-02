import type { BuffRarity, EconomyStatus, HorseType, Rarity, TrainingType } from './enums.js';

/**
 * v1.0 fixed business constants.
 * Every value here is spec-defined (docs/01-05) or owner-decided (Decision Log 038-051).
 * Monetary values are exact decimal strings — never floats.
 */

// ---------------------------------------------------------------------------
// Price Table v1.0 (02_BUSINESS_MODEL.md)
// ---------------------------------------------------------------------------

/** P2P assignment price by current_day. Day0 is the Mint price. */
export const PRICE_TABLE_V1: Readonly<Record<number, string>> = {
  0: '100.00',
  1: '110.00',
  2: '121.00',
  3: '133.10',
  4: '146.41',
  5: '161.05',
  6: '177.16',
};

export const DAY0_MINT_PRICE = '100.00';

/** Purchase Session lock amount = max assignable price = Day6 price (05_SETTLEMENT_ENGINE.md). */
export const PURCHASE_LOCK_AMOUNT = '177.16';

/** P2P platform fee is ALWAYS 0 (01_CONSTITUTION.md — immutable). */
export const P2P_PLATFORM_FEE = '0';

// ---------------------------------------------------------------------------
// Day7 Buyback v1.0 (05_SETTLEMENT_ENGINE.md, Decision 042)
// ---------------------------------------------------------------------------

export const BUYBACK_TOTAL = '200.00';
export const BUYBACK_PAYMENT_COUNT = 7;
/** Payments 1-6. */
export const BUYBACK_PAYMENT_AMOUNT = '28.57142857';
/** Payment 7 adjusts rounding so the total equals exactly 200. */
export const BUYBACK_FINAL_PAYMENT_AMOUNT = '28.57142858';
/** Payment n is due on day7_clear_date + n (daily, D+1..D+7). */
export const BUYBACK_FIRST_PAYMENT_OFFSET_DAYS = 1;

// ---------------------------------------------------------------------------
// Reserve Allocation v1.0 (02_BUSINESS_MODEL.md)
// ---------------------------------------------------------------------------

export const RESERVE_ALLOCATION_V1 = {
  PLATFORM_BUYBACK_RESERVE: '93.60',
  PLATFORM_MLM_RESERVE: '5.40',
  PLATFORM_OPERATING_RESERVE: '0.70',
  PLATFORM_EMERGENCY_RESERVE: '0.30',
} as const;

// ---------------------------------------------------------------------------
// Burn Target v1.0 (04_ECONOMY_ENGINE.md) — rate by Economy Status.
// Burn Target Count = floor(eligible * rate). floor() is immutable.
// ---------------------------------------------------------------------------

export const BURN_TARGET_RATE_V1: Readonly<Record<EconomyStatus, string>> = {
  NORMAL: '0.100',
  WATCH: '0.104',
  WINTER: '0.108',
  EMERGENCY: '0.112',
};

// ---------------------------------------------------------------------------
// AI Profit Taking v1.0 (04_ECONOMY_ENGINE.md)
// ---------------------------------------------------------------------------

export const LISTING_TARGET_RATE_V1: Readonly<Record<EconomyStatus, string>> = {
  NORMAL: '0.30',
  WATCH: '0.25',
  WINTER: '0.15',
  EMERGENCY: '0',
};

export const OWNER_LISTING_LIMIT_PER_BATCH = 1;
export const OWNER_LISTING_ABSOLUTE_LIMIT = 2; // one relaxation pass max; Pass 3 forbidden

// ---------------------------------------------------------------------------
// Revenge Buff v1.0 (03_GAME_DESIGN.md)
// ---------------------------------------------------------------------------

export const BUFF_TABLE_V1: Readonly<
  Record<BuffRarity, { probability: string; bonusScore: number }>
> = {
  N: { probability: '0.30', bonusScore: 4 },
  R: { probability: '0.50', bonusScore: 7 },
  SR: { probability: '0.20', bonusScore: 10 },
};

// ---------------------------------------------------------------------------
// MLM Reward v1.0 (Decision 021, 041)
// ---------------------------------------------------------------------------

export const MLM_REWARD_AMOUNT = '10.00';
/** Valid referrer = ACTIVE only (Decision 041). */
export const VALID_REFERRER_STATUS = 'ACTIVE';

// ---------------------------------------------------------------------------
// Horse Generation v1.0 (03_GAME_DESIGN.md)
// ---------------------------------------------------------------------------

export const HORSE_TYPE_PROBABILITY_V1: Readonly<Record<HorseType, string>> = {
  SPRINTER: '0.20',
  POWER: '0.20',
  BALANCED: '0.20',
  ENDURANCE: '0.20',
  LUCK: '0.20',
};

export const RARITY_PROBABILITY_V1: Readonly<Record<Rarity, string>> = {
  COMMON: '0.50',
  UNCOMMON: '0.25',
  RARE: '0.15',
  EPIC: '0.08',
  LEGENDARY: '0.02',
};

export const ABILITY_DISTRIBUTION_V1 = {
  mean: 75.0,
  standardDeviation: 10.0,
  min: 50.0,
  max: 100.0,
} as const;

export const ABILITY_WEIGHTS_V1 = {
  speed: 0.25,
  power: 0.25,
  stamina: 0.2,
  recovery: 0.15,
  luck: 0.15,
} as const;

export const DNA_MODIFIER_RANGE_V1 = { min: -2.0, max: 2.0 } as const;

// ---------------------------------------------------------------------------
// Race Engine v1.0 modifier ranges (03_GAME_DESIGN.md)
// ---------------------------------------------------------------------------

export const MODIFIER_RANGES_V1 = {
  base_ability_score: { min: 50.0, max: 100.0 },
  horse_type_modifier: { min: -3.0, max: 3.0 },
  dna_modifier: { min: -2.0, max: 2.0 },
  training_modifier: { min: 0.0, max: 5.0 },
  weather_modifier: { min: -2.0, max: 2.0 },
  track_modifier: { min: -2.0, max: 2.0 },
  condition_modifier: { min: -3.0, max: 3.0 },
  fatigue_modifier: { min: -5.0, max: 0.0 },
  random_modifier: { min: -3.0, max: 3.0 },
} as const;

export const RARITY_MODIFIER_V1: Readonly<Record<Rarity, number>> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EPIC: 3,
  LEGENDARY: 4,
};

export const REVENGE_BUFF_MODIFIER_V1: Readonly<Record<BuffRarity, number>> = {
  N: 4,
  R: 7,
  SR: 10,
};

/** LUCK type + effective LUCK training changes random range for that race only. */
export const LUCK_TRAINED_RANDOM_RANGE_V1 = { min: -2.0, max: 4.0 } as const;

// ---------------------------------------------------------------------------
// Daily Training v1.0 (03_GAME_DESIGN.md)
// training_modifier by (horse type, training type). LUCK special-case handled
// by the race engine random range, not here.
// ---------------------------------------------------------------------------

export function trainingModifierV1(horseType: HorseType, training: TrainingType | null): number {
  if (training === null) return 0;
  if (horseType === 'BALANCED') return 4;
  if (horseType === 'ENDURANCE') return training === 'RECOVERY_TRAINING' ? 5 : 3;
  switch (training) {
    case 'SPEED_TRAINING':
      return horseType === 'SPRINTER' ? 5 : 3;
    case 'POWER_TRAINING':
      return horseType === 'POWER' ? 5 : 3;
    case 'RECOVERY_TRAINING':
      return 4; // + fatigue bonus +1.00, applied in fatigue calculation
  }
}

/** RECOVERY_TRAINING adds +1.00 to fatigue_modifier (total effective max +5). */
export const RECOVERY_TRAINING_FATIGUE_BONUS = 1.0;

// ---------------------------------------------------------------------------
// Weather / Track v1.0 (Decision 053)
// ---------------------------------------------------------------------------

export const WEATHER_PROBABILITY_V1 = {
  SUNNY: '0.40',
  CLOUDY: '0.30',
  RAIN: '0.20',
  STORM: '0.10',
} as const;

export const TRACK_PROBABILITY_V1 = {
  GOOD: '0.40',
  FAST: '0.25',
  SOFT: '0.25',
  HEAVY: '0.10',
} as const;

export type TrackConditionName = keyof typeof TRACK_PROBABILITY_V1;

export const WEATHER_MODIFIER_V1: Readonly<
  Record<keyof typeof WEATHER_PROBABILITY_V1, Record<HorseType, number>>
> = {
  SUNNY: { SPRINTER: 2.0, POWER: 0.5, BALANCED: 1.0, ENDURANCE: 0.0, LUCK: 0.5 },
  CLOUDY: { SPRINTER: 0.5, POWER: 0.5, BALANCED: 1.0, ENDURANCE: 0.5, LUCK: 0.5 },
  RAIN: { SPRINTER: -1.5, POWER: 2.0, BALANCED: 0.0, ENDURANCE: 1.0, LUCK: 0.5 },
  STORM: { SPRINTER: -2.0, POWER: 1.0, BALANCED: -0.5, ENDURANCE: 2.0, LUCK: 1.0 },
};

export const TRACK_MODIFIER_V1: Readonly<
  Record<TrackConditionName, Record<HorseType, number>>
> = {
  FAST: { SPRINTER: 2.0, POWER: 0.0, BALANCED: 0.5, ENDURANCE: -1.0, LUCK: 0.5 },
  GOOD: { SPRINTER: 0.5, POWER: 0.5, BALANCED: 1.0, ENDURANCE: 0.5, LUCK: 0.5 },
  SOFT: { SPRINTER: -1.0, POWER: 2.0, BALANCED: 0.0, ENDURANCE: 1.0, LUCK: 0.5 },
  HEAVY: { SPRINTER: -2.0, POWER: 1.0, BALANCED: -0.5, ENDURANCE: 2.0, LUCK: 1.0 },
};

/**
 * horse_type_modifier (formula term, range -3.00..+3.00): type strengths are
 * fully expressed through the weather/track affinity tables above, so v1.0
 * fixes this term at 0.00 to avoid double-counting (P8, pending owner
 * reconfirmation).
 */
export const HORSE_TYPE_MODIFIER_V1 = 0.0;

// ---------------------------------------------------------------------------
// Condition / Fatigue v1.0 (Decisions 040, 054)
// ---------------------------------------------------------------------------

export const CONDITION_FATIGUE_V1 = {
  initialCondition: 80.0,
  initialFatigue: 0.0,
  min: 0.0,
  max: 100.0,
  trainingCost: { SPEED_TRAINING: 8, POWER_TRAINING: 8, RECOVERY_TRAINING: 3 },
  trainingEffect: { SPEED_TRAINING: 1, POWER_TRAINING: 1, RECOVERY_TRAINING: 3 },
  dailyNaturalRecovery: 5,
  recoveryTrainingAdditionalRecovery: 7,
  raceFatigueCost: 5,
} as const;

/** condition value -> condition_modifier (Decision 054). */
export function conditionModifierV1(condition: number): number {
  if (condition >= 90) return 3;
  if (condition >= 80) return 2;
  if (condition >= 70) return 1;
  if (condition >= 50) return 0;
  if (condition >= 30) return -1;
  if (condition >= 10) return -2;
  return -3;
}

/** fatigue value -> fatigue_modifier before the RECOVERY_TRAINING bonus (Decision 054). */
export function fatigueModifierV1(fatigue: number): number {
  if (fatigue <= 10) return 0;
  if (fatigue <= 25) return -1;
  if (fatigue <= 40) return -2;
  if (fatigue <= 60) return -3;
  if (fatigue <= 80) return -4;
  return -5;
}

// ---------------------------------------------------------------------------
// Economy Status thresholds v1.0 (04_ECONOMY_ENGINE.md)
// ---------------------------------------------------------------------------

export const ECONOMY_THRESHOLDS_V1 = {
  normal: { cashCoverageMin: '2.00', p2pMatchRateMin: '0.80', rebuyRateMin: '0.30' },
  watch: { cashCoverageMin: '1.50' },
  winter: { cashCoverageMin: '1.20', forecastedCashCoverageBelow: '1.50' },
  emergency: { cashCoverageBelow: '1.20', forecastedCashCoverageBelow: '1.20' },
} as const;

export const STABILITY_RULE_V1 = {
  statusConfirmationDays: 2,
  emergencyImmediate: true,
  allowDirectRecovery: false,
  emergencyMinimumLockDays: 3,
} as const;

// ---------------------------------------------------------------------------
// Deposit / Withdrawal v1.0 (07_API.md, Decisions 048)
// ---------------------------------------------------------------------------

export const SUPPORTED_ASSET = 'USDT';
export const DEFAULT_CHAIN = 'POLYGON_POS';
export const DEPOSIT_CONFIRMATION_BLOCKS = 128;
export const MIN_WITHDRAWAL_AMOUNT = '10.00';

// ---------------------------------------------------------------------------
// Purchase sessions (Decisions 043, 051)
// ---------------------------------------------------------------------------

export const MAX_CONCURRENT_PURCHASE_SESSIONS = 10;

// ---------------------------------------------------------------------------
// Batch (05_SETTLEMENT_ENGINE.md, Decision 047)
// ---------------------------------------------------------------------------

export const BATCH_TIME_MYT = '20:00';
export const RECOVERY_TIMEOUT_HOURS = 24;
export const BATCH_STEP_COUNT = 37;
