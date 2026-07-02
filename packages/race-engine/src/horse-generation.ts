import { hashToUnitInterval, sha256Parts } from '@sevendays/shared';
import {
  ABILITY_DISTRIBUTION_V1,
  ABILITY_NAMES,
  ABILITY_WEIGHTS_V1,
  DNA_MODIFIER_RANGE_V1,
  HORSE_TYPE_PROBABILITY_V1,
  RARITY_PROBABILITY_V1,
  type AbilityName,
  type HorseType,
  type Rarity,
} from '@sevendays/domain';
import { clampedNormal, round2, uniformInRange, unitFromParts, weightedDraw } from './random.js';

/**
 * Horse Generation v1.0 (03_GAME_DESIGN.md).
 * Fully deterministic: the same mint_seed, horse_uuid, user_uuid, and
 * horse_generation_version ALWAYS generate the same horse. No reroll,
 * no manual edit, ever.
 */

export interface HorseGenerationInput {
  mintSeed: string;
  horseUuid: string;
  userUuid: string;
  version: string;
}

export interface GeneratedHorse {
  horseType: HorseType;
  rarity: Rarity;
  abilities: Record<AbilityName, number>;
  baseAbilityScore: number;
  dnaHash: string;
  dnaModifier: number;
}

export function generateHorse(input: HorseGenerationInput): GeneratedHorse {
  const { mintSeed, horseUuid, userUuid, version } = input;

  // Horse Type and Rarity are INDEPENDENT deterministic draws.
  const horseType = weightedDraw(
    unitFromParts(mintSeed, horseUuid, 'horse_type', version),
    HORSE_TYPE_PROBABILITY_V1,
  );
  const rarity = weightedDraw(
    unitFromParts(mintSeed, horseUuid, 'rarity', version),
    RARITY_PROBABILITY_V1,
  );

  // Abilities: deterministic normal distribution, clamped (mean 75, sd 10, 50..100).
  const { mean, standardDeviation, min, max } = ABILITY_DISTRIBUTION_V1;
  const abilities = {} as Record<AbilityName, number>;
  for (const name of ABILITY_NAMES) {
    abilities[name] = clampedNormal(mean, standardDeviation, min, max, mintSeed, horseUuid, name, version);
  }

  // base_ability_score: fixed weighted sum (03_GAME_DESIGN.md).
  const baseAbilityScore = round2(
    ABILITY_NAMES.reduce((sum, name) => sum + abilities[name] * ABILITY_WEIGHTS_V1[name], 0),
  );

  // DNA: SHA-256(mint_seed + horse_uuid + user_uuid + version).
  // dna_modifier derives DIRECTLY from dna_hash (spec-literal, audit fix F-B).
  const dnaHash = sha256Parts(mintSeed, horseUuid, userUuid, version);
  const dnaModifier = uniformInRange(
    hashToUnitInterval(dnaHash),
    DNA_MODIFIER_RANGE_V1.min,
    DNA_MODIFIER_RANGE_V1.max,
  );

  return { horseType, rarity, abilities, baseAbilityScore, dnaHash, dnaModifier };
}
