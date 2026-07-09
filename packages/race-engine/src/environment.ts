import {
  SURFACE_PROBABILITY_V1,
  TRACK_MODIFIER_V1,
  TRACK_PROBABILITY_V1,
  WEATHER_MODIFIER_V1,
  WEATHER_PROBABILITY_V1,
  type HorseType,
  type Surface,
  type TrackCondition,
  type Weather,
} from '@sevendays/domain';
import { unitFromParts, weightedDraw } from './random.js';

/**
 * Weather / Track derivation (Decisions 039, 053).
 * Both derive deterministically from the committed race_seed via SHA-256 —
 * the server knows them at snapshot time; anyone can verify after reveal.
 */

export function deriveWeather(raceSeed: string, raceEngineVersion: string): Weather {
  return weightedDraw(
    unitFromParts(raceSeed, 'weather', raceEngineVersion),
    WEATHER_PROBABILITY_V1,
  );
}

export function deriveTrackCondition(
  raceSeed: string,
  raceEngineVersion: string,
): TrackCondition {
  return weightedDraw(
    unitFromParts(raceSeed, 'track', raceEngineVersion),
    TRACK_PROBABILITY_V1,
  );
}

/**
 * Surface (芝/ダート, Decision 082): same commit-reveal derivation. Affects
 * ITEM effectiveness only — no score modifier, so race economy is unchanged.
 */
export function deriveSurface(raceSeed: string, raceEngineVersion: string): Surface {
  return weightedDraw(
    unitFromParts(raceSeed, 'surface', raceEngineVersion),
    SURFACE_PROBABILITY_V1,
  );
}

export function weatherModifier(weather: Weather, horseType: HorseType): number {
  return WEATHER_MODIFIER_V1[weather][horseType];
}

export function trackModifier(track: TrackCondition, horseType: HorseType): number {
  return TRACK_MODIFIER_V1[track][horseType];
}
