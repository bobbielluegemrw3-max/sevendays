import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { generateHorse } from '../src/horse-generation.js';
import { generateBaseName, resolveNameCollision, NAME_PREFIXES_V1, NAME_SUFFIXES_V1 } from '../src/name-generator.js';

const VERSION = 'horse_generation_v1.0';

describe('Horse Generation v1.0 determinism', () => {
  it('same inputs always generate the same horse (no reroll possible)', () => {
    const input = {
      mintSeed: 'seed-abc',
      horseUuid: '11111111-1111-4111-8111-111111111111',
      userUuid: '22222222-2222-4222-8222-222222222222',
      version: VERSION,
    };
    const a = generateHorse(input);
    const b = generateHorse(input);
    expect(b).toEqual(a);
  });

  it('different horse uuid -> different horse; different version -> different horse', () => {
    const base = {
      mintSeed: 'seed-abc',
      horseUuid: '11111111-1111-4111-8111-111111111111',
      userUuid: '22222222-2222-4222-8222-222222222222',
      version: VERSION,
    };
    const a = generateHorse(base);
    const b = generateHorse({ ...base, horseUuid: '33333333-3333-4333-8333-333333333333' });
    const c = generateHorse({ ...base, version: 'horse_generation_v2.0' });
    expect(b.dnaHash).not.toBe(a.dnaHash);
    expect(c.dnaHash).not.toBe(a.dnaHash);
  });

  it('abilities are clamped to [50,100] with 2dp; dna modifier in [-2,+2]', () => {
    for (let i = 0; i < 200; i += 1) {
      const horse = generateHorse({
        mintSeed: `seed-${i}`,
        horseUuid: randomUUID(),
        userUuid: randomUUID(),
        version: VERSION,
      });
      for (const value of Object.values(horse.abilities)) {
        expect(value).toBeGreaterThanOrEqual(50);
        expect(value).toBeLessThanOrEqual(100);
        expect(Math.round(value * 100) / 100).toBe(value);
      }
      expect(horse.dnaModifier).toBeGreaterThanOrEqual(-2);
      expect(horse.dnaModifier).toBeLessThanOrEqual(2);
      expect(horse.baseAbilityScore).toBeGreaterThanOrEqual(50);
      expect(horse.baseAbilityScore).toBeLessThanOrEqual(100);
    }
  });

  it('base_ability_score uses the fixed weights', () => {
    const horse = generateHorse({
      mintSeed: 'weights-check',
      horseUuid: '11111111-1111-4111-8111-111111111111',
      userUuid: '22222222-2222-4222-8222-222222222222',
      version: VERSION,
    });
    const expected =
      horse.abilities.speed * 0.25 +
      horse.abilities.power * 0.25 +
      horse.abilities.stamina * 0.2 +
      horse.abilities.recovery * 0.15 +
      horse.abilities.luck * 0.15;
    expect(horse.baseAbilityScore).toBe(Math.round(expected * 100) / 100);
  });

  it('type and rarity distributions match the spec (statistical smoke, n=5000)', () => {
    const typeCounts = new Map<string, number>();
    const rarityCounts = new Map<string, number>();
    const n = 5000;
    for (let i = 0; i < n; i += 1) {
      const horse = generateHorse({
        mintSeed: 'distribution-seed',
        horseUuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        userUuid: '22222222-2222-4222-8222-222222222222',
        version: VERSION,
      });
      typeCounts.set(horse.horseType, (typeCounts.get(horse.horseType) ?? 0) + 1);
      rarityCounts.set(horse.rarity, (rarityCounts.get(horse.rarity) ?? 0) + 1);
    }
    // types: 20% each ±4pt
    for (const type of ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK']) {
      expect((typeCounts.get(type) ?? 0) / n).toBeGreaterThan(0.16);
      expect((typeCounts.get(type) ?? 0) / n).toBeLessThan(0.24);
    }
    // rarity: COMMON 50±4, LEGENDARY 2±1.5
    expect((rarityCounts.get('COMMON') ?? 0) / n).toBeGreaterThan(0.46);
    expect((rarityCounts.get('COMMON') ?? 0) / n).toBeLessThan(0.54);
    expect((rarityCounts.get('LEGENDARY') ?? 0) / n).toBeGreaterThan(0.005);
    expect((rarityCounts.get('LEGENDARY') ?? 0) / n).toBeLessThan(0.035);
    // ability mean around 75 (clamping pulls slightly)
  });

  it('type and rarity are independent draws (LEGENDARY exists in multiple types)', () => {
    const legendaryTypes = new Set<string>();
    for (let i = 0; i < 8000 && legendaryTypes.size < 3; i += 1) {
      const horse = generateHorse({
        mintSeed: 'independence-seed',
        horseUuid: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        userUuid: '22222222-2222-4222-8222-222222222222',
        version: VERSION,
      });
      if (horse.rarity === 'LEGENDARY') legendaryTypes.add(horse.horseType);
    }
    expect(legendaryTypes.size).toBeGreaterThanOrEqual(2);
  });
});

describe('Name Generator (Decision 055)', () => {
  it('is deterministic and uses the fixed vocabulary', () => {
    const input = { mintSeed: 'name-seed', horseUuid: randomUUID(), version: VERSION };
    const a = generateBaseName(input);
    expect(generateBaseName(input)).toBe(a);
    const [prefix = '', suffix = ''] = a.split(' ');
    expect(NAME_PREFIXES_V1).toContain(prefix);
    expect(NAME_SUFFIXES_V1).toContain(suffix);
  });

  it('resolves collisions: base -> II -> III ... -> XII -> G code', () => {
    expect(resolveNameCollision('Royal Thunder', 0)).toBe('Royal Thunder');
    expect(resolveNameCollision('Royal Thunder', 1)).toBe('Royal Thunder II');
    expect(resolveNameCollision('Royal Thunder', 2)).toBe('Royal Thunder III');
    expect(resolveNameCollision('Royal Thunder', 9)).toBe('Royal Thunder X');
    expect(resolveNameCollision('Royal Thunder', 11)).toBe('Royal Thunder XII');
    expect(resolveNameCollision('Royal Thunder', 12)).toBe('Royal Thunder G13');
  });
});
