import { unitFromParts } from './random.js';

/**
 * Ranking and tie-breaker (03_GAME_DESIGN.md, Decisions 004/005):
 *   1. final_score DESC
 *   2. deterministic_tiebreak_score DESC
 *   3. horse_uuid ASC
 * tiebreak = normalize(SHA-256(race_seed + horse_uuid + race_engine_version))
 * No AI, admin, or manual tie resolution — ever.
 */

export interface Rankable {
  horseUuid: string;
  finalScore: number;
}

export interface RankedParticipant extends Rankable {
  tiebreakScore: number;
  finalRank: number;
}

export function tiebreakScore(
  raceSeed: string,
  horseUuid: string,
  raceEngineVersion: string,
): number {
  return unitFromParts(raceSeed, horseUuid, raceEngineVersion);
}

export function rankParticipants(
  participants: readonly Rankable[],
  raceSeed: string,
  raceEngineVersion: string,
): RankedParticipant[] {
  const withTiebreak = participants.map((p) => ({
    ...p,
    tiebreakScore: tiebreakScore(raceSeed, p.horseUuid, raceEngineVersion),
  }));
  withTiebreak.sort((a, b) => {
    if (a.finalScore !== b.finalScore) return b.finalScore - a.finalScore;
    if (a.tiebreakScore !== b.tiebreakScore) return b.tiebreakScore - a.tiebreakScore;
    return a.horseUuid < b.horseUuid ? -1 : a.horseUuid > b.horseUuid ? 1 : 0;
  });
  return withTiebreak.map((p, index) => ({ ...p, finalRank: index + 1 }));
}
