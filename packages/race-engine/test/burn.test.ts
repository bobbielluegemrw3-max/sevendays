import { describe, expect, it } from 'vitest';
import { burnTargetCount, selectBurnTargets } from '../src/burn.js';
import { rollBuffRarity } from '../src/buff.js';
import { rankParticipants } from '../src/ranking.js';

const VERSION = 'race_engine_v1.0';

describe('burn target count (immutable floor rule)', () => {
  it('floor(eligible * rate) per economy status', () => {
    // Burn ladder v1.1 (Decision 069: +0.7pt over the original values)
    expect(burnTargetCount(1000, 'NORMAL')).toBe(107); // 10.7%
    expect(burnTargetCount(1000, 'WATCH')).toBe(111); // 11.1%
    expect(burnTargetCount(1000, 'WINTER')).toBe(115); // 11.5%
    expect(burnTargetCount(1000, 'EMERGENCY')).toBe(119); // 11.9%
    expect(burnTargetCount(999, 'WATCH')).toBe(110); // 110.889 -> floor
    expect(burnTargetCount(25, 'WATCH')).toBe(2); // 2.775 -> 2
    expect(burnTargetCount(7, 'NORMAL')).toBe(0); // 0.749 -> 0
  });
});

describe('burn target selection', () => {
  const ranking = rankParticipants(
    Array.from({ length: 10 }, (_, i) => ({
      horseUuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      finalScore: 100 - i, // rank == i+1
    })),
    'burn-seed',
    VERSION,
  );

  it('selects exactly the bottom N ranks', () => {
    const targets = selectBurnTargets(ranking, 3);
    expect(targets).toHaveLength(3);
    const ranks = ranking.filter((r) => targets.includes(r.horseUuid)).map((r) => r.finalRank);
    expect(ranks.sort((a, b) => a - b)).toEqual([8, 9, 10]);
  });

  it('never burns more than the target count; zero burns nothing', () => {
    expect(selectBurnTargets(ranking, 0)).toEqual([]);
    expect(() => selectBurnTargets(ranking, 11)).toThrow('BURN_COUNT_EXCEEDS_PARTICIPANTS');
  });

  it('tied scores never cause extra burns (total order already resolved)', () => {
    const tied = rankParticipants(
      Array.from({ length: 6 }, (_, i) => ({
        horseUuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        finalScore: 70, // ALL tied
      })),
      'tie-seed',
      VERSION,
    );
    const targets = selectBurnTargets(tied, 2);
    expect(targets).toHaveLength(2); // exactly 2 despite a 6-way tie
    expect(selectBurnTargets(tied, 2)).toEqual(targets); // deterministic
  });
});

describe('revenge buff roll (03_GAME_DESIGN.md)', () => {
  const base = {
    raceSeed: 'buff-seed',
    horseUuid: '00000000-0000-4000-8000-000000000001',
    ownerUserIdAtSnapshot: '11111111-1111-4111-8111-111111111111',
    burnEventId: '22222222-2222-4222-8222-222222222222',
    buffPolicyVersion: 'buff_policy_v1.0',
  };

  it('is deterministic and bonus follows the table (N+4/R+7/SR+10)', () => {
    const a = rollBuffRarity(base);
    expect(rollBuffRarity(base)).toEqual(a);
    expect({ N: 4, R: 7, SR: 10 }[a.rarity]).toBe(a.bonusScore);
    // any input change changes the roll hash
    expect(rollBuffRarity({ ...base, burnEventId: 'x' }).rollHash).not.toBe(a.rollHash);
  });

  it('distribution matches N30/R50/SR20 (n=3000)', () => {
    const counts = { N: 0, R: 0, SR: 0 };
    const n = 3000;
    for (let i = 0; i < n; i += 1) {
      const roll = rollBuffRarity({ ...base, burnEventId: `event-${i}` });
      counts[roll.rarity] += 1;
    }
    expect(counts.N / n).toBeGreaterThan(0.25);
    expect(counts.N / n).toBeLessThan(0.35);
    expect(counts.R / n).toBeGreaterThan(0.45);
    expect(counts.R / n).toBeLessThan(0.55);
    expect(counts.SR / n).toBeGreaterThan(0.15);
    expect(counts.SR / n).toBeLessThan(0.25);
  });
});
