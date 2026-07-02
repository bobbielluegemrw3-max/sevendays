import { createHash, randomBytes } from 'node:crypto';

/**
 * Deterministic hashing helpers.
 *
 * All deterministic draws in the spec are defined as SHA-256 over
 * concatenated inputs (race seeds, tie-breaks, ability rolls, buff rolls).
 * Callers pass the parts; concatenation uses a fixed separator so that
 * ("ab","c") and ("a","bc") can never collide.
 */

export const HASH_SEPARATOR = '|';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** SHA-256 over parts joined with the fixed separator. */
export function sha256Parts(...parts: readonly string[]): string {
  return sha256Hex(parts.join(HASH_SEPARATOR));
}

/**
 * Map a hex hash to a deterministic float in [0, 1).
 * Uses the first 13 hex chars (52 bits) so the value is exact in IEEE-754.
 */
export function hashToUnitInterval(hashHex: string): number {
  if (!/^[0-9a-f]{13,}$/i.test(hashHex)) {
    throw new TypeError(`Expected a hex hash of at least 13 chars: "${hashHex}"`);
  }
  const bits = parseInt(hashHex.slice(0, 13), 16);
  return bits / 2 ** 52;
}

/**
 * Deterministic tie-break score in [0, 1) from hash parts.
 * Used for race ranking, market queue, buyer queue, and listing selection
 * tie-breakers (03/04/05 specs).
 */
export function deterministicScore(...parts: readonly string[]): number {
  return hashToUnitInterval(sha256Parts(...parts));
}

/** Cryptographically secure random seed (hex). Used for commit-reveal seed generation. */
export function generateSecureSeedHex(byteLength = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/** Commit-reveal verification: SHA-256(revealed seed) must equal the committed hash. */
export function verifyCommitReveal(revealSeed: string, commitHash: string): boolean {
  return sha256Hex(revealSeed) === commitHash.toLowerCase();
}
