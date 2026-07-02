import { describe, expect, it } from 'vitest';
import {
  sha256Hex,
  sha256Parts,
  hashToUnitInterval,
  deterministicScore,
  generateSecureSeedHex,
  verifyCommitReveal,
} from '../src/hash.js';

describe('sha256', () => {
  it('is deterministic', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('sha256Parts prevents concatenation collisions', () => {
    expect(sha256Parts('ab', 'c')).not.toBe(sha256Parts('a', 'bc'));
  });
});

describe('hashToUnitInterval', () => {
  it('returns [0, 1) deterministically', () => {
    const h = sha256Hex('seed');
    const v = hashToUnitInterval(h);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
    expect(hashToUnitInterval(h)).toBe(v);
  });

  it('rejects non-hex input', () => {
    expect(() => hashToUnitInterval('zzz')).toThrow(TypeError);
  });
});

describe('deterministicScore', () => {
  it('same parts -> same score; different parts -> different score', () => {
    const a = deterministicScore('race1', 'horseA', 'v1');
    expect(deterministicScore('race1', 'horseA', 'v1')).toBe(a);
    expect(deterministicScore('race1', 'horseB', 'v1')).not.toBe(a);
  });
});

describe('commit-reveal', () => {
  it('verifies a valid seed and rejects a tampered one', () => {
    const seed = generateSecureSeedHex();
    const commit = sha256Hex(seed);
    expect(verifyCommitReveal(seed, commit)).toBe(true);
    expect(verifyCommitReveal(seed + '0', commit)).toBe(false);
  });

  it('generates unique seeds', () => {
    expect(generateSecureSeedHex()).not.toBe(generateSecureSeedHex());
  });
});
