import { describe, expect, it } from 'vitest';
import { deriveItemSetting, resolveItemEffect } from '../src/item.js';
import { computeScore, ScoreRangeError, type ScoreInput } from '../src/score.js';

const VERSION = 'race_engine_v1.1';

function scoreInput(over: Partial<ScoreInput> = {}): ScoreInput {
  return {
    horseUuid: '9b1c2d3e-0000-4000-8000-000000000001',
    horseType: 'BALANCED',
    rarity: 'COMMON',
    baseAbilityScore: 75,
    dnaModifier: 0,
    training: null,
    weather: 'CLOUDY',
    track: 'GOOD',
    condition: 60,
    fatigue: 10,
    buffRarity: null,
    raceSeed: 'seed-item-test',
    raceEngineVersion: VERSION,
    ...over,
  };
}

describe('deriveItemSetting (設定1〜6, seed commit-reveal)', () => {
  it('is deterministic for the same seed and version', () => {
    const a = deriveItemSetting('seed-a', VERSION);
    expect(deriveItemSetting('seed-a', VERSION)).toBe(a);
    expect(a).toBeGreaterThanOrEqual(1);
    expect(a).toBeLessThanOrEqual(6);
  });

  it('matches the published distribution (10/15/25/25/15/10) over many seeds', () => {
    const counts = [0, 0, 0, 0, 0, 0];
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      const setting = deriveItemSetting(`dist-seed-${i}`, VERSION);
      counts[setting - 1] = (counts[setting - 1] ?? 0) + 1;
    }
    const expected = [0.10, 0.15, 0.25, 0.25, 0.15, 0.10];
    counts.forEach((c, i) => {
      expect(Math.abs(c / n - expected[i]!)).toBeLessThan(0.012);
    });
  });
});

describe('resolveItemEffect', () => {
  const ctx = {
    horseType: 'SPRINTER' as const,
    currentDay: 3,
    training: 'SPEED_TRAINING' as const,
    prevCondition: 60,
    prevFatigue: 10,
    weather: 'CLOUDY' as const,
  };

  it('null item resolves to zeros', () => {
    expect(resolveItemEffect(null, ctx, 3)).toEqual({
      itemPoints: 0, randomShift: 0, conditionDelta: 0, fatigueDelta: 0,
    });
  });

  it('applies the setting coefficient to the public rule', () => {
    // speed_feed on SPRINTER doing SPEED = 1.5 raw; setting 6 -> x1.5 = 2.25
    expect(resolveItemEffect('speed_feed', ctx, 6).itemPoints).toBe(2.25);
    expect(resolveItemEffect('speed_feed', ctx, 1).itemPoints).toBe(0.75);
  });
});

describe('computeScore v1.1 item integration', () => {
  it('adds itemPoints as item_modifier; defaults keep v1.0 scores byte-identical', () => {
    const without = computeScore(scoreInput());
    const withItem = computeScore(scoreInput({ itemPoints: 2.25, itemRandomShift: 0 }));
    expect(without.itemModifier).toBe(0);
    expect(withItem.itemModifier).toBe(2.25);
    expect(withItem.finalScore).toBeCloseTo(without.finalScore + 2.25, 10);
    expect(withItem.randomModifier).toBe(without.randomModifier);
  });

  it('shifts the random modifier additively (stacks with the LUCK range)', () => {
    const base = computeScore(scoreInput({ horseType: 'LUCK', training: 'SPEED_TRAINING' }));
    const shifted = computeScore(
      scoreInput({ horseType: 'LUCK', training: 'SPEED_TRAINING', itemRandomShift: 1.5 }),
    );
    expect(shifted.randomModifier).toBeCloseTo(base.randomModifier + 1.5, 10);
    expect(shifted.randomModifier).toBeLessThanOrEqual(5.5);
  });

  it('rejects out-of-range item inputs (corrupted snapshots must throw)', () => {
    expect(() => computeScore(scoreInput({ itemPoints: 6.5 }))).toThrow(ScoreRangeError);
    expect(() => computeScore(scoreInput({ itemPoints: -0.5 }))).toThrow(ScoreRangeError);
    expect(() => computeScore(scoreInput({ itemRandomShift: 9 }))).toThrow(ScoreRangeError);
  });
});
