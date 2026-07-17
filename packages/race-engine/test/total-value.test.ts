import { describe, expect, it } from 'vitest';
import {
  computeDailyState,
  computeScore,
  deterministicScoreV0,
  tonightBand,
  totalValueV0,
  type TotalValueInputV0,
} from '../src/index.js';
import { ABILITY_WEIGHTS_V1, type AbilityName, type HorseType, type Rarity, type TrainingType } from '@sevendays/domain';

/**
 * 総合値V0(FUN改修 A1)。核心は「表示値がエンジンの実計算と一致していること」—
 * computeScore の実出力から weather/track/random(/buff/item) を引いた決定論部分と
 * deterministicScoreV0 が完全一致することを検証する(嘘の数字を見せない不変条項)。
 */

const ABIL = { speed: 70, power: 65, stamina: 80, recovery: 60, luck: 75 };

function input(over: Partial<TotalValueInputV0> = {}): TotalValueInputV0 {
  return {
    abilityJson: ABIL,
    horseType: 'BALANCED',
    rarity: 'RARE',
    dnaModifier: 0.5,
    condition: 70,
    fatigue: 10,
    training: 'RECOVERY_TRAINING',
    ...over,
  };
}

describe('totalValueV0', () => {
  it('computeScoreの決定論部分と完全一致する(実エンジン突合)', () => {
    const cases: Array<[HorseType, Rarity, TrainingType | null, number, number]> = [
      ['BALANCED', 'COMMON', null, 50, 0],
      ['SPRINTER', 'LEGENDARY', 'SPEED_TRAINING', 90, 40],
      ['POWER', 'RARE', 'POWER_TRAINING', 30, 80],
      ['ENDURANCE', 'UNCOMMON', 'RECOVERY_TRAINING', 65, 55],
      ['LUCK', 'EPIC', 'RECOVERY_TRAINING', 100, 100],
    ];
    for (const [horseType, rarity, training, condition, fatigue] of cases) {
      const tv = input({ horseType, rarity, training, condition, fatigue });
      // エンジンが今夜のスナップショットで行うのと同じ状態投影
      const state = computeDailyState({
        prevCondition: condition,
        prevFatigue: fatigue,
        training,
        ranRace: true,
      });
      const breakdown = computeScore({
        horseUuid: '00000000-0000-4000-8000-000000000001',
        horseType,
        rarity,
        baseAbilityScore: (Object.keys(ABILITY_WEIGHTS_V1) as AbilityName[]).reduce(
          (sum, name) => sum + (ABIL as Record<string, number>)[name]! * ABILITY_WEIGHTS_V1[name],
          0,
        ),
        dnaModifier: 0.5,
        training,
        weather: 'SUNNY',
        track: 'GOOD',
        condition: state.condition,
        fatigue: state.fatigue,
        buffRarity: null,
        raceSeed: 'seed-x',
        raceEngineVersion: 'race_v1.0',
      });
      const deterministic =
        breakdown.finalScore -
        breakdown.weatherModifier -
        breakdown.trackModifier -
        breakdown.randomModifier -
        breakdown.revengeBuffModifier -
        breakdown.itemModifier;
      expect(deterministicScoreV0(tv)).toBeCloseTo(deterministic, 2);
    }
  });

  it('0〜100の整数を返し、境界でクランプされる', () => {
    const worst = totalValueV0(
      input({
        abilityJson: { speed: 50, power: 50, stamina: 50, recovery: 50, luck: 50 },
        rarity: 'COMMON', dnaModifier: -2, condition: 0, fatigue: 100, training: null,
      }),
    );
    const best = totalValueV0(
      input({
        abilityJson: { speed: 100, power: 100, stamina: 100, recovery: 100, luck: 100 },
        horseType: 'SPRINTER', rarity: 'LEGENDARY', dnaModifier: 2,
        condition: 100, fatigue: 0, training: 'SPEED_TRAINING',
      }),
    );
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(best).toBeLessThanOrEqual(100);
    expect(best).toBeGreaterThan(worst);
    expect(Number.isInteger(worst) && Number.isInteger(best)).toBe(true);
  });

  it('調教すると総合値が上がる(未調教との比較)', () => {
    const untrained = totalValueV0(input({ training: null }));
    const trained = totalValueV0(input({ training: 'RECOVERY_TRAINING' }));
    expect(trained).toBeGreaterThan(untrained);
  });

  it('疲労が高いほど総合値が下がる', () => {
    expect(totalValueV0(input({ fatigue: 0 }))).toBeGreaterThanOrEqual(
      totalValueV0(input({ fatigue: 90 })),
    );
  });

  it('tonightBand: 上位40%=SAFE・下位25%=RISK・間=MID', () => {
    expect(tonightBand(1, 100)).toBe('SAFE');
    expect(tonightBand(40, 100)).toBe('SAFE');
    expect(tonightBand(41, 100)).toBe('MID');
    expect(tonightBand(75, 100)).toBe('MID');
    expect(tonightBand(76, 100)).toBe('RISK');
    expect(tonightBand(100, 100)).toBe('RISK');
    expect(tonightBand(0, 0)).toBe('MID');
  });
});
