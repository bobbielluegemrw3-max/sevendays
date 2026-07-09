import { describe, expect, it } from 'vitest';
import { resolveItemEffect } from '../src/item.js';
import { deriveSurface } from '../src/environment.js';
import { computeScore, ScoreRangeError, type ScoreInput } from '../src/score.js';
import type { RaceConditions } from '@sevendays/domain';

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

describe('deriveSurface (芝/ダート, seed commit-reveal — Decision 082)', () => {
  it('is deterministic for the same seed and version', () => {
    const a = deriveSurface('seed-a', VERSION);
    expect(deriveSurface('seed-a', VERSION)).toBe(a);
    expect(['TURF', 'DIRT']).toContain(a);
  });

  it('matches the published distribution (60/40) over many seeds', () => {
    let turf = 0;
    const n = 20000;
    for (let i = 0; i < n; i += 1) {
      if (deriveSurface(`dist-seed-${i}`, VERSION) === 'TURF') turf += 1;
    }
    expect(Math.abs(turf / n - 0.6)).toBeLessThan(0.012);
  });
});

describe('resolveItemEffect (conditions v2)', () => {
  const ctx = {
    horseType: 'SPRINTER' as const,
    currentDay: 3,
    training: 'SPEED_TRAINING' as const,
    prevCondition: 60,
    prevFatigue: 10,
    weather: 'CLOUDY' as const,
  };
  const ordinary: RaceConditions = { weather: 'CLOUDY', track: 'GOOD', surface: 'TURF' };

  it('null item resolves to zeros', () => {
    expect(resolveItemEffect(null, ctx, ordinary)).toEqual({
      itemPoints: 0, randomShift: 0, conditionDelta: 0, fatigueDelta: 0,
    });
  });

  it('applies the affinity coefficient to the public rule', () => {
    // speed_feed (ALL) on SPRINTER doing SPEED = 1.5 raw; ALL -> x1.0 whatever the night
    expect(resolveItemEffect('speed_feed', ctx, ordinary).itemPoints).toBe(1.5);
    expect(
      resolveItemEffect('speed_feed', ctx, { weather: 'STORM', track: 'HEAVY', surface: 'DIRT' })
        .itemPoints,
    ).toBe(1.5);
    // dirt_shoes (DIRT affinity, raw 0.75): dirt -> x1.5, turf -> x0.67
    expect(
      resolveItemEffect('dirt_shoes', ctx, { ...ordinary, surface: 'DIRT' }).itemPoints,
    ).toBeCloseTo(1.13, 10);
    expect(resolveItemEffect('dirt_shoes', ctx, ordinary).itemPoints).toBeCloseTo(0.5, 10);
    // storm_emperor_cloak (STORM_EPIC, raw 1.5): storm -> x1.5 = 2.25
    expect(
      resolveItemEffect('storm_emperor_cloak', ctx, { ...ordinary, weather: 'STORM' }).itemPoints,
    ).toBe(2.25);
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
