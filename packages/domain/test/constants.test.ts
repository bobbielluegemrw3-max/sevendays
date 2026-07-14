import { describe, expect, it } from 'vitest';
import {
  PRICE_TABLE_V1,
  DAY0_MINT_PRICE,
  PURCHASE_LOCK_AMOUNT,
  P2P_PLATFORM_FEE,
  BUYBACK_TOTAL,
  BUYBACK_PAYMENT_COUNT,
  BUYBACK_PAYMENT_AMOUNT,
  BUYBACK_FINAL_PAYMENT_AMOUNT,
  RESERVE_ALLOCATION_V1,
  BURN_TARGET_RATE_V1,
  BUFF_TABLE_V1,
  RARITY_PROBABILITY_V1,
  HORSE_TYPE_PROBABILITY_V1,
  ABILITY_WEIGHTS_V1,
  RARITY_MODIFIER_V1,
  REVENGE_BUFF_MODIFIER_V1,
  trainingModifierV1,
  MLM_REWARD_AMOUNT,
  MAX_CONCURRENT_PURCHASE_SESSIONS,
  SUPPORT_BONUS_DIRECT_REQUIRED_FROM_TIER,
  SUPPORT_BONUS_MAX_TIERS_V1,
  SUPPORT_BONUS_ORG_THRESHOLDS_V1,
  SUPPORT_BONUS_TIER_AMOUNTS_V1,
  SUPPORT_BONUS_TIER_THRESHOLDS_V1,
} from '../src/constants.js';
import { BATCH_STEPS_V1, STRESS_SCENARIOS_V1 } from '../src/batch-steps.js';
import { ECONOMY_STATUS_SEVERITY } from '../src/enums.js';

// Local exact-decimal sum for validating constant tables (values are fixed-scale strings).
function sumAsCents(values: string[], scale: number): bigint {
  return values
    .map((v) => {
      const [int = '0', frac = ''] = v.split('.');
      return BigInt(int + frac.padEnd(scale, '0'));
    })
    .reduce((a, b) => a + b, 0n);
}

describe('Price Table v1.0 (02_BUSINESS_MODEL.md)', () => {
  it('has exact spec values for Day0-Day6', () => {
    expect(PRICE_TABLE_V1[0]).toBe('100.00');
    expect(PRICE_TABLE_V1[1]).toBe('110.00');
    expect(PRICE_TABLE_V1[2]).toBe('121.00');
    expect(PRICE_TABLE_V1[3]).toBe('133.10');
    expect(PRICE_TABLE_V1[4]).toBe('146.41');
    expect(PRICE_TABLE_V1[5]).toBe('161.05');
    expect(PRICE_TABLE_V1[6]).toBe('177.16');
  });

  it('lock amount equals Day6 price; mint price equals Day0', () => {
    expect(PURCHASE_LOCK_AMOUNT).toBe(PRICE_TABLE_V1[6]);
    expect(DAY0_MINT_PRICE).toBe(PRICE_TABLE_V1[0]);
  });

  it('P2P platform fee is always 0 (immutable)', () => {
    expect(P2P_PLATFORM_FEE).toBe('0');
  });
});

describe('Buyback v1.0', () => {
  it('6 x 28.57142857 + 28.57142858 == exactly 200.00', () => {
    const payments = [...Array.from({ length: 6 }, () => BUYBACK_PAYMENT_AMOUNT),
      BUYBACK_FINAL_PAYMENT_AMOUNT];
    expect(payments).toHaveLength(BUYBACK_PAYMENT_COUNT);
    // scale 8: 200.00000000 == 20000000000n
    expect(sumAsCents(payments, 8)).toBe(20_000_000_000n);
    expect(BUYBACK_TOTAL).toBe('200.00');
  });
});

describe('Reserve Allocation v1.0', () => {
  it('sums to exactly 100.00', () => {
    expect(sumAsCents(Object.values(RESERVE_ALLOCATION_V1), 2)).toBe(10_000n);
  });
});

describe('Burn Target v1.1 (Decision 069)', () => {
  it('matches the revised ladder (+0.7pt over Decision 002)', () => {
    expect(BURN_TARGET_RATE_V1.NORMAL).toBe('0.107');
    expect(BURN_TARGET_RATE_V1.WATCH).toBe('0.111');
    expect(BURN_TARGET_RATE_V1.WINTER).toBe('0.115');
    expect(BURN_TARGET_RATE_V1.EMERGENCY).toBe('0.119');
  });
});

describe('Buff Table v1.0 (Decision 020)', () => {
  it('probabilities sum to 1 and bonuses match spec', () => {
    expect(sumAsCents(Object.values(BUFF_TABLE_V1).map((b) => b.probability), 2)).toBe(100n);
    expect(BUFF_TABLE_V1.N.bonusScore).toBe(4);
    expect(BUFF_TABLE_V1.R.bonusScore).toBe(7);
    expect(BUFF_TABLE_V1.SR.bonusScore).toBe(10);
    expect(REVENGE_BUFF_MODIFIER_V1).toEqual({ N: 4, R: 7, SR: 10 });
  });
});

describe('Horse Generation v1.0', () => {
  it('type and rarity probabilities each sum to 1', () => {
    expect(sumAsCents(Object.values(HORSE_TYPE_PROBABILITY_V1), 2)).toBe(100n);
    expect(sumAsCents(Object.values(RARITY_PROBABILITY_V1), 2)).toBe(100n);
  });

  it('ability weights sum to 1', () => {
    const total = Object.values(ABILITY_WEIGHTS_V1).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('rarity modifiers are +0/+1/+2/+3/+4', () => {
    expect(RARITY_MODIFIER_V1).toEqual({
      COMMON: 0,
      UNCOMMON: 1,
      RARE: 2,
      EPIC: 3,
      LEGENDARY: 4,
    });
  });
});

describe('Training modifiers v1.0 (03_GAME_DESIGN.md)', () => {
  it('SPRINTER: SPEED +5, others +3', () => {
    expect(trainingModifierV1('SPRINTER', 'SPEED_TRAINING')).toBe(5);
    expect(trainingModifierV1('SPRINTER', 'POWER_TRAINING')).toBe(3);
  });
  it('POWER: POWER +5', () => {
    expect(trainingModifierV1('POWER', 'POWER_TRAINING')).toBe(5);
    expect(trainingModifierV1('POWER', 'SPEED_TRAINING')).toBe(3);
  });
  it('RECOVERY training is +4 for non-special types', () => {
    expect(trainingModifierV1('SPRINTER', 'RECOVERY_TRAINING')).toBe(4);
    expect(trainingModifierV1('LUCK', 'RECOVERY_TRAINING')).toBe(4);
  });
  it('BALANCED: any training +4', () => {
    expect(trainingModifierV1('BALANCED', 'SPEED_TRAINING')).toBe(4);
    expect(trainingModifierV1('BALANCED', 'POWER_TRAINING')).toBe(4);
    expect(trainingModifierV1('BALANCED', 'RECOVERY_TRAINING')).toBe(4);
  });
  it('ENDURANCE: RECOVERY +5, others +3', () => {
    expect(trainingModifierV1('ENDURANCE', 'RECOVERY_TRAINING')).toBe(5);
    expect(trainingModifierV1('ENDURANCE', 'SPEED_TRAINING')).toBe(3);
  });
  it('no training = 0', () => {
    expect(trainingModifierV1('SPRINTER', null)).toBe(0);
  });
});

describe('Batch steps v1.0', () => {
  it('has exactly 37 steps in fixed order', () => {
    expect(BATCH_STEPS_V1).toHaveLength(37);
    BATCH_STEPS_V1.forEach((s, i) => expect(s.stepNumber).toBe(i + 1));
  });

  it('retryable steps match the Admin Recovery allow list', () => {
    const retryable = BATCH_STEPS_V1.filter((s) => s.retryable).map((s) => s.key);
    expect(retryable).toEqual([
      'PAY_MLM_REWARDS',
      'PAY_DUE_BUYBACKS',
      'REFUND_UNASSIGNED_SESSIONS',
      'CREATE_LIQUIDITY_REPORT',
      'RUN_STRESS_TESTS',
      'SAVE_TOMORROW_POLICY',
      'CREATE_AUDIT_SNAPSHOT',
    ]);
  });

  it('immutable steps are never retryable', () => {
    const forbidden = [
      'RUN_RACE_ENGINE',
      'FINALIZE_RACE_RANKINGS',
      'SELECT_BURN_TARGETS',
      'COMMIT_RACE_SEEDS',
      'CREATE_PARTICIPANT_SNAPSHOTS',
      'FINALIZE_OWNERSHIP_TRANSFERS',
    ];
    for (const key of forbidden) {
      const step = BATCH_STEPS_V1.find((s) => s.key === key);
      expect(step?.retryable).toBe(false);
    }
  });

  it('defines the 8 daily stress scenarios', () => {
    expect(STRESS_SCENARIOS_V1).toHaveLength(8);
  });
});

describe('misc fixed values', () => {
  it('MLM reward is 10.00, max sessions 10', () => {
    expect(MLM_REWARD_AMOUNT).toBe('10.00');
    expect(MAX_CONCURRENT_PURCHASE_SESSIONS).toBe(1000); // Decision 096: 実質無制限(安全天井)
  });

  it('support bonus tiers (Decision 074): 3/2/1x5 summing to the 10.00 cap', () => {
    expect(SUPPORT_BONUS_MAX_TIERS_V1).toBe(7);
    expect(SUPPORT_BONUS_TIER_AMOUNTS_V1).toEqual(['3.00', '2.00', '1.00', '1.00', '1.00', '1.00', '1.00']);
    const total = SUPPORT_BONUS_TIER_AMOUNTS_V1.reduce((acc, a) => acc + Math.round(Number(a) * 100), 0);
    expect(total).toBe(Math.round(Number(MLM_REWARD_AMOUNT) * 100));
    expect(SUPPORT_BONUS_TIER_THRESHOLDS_V1).toEqual(['0', '3001', '5001', '10001', '30001', '50001', '70001']);
    expect(SUPPORT_BONUS_TIER_THRESHOLDS_V1).toHaveLength(SUPPORT_BONUS_MAX_TIERS_V1);
    expect(SUPPORT_BONUS_TIER_AMOUNTS_V1).toHaveLength(SUPPORT_BONUS_MAX_TIERS_V1);
  });

  it('org unlock thresholds (Decision 077) with the direct requirement from T5', () => {
    expect(SUPPORT_BONUS_ORG_THRESHOLDS_V1).toEqual(['0', '10000', '20000', '50000', '250000', '400000', '600000']);
    expect(SUPPORT_BONUS_ORG_THRESHOLDS_V1).toHaveLength(SUPPORT_BONUS_MAX_TIERS_V1);
    expect(SUPPORT_BONUS_DIRECT_REQUIRED_FROM_TIER).toBe(5);
  });

  it('economy severity order is EMERGENCY > WINTER > WATCH > NORMAL', () => {
    expect(ECONOMY_STATUS_SEVERITY.EMERGENCY).toBeGreaterThan(ECONOMY_STATUS_SEVERITY.WINTER);
    expect(ECONOMY_STATUS_SEVERITY.WINTER).toBeGreaterThan(ECONOMY_STATUS_SEVERITY.WATCH);
    expect(ECONOMY_STATUS_SEVERITY.WATCH).toBeGreaterThan(ECONOMY_STATUS_SEVERITY.NORMAL);
  });
});
