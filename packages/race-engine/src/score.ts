import {
  HORSE_TYPE_MODIFIER_V1,
  LUCK_TRAINED_RANDOM_RANGE_V1,
  MODIFIER_RANGES_V1,
  RARITY_MODIFIER_V1,
  REVENGE_BUFF_MODIFIER_V1,
  trainingModifierV1,
  type BuffRarity,
  type HorseType,
  type Rarity,
  type TrackCondition,
  type TrainingType,
  type Weather,
} from '@sevendays/domain';
import { conditionModifier, fatigueModifier } from './condition.js';
import { trackModifier, weatherModifier } from './environment.js';
import { round2, uniformInRange, unitFromParts } from './random.js';

/**
 * Race Engine v1.0 final_score (03_GAME_DESIGN.md):
 *
 *   final_score = base_ability_score + horse_type_modifier + rarity_modifier
 *               + dna_modifier + training_modifier + weather_modifier
 *               + track_modifier + condition_modifier + fatigue_modifier
 *               + revenge_buff_modifier + random_modifier
 *
 * Every modifier is range-checked against the v1.0 table; violations throw —
 * an out-of-range value means corrupted inputs, never a legal score.
 */

export interface ScoreInput {
  horseUuid: string;
  horseType: HorseType;
  rarity: Rarity;
  baseAbilityScore: number;
  dnaModifier: number;
  training: TrainingType | null;
  weather: Weather;
  track: TrackCondition;
  condition: number;
  fatigue: number;
  buffRarity: BuffRarity | null;
  raceSeed: string;
  raceEngineVersion: string;
}

export interface ScoreBreakdown {
  horseUuid: string;
  baseAbilityScore: number;
  horseTypeModifier: number;
  rarityModifier: number;
  dnaModifier: number;
  trainingModifier: number;
  weatherModifier: number;
  trackModifier: number;
  conditionModifier: number;
  fatigueModifier: number;
  revengeBuffModifier: number;
  randomModifier: number;
  finalScore: number;
}

export class ScoreRangeError extends Error {
  constructor(field: string, value: number) {
    super(`MODIFIER_OUT_OF_RANGE: ${field} = ${value}`);
    this.name = 'ScoreRangeError';
  }
}

function assertRange(field: keyof typeof MODIFIER_RANGES_V1, value: number): number {
  const range = MODIFIER_RANGES_V1[field];
  if (value < range.min || value > range.max) throw new ScoreRangeError(field, value);
  return value;
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const base = assertRange('base_ability_score', input.baseAbilityScore);
  const horseTypeMod = assertRange('horse_type_modifier', HORSE_TYPE_MODIFIER_V1);
  const rarityMod = RARITY_MODIFIER_V1[input.rarity];
  const dnaMod = assertRange('dna_modifier', input.dnaModifier);
  const trainingMod = assertRange(
    'training_modifier',
    trainingModifierV1(input.horseType, input.training),
  );
  const weatherMod = assertRange('weather_modifier', weatherModifier(input.weather, input.horseType));
  const trackMod = assertRange('track_modifier', trackModifier(input.track, input.horseType));
  const conditionMod = assertRange('condition_modifier', conditionModifier(input.condition));
  const fatigueMod = assertRange('fatigue_modifier', fatigueModifier(input.fatigue, input.training));
  const buffMod = input.buffRarity === null ? 0 : REVENGE_BUFF_MODIFIER_V1[input.buffRarity];

  // LUCK trait (Decision 052): LUCK type + ANY training widens the random
  // range to -2.00/+4.00 for this race only. Deterministic and replayable.
  const luckActive = input.horseType === 'LUCK' && input.training !== null;
  const randomRange = luckActive ? LUCK_TRAINED_RANDOM_RANGE_V1 : MODIFIER_RANGES_V1.random_modifier;
  const randomMod = uniformInRange(
    unitFromParts(input.raceSeed, input.horseUuid, input.raceEngineVersion, 'random'),
    randomRange.min,
    randomRange.max,
  );

  const finalScore = round2(
    base +
      horseTypeMod +
      rarityMod +
      dnaMod +
      trainingMod +
      weatherMod +
      trackMod +
      conditionMod +
      fatigueMod +
      buffMod +
      randomMod,
  );

  return {
    horseUuid: input.horseUuid,
    baseAbilityScore: base,
    horseTypeModifier: horseTypeMod,
    rarityModifier: rarityMod,
    dnaModifier: dnaMod,
    trainingModifier: trainingMod,
    weatherModifier: weatherMod,
    trackModifier: trackMod,
    conditionModifier: conditionMod,
    fatigueModifier: fatigueMod,
    revengeBuffModifier: buffMod,
    randomModifier: randomMod,
    finalScore,
  };
}
