import { hashToUnitInterval, sha256Parts } from '@sevendays/shared';

/**
 * Deterministic random derivation. EVERY random value in the game comes from
 * SHA-256 over explicit parts — no Math.random, no clocks.
 *
 * Portability note: normal deviates use the Irwin-Hall sum of 12 uniforms
 * instead of Box-Muller, because transcendental functions (log/cos) are not
 * bit-identical across JS engines while IEEE-754 add/multiply are. Replays
 * must be bit-exact on any runtime.
 */

/** Uniform [0,1) from hashed parts. */
export function unitFromParts(...parts: readonly string[]): number {
  return hashToUnitInterval(sha256Parts(...parts));
}

/** Round to 2 decimals (all published game values use 2dp). */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

/** Uniform scaled to [min, max], 2dp. */
export function uniformInRange(u: number, min: number, max: number): number {
  return round2(min + u * (max - min));
}

/**
 * Weighted draw over a probability table. Iteration follows the table's
 * insertion order, which is part of the versioned algorithm — do not reorder
 * table keys without a new version.
 */
export function weightedDraw<T extends string>(
  u: number,
  table: Readonly<Record<T, string>>,
): T {
  let cumulative = 0;
  const entries = Object.entries(table) as [T, string][];
  for (const [key, probability] of entries) {
    cumulative += Number(probability);
    if (u < cumulative) return key;
  }
  // Guard against floating-point tail (u ~ 0.9999... with cumulative 0.9999...)
  return entries[entries.length - 1]![0];
}

/**
 * Deterministic standard-normal deviate via Irwin-Hall: sum of 12 uniforms
 * minus 6 (mean 0, variance 1). Uses three salted hashes to obtain 12
 * independent 52-bit uniforms.
 */
export function normalFromParts(...parts: readonly string[]): number {
  let sum = 0;
  for (let block = 0; block < 3; block += 1) {
    const hash = sha256Parts(...parts, `ih${block}`);
    for (let i = 0; i < 4; i += 1) {
      sum += hashToUnitInterval(hash.slice(i * 13, i * 13 + 13));
    }
  }
  return sum - 6;
}

/** Normal deviate with mean/sd, clamped and rounded to 2dp. */
export function clampedNormal(
  mean: number,
  sd: number,
  min: number,
  max: number,
  ...parts: readonly string[]
): number {
  return round2(clamp(mean + sd * normalFromParts(...parts), min, max));
}
