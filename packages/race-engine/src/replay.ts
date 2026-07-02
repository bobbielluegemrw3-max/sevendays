import { verifyCommitReveal } from '@sevendays/shared';
import { rankParticipants, type RankedParticipant } from './ranking.js';
import { computeScore, type ScoreBreakdown, type ScoreInput } from './score.js';

/**
 * Race Replay (01_CONSTITUTION.md, 03_GAME_DESIGN.md):
 * the same snapshot + race_seed + race_engine_version MUST reproduce the
 * same final_score, ranking, and burn selection. Replay reads ONLY the
 * immutable snapshot inputs — never current mutable state.
 */

export interface ReplayResult {
  scores: ScoreBreakdown[];
  ranking: RankedParticipant[];
}

export interface ReplayMismatch {
  horseUuid: string;
  field: string;
  original: number;
  replayed: number;
}

export interface ReplayComparison {
  ok: boolean;
  mismatches: ReplayMismatch[];
}

/** Verify the revealed seed against the committed hash (Server Commit-Reveal). */
export function verifyRaceSeed(revealedSeed: string, committedHash: string): boolean {
  return verifyCommitReveal(revealedSeed, committedHash);
}

/** Recompute every score and the full ranking from snapshot inputs. */
export function replayRace(
  snapshotInputs: readonly ScoreInput[],
  raceSeed: string,
  raceEngineVersion: string,
): ReplayResult {
  const scores = snapshotInputs.map((input) => computeScore(input));
  const ranking = rankParticipants(
    scores.map((s) => ({ horseUuid: s.horseUuid, finalScore: s.finalScore })),
    raceSeed,
    raceEngineVersion,
  );
  return { scores, ranking };
}

export interface OriginalResult {
  horseUuid: string;
  finalScore: number;
  finalRank: number;
}

/** Compare stored results against a fresh replay. */
export function compareReplay(
  originals: readonly OriginalResult[],
  replay: ReplayResult,
): ReplayComparison {
  const mismatches: ReplayMismatch[] = [];
  const replayedByUuid = new Map(replay.ranking.map((r) => [r.horseUuid, r]));

  for (const original of originals) {
    const replayed = replayedByUuid.get(original.horseUuid);
    if (!replayed) {
      mismatches.push({
        horseUuid: original.horseUuid,
        field: 'missing',
        original: original.finalRank,
        replayed: Number.NaN,
      });
      continue;
    }
    if (replayed.finalScore !== original.finalScore) {
      mismatches.push({
        horseUuid: original.horseUuid,
        field: 'finalScore',
        original: original.finalScore,
        replayed: replayed.finalScore,
      });
    }
    if (replayed.finalRank !== original.finalRank) {
      mismatches.push({
        horseUuid: original.horseUuid,
        field: 'finalRank',
        original: original.finalRank,
        replayed: replayed.finalRank,
      });
    }
  }
  if (originals.length !== replay.ranking.length) {
    mismatches.push({
      horseUuid: '(participant count)',
      field: 'count',
      original: originals.length,
      replayed: replay.ranking.length,
    });
  }
  return { ok: mismatches.length === 0, mismatches };
}
