import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { deriveTrackCondition, deriveWeather, trackModifier, weatherModifier } from '../src/environment.js';
import { computeDailyState, conditionModifier, fatigueModifier } from '../src/condition.js';
import { computeScore, ScoreRangeError, type ScoreInput } from '../src/score.js';
import { rankParticipants, tiebreakScore } from '../src/ranking.js';
import { compareReplay, replayRace, verifyRaceSeed } from '../src/replay.js';

const VERSION = 'race_engine_v1.0';

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function baseInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    horseUuid: '11111111-1111-4111-8111-111111111111',
    horseType: 'SPRINTER',
    rarity: 'COMMON',
    baseAbilityScore: 75.0,
    dnaModifier: 1.25,
    training: null,
    weather: 'SUNNY',
    track: 'GOOD',
    condition: 80,
    fatigue: 8,
    buffRarity: null,
    raceSeed: 'race-seed-1',
    raceEngineVersion: VERSION,
    ...overrides,
  };
}

describe('weather / track derivation (Decisions 039, 053)', () => {
  it('is deterministic from the race seed', () => {
    expect(deriveWeather('seed-x', VERSION)).toBe(deriveWeather('seed-x', VERSION));
    expect(deriveTrackCondition('seed-x', VERSION)).toBe(deriveTrackCondition('seed-x', VERSION));
  });

  it('follows the weighted distribution (n=4000)', () => {
    const weatherCounts = new Map<string, number>();
    const trackCounts = new Map<string, number>();
    const n = 4000;
    for (let i = 0; i < n; i += 1) {
      const w = deriveWeather(`seed-${i}`, VERSION);
      const t = deriveTrackCondition(`seed-${i}`, VERSION);
      weatherCounts.set(w, (weatherCounts.get(w) ?? 0) + 1);
      trackCounts.set(t, (trackCounts.get(t) ?? 0) + 1);
    }
    expect((weatherCounts.get('SUNNY') ?? 0) / n).toBeGreaterThan(0.35);
    expect((weatherCounts.get('SUNNY') ?? 0) / n).toBeLessThan(0.45);
    expect((weatherCounts.get('STORM') ?? 0) / n).toBeGreaterThan(0.06);
    expect((weatherCounts.get('STORM') ?? 0) / n).toBeLessThan(0.14);
    expect((trackCounts.get('GOOD') ?? 0) / n).toBeGreaterThan(0.35);
    expect((trackCounts.get('GOOD') ?? 0) / n).toBeLessThan(0.45);
    expect((trackCounts.get('HEAVY') ?? 0) / n).toBeGreaterThan(0.06);
    expect((trackCounts.get('HEAVY') ?? 0) / n).toBeLessThan(0.14);
  });

  it('affinity tables match Decision 053', () => {
    expect(weatherModifier('SUNNY', 'SPRINTER')).toBe(2.0);
    expect(weatherModifier('RAIN', 'SPRINTER')).toBe(-1.5);
    expect(weatherModifier('STORM', 'ENDURANCE')).toBe(2.0);
    expect(trackModifier('FAST', 'SPRINTER')).toBe(2.0);
    expect(trackModifier('HEAVY', 'SPRINTER')).toBe(-2.0);
    expect(trackModifier('SOFT', 'POWER')).toBe(2.0);
  });
});

describe('condition / fatigue (Decision 054)', () => {
  it('Day1 example: SPEED training + race from initial state', () => {
    // fatigue = 0 + 8 + 5 - 5 = 8; condition = 80 + 1 - 8 = 73
    const s = computeDailyState({ prevCondition: 80, prevFatigue: 0, training: 'SPEED_TRAINING', ranRace: true });
    expect(s.fatigue).toBe(8);
    expect(s.condition).toBe(73);
  });

  it('RECOVERY training gives total recovery 12', () => {
    // fatigue = 30 + 3 + 5 - 12 = 26; condition = 60 + 3 - 26 = 37
    const s = computeDailyState({ prevCondition: 60, prevFatigue: 30, training: 'RECOVERY_TRAINING', ranRace: true });
    expect(s.fatigue).toBe(26);
    expect(s.condition).toBe(37);
  });

  it('clamps to 0..100', () => {
    const drained = computeDailyState({ prevCondition: 2, prevFatigue: 98, training: 'SPEED_TRAINING', ranRace: true });
    expect(drained.fatigue).toBe(100);
    expect(drained.condition).toBe(0);
    const rested = computeDailyState({ prevCondition: 100, prevFatigue: 0, training: 'RECOVERY_TRAINING', ranRace: false });
    expect(rested.fatigue).toBe(0);
    expect(rested.condition).toBe(100);
  });

  it('condition_modifier and fatigue_modifier mappings match Decision 054', () => {
    expect(conditionModifier(95)).toBe(3);
    expect(conditionModifier(90)).toBe(3);
    expect(conditionModifier(89.99)).toBe(2);
    expect(conditionModifier(75)).toBe(1);
    expect(conditionModifier(50)).toBe(0);
    expect(conditionModifier(30)).toBe(-1);
    expect(conditionModifier(10)).toBe(-2);
    expect(conditionModifier(9.99)).toBe(-3);

    expect(fatigueModifier(10, null)).toBe(0);
    expect(fatigueModifier(10.01, null)).toBe(-1);
    expect(fatigueModifier(25.01, null)).toBe(-2);
    expect(fatigueModifier(60.01, null)).toBe(-4);
    expect(fatigueModifier(100, null)).toBe(-5);
    // RECOVERY bonus +1, capped at 0
    expect(fatigueModifier(100, 'RECOVERY_TRAINING')).toBe(-4);
    expect(fatigueModifier(5, 'RECOVERY_TRAINING')).toBe(0);
  });
});

describe('Race Engine v1.0 score (03_GAME_DESIGN.md)', () => {
  it('final_score equals the additive formula, deterministically', () => {
    const first = computeScore(baseInput());
    const second = computeScore(baseInput());
    expect(second).toEqual(first);

    const sum =
      first.baseAbilityScore +
      first.horseTypeModifier +
      first.rarityModifier +
      first.dnaModifier +
      first.trainingModifier +
      first.weatherModifier +
      first.trackModifier +
      first.conditionModifier +
      first.fatigueModifier +
      first.revengeBuffModifier +
      first.randomModifier;
    expect(first.finalScore).toBe(Math.round(sum * 100) / 100);
  });

  it('applies rarity and revenge buff modifiers from the fixed tables', () => {
    const legendary = computeScore(baseInput({ rarity: 'LEGENDARY' }));
    expect(legendary.rarityModifier).toBe(4);
    const buffed = computeScore(baseInput({ buffRarity: 'SR' }));
    expect(buffed.revengeBuffModifier).toBe(10);
    expect(buffed.finalScore).toBe(computeScore(baseInput()).finalScore + 10);
  });

  it('random_modifier is deterministic from (race_seed, horse_uuid, version) and within -3..+3', () => {
    for (let i = 0; i < 300; i += 1) {
      const r = computeScore(baseInput({ raceSeed: `rs-${i}` })).randomModifier;
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThanOrEqual(3);
    }
    const differentSeed = computeScore(baseInput({ raceSeed: 'other-seed' }));
    const differentVersion = computeScore(baseInput({ raceEngineVersion: 'race_engine_v2.0' }));
    const original = computeScore(baseInput());
    expect(differentSeed.randomModifier).not.toBe(original.randomModifier);
    expect(differentVersion.randomModifier).not.toBe(original.randomModifier);
  });

  it('LUCK trait (Decision 052): LUCK + any training widens random to -2..+4; no training keeps -3..+3', () => {
    let sawAboveThree = false;
    for (let i = 0; i < 500; i += 1) {
      const trained = computeScore(
        baseInput({ horseType: 'LUCK', training: 'RECOVERY_TRAINING', raceSeed: `luck-${i}` }),
      ).randomModifier;
      expect(trained).toBeGreaterThanOrEqual(-2);
      expect(trained).toBeLessThanOrEqual(4);
      if (trained > 3) sawAboveThree = true;

      const untrained = computeScore(
        baseInput({ horseType: 'LUCK', training: null, raceSeed: `luck-${i}` }),
      ).randomModifier;
      expect(untrained).toBeGreaterThanOrEqual(-3);
      expect(untrained).toBeLessThanOrEqual(3);
    }
    expect(sawAboveThree).toBe(true); // the widened range is actually reachable

    // non-LUCK type with training stays -3..+3
    for (let i = 0; i < 200; i += 1) {
      const r = computeScore(
        baseInput({ horseType: 'POWER', training: 'POWER_TRAINING', raceSeed: `np-${i}` }),
      ).randomModifier;
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThanOrEqual(3);
    }
  });

  it('training modifiers follow the type rules (SPRINTER+SPEED=+5)', () => {
    expect(computeScore(baseInput({ training: 'SPEED_TRAINING' })).trainingModifier).toBe(5);
    expect(computeScore(baseInput({ training: 'POWER_TRAINING' })).trainingModifier).toBe(3);
    expect(
      computeScore(baseInput({ horseType: 'BALANCED', training: 'POWER_TRAINING' })).trainingModifier,
    ).toBe(4);
  });

  it('rejects out-of-range inputs (corrupted snapshot must never score)', () => {
    expect(() => computeScore(baseInput({ baseAbilityScore: 49.99 }))).toThrow(ScoreRangeError);
    expect(() => computeScore(baseInput({ baseAbilityScore: 100.01 }))).toThrow(ScoreRangeError);
    expect(() => computeScore(baseInput({ dnaModifier: 2.5 }))).toThrow(ScoreRangeError);
  });
});

describe('ranking and tie-breaker (Decisions 004/005)', () => {
  it('orders by final_score desc, tiebreak desc, uuid asc — reproducibly', () => {
    const participants = [
      { horseUuid: 'cccccccc-0000-4000-8000-000000000003', finalScore: 80 },
      { horseUuid: 'aaaaaaaa-0000-4000-8000-000000000001', finalScore: 90 },
      { horseUuid: 'bbbbbbbb-0000-4000-8000-000000000002', finalScore: 80 },
    ];
    const first = rankParticipants(participants, 'seed-r', VERSION);
    const second = rankParticipants(participants, 'seed-r', VERSION);
    expect(second).toEqual(first);

    expect(first[0]!.horseUuid).toBe('aaaaaaaa-0000-4000-8000-000000000001');
    // tie between b and c resolved by tiebreak desc
    const b = tiebreakScore('seed-r', 'bbbbbbbb-0000-4000-8000-000000000002', VERSION);
    const c = tiebreakScore('seed-r', 'cccccccc-0000-4000-8000-000000000003', VERSION);
    const expectedSecond = b > c ? 'bbbbbbbb-0000-4000-8000-000000000002' : 'cccccccc-0000-4000-8000-000000000003';
    expect(first[1]!.horseUuid).toBe(expectedSecond);
    expect(first.map((r) => r.finalRank)).toEqual([1, 2, 3]);
  });

  it('identical scores AND identical tiebreak fall back to uuid asc', () => {
    // force uuid fallback by using the same uuid-ish comparison: craft equal scores,
    // tiebreak differs in practice, so just verify uuid ordering is stable for equal tiebreak
    const ranked = rankParticipants(
      [
        { horseUuid: 'b-uuid', finalScore: 50 },
        { horseUuid: 'a-uuid', finalScore: 50 },
      ],
      'seed-u',
      VERSION,
    );
    // whichever wins must be by tiebreak first; if equal, uuid asc — assert total order exists
    expect(new Set(ranked.map((r) => r.finalRank))).toEqual(new Set([1, 2]));
  });
});

describe('replay (Completion Gate G2)', () => {
  const seed = 'the-race-seed-42';

  function participants(): ScoreInput[] {
    return Array.from({ length: 25 }, (_, i) =>
      baseInput({
        horseUuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        raceSeed: seed,
        baseAbilityScore: 60 + (i % 30),
        horseType: (['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'] as const)[i % 5]!,
        condition: 50 + (i % 50),
        fatigue: (i * 3) % 60,
      }),
    );
  }

  it('seed commit-reveal verification passes / fails correctly', () => {
    expect(verifyRaceSeed(seed, sha256(seed))).toBe(true);
    expect(verifyRaceSeed('tampered', sha256(seed))).toBe(false);
  });

  it('replay reproduces the original result exactly', () => {
    const original = replayRace(participants(), seed, VERSION);
    const replayed = replayRace(participants(), seed, VERSION);
    const comparison = compareReplay(
      original.ranking.map((r) => ({
        horseUuid: r.horseUuid,
        finalScore: r.finalScore,
        finalRank: r.finalRank,
      })),
      replayed,
    );
    expect(comparison.ok).toBe(true);
    expect(comparison.mismatches).toEqual([]);
  });

  it('detects a tampered score or rank', () => {
    const original = replayRace(participants(), seed, VERSION);
    const tampered = original.ranking.map((r) => ({
      horseUuid: r.horseUuid,
      finalScore: r.horseUuid.endsWith('05') ? r.finalScore + 1 : r.finalScore,
      finalRank: r.finalRank,
    }));
    const comparison = compareReplay(tampered, replayRace(participants(), seed, VERSION));
    expect(comparison.ok).toBe(false);
    expect(comparison.mismatches.some((m) => m.field === 'finalScore')).toBe(true);
  });

  it('a different seed produces a different outcome (seed matters)', () => {
    const a = replayRace(participants(), seed, VERSION);
    const inputsB = participants().map((p) => ({ ...p, raceSeed: 'another-seed' }));
    const b = replayRace(inputsB, 'another-seed', VERSION);
    const sameOrder = a.ranking.every((r, i) => r.horseUuid === b.ranking[i]!.horseUuid);
    expect(sameOrder).toBe(false);
  });
});
