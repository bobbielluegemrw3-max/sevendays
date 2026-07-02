import { sha256Parts } from '@sevendays/shared';
import { hashToUnitInterval } from '@sevendays/shared';
import { BUFF_TABLE_V1, type BuffRarity } from '@sevendays/domain';
import { weightedDraw } from './random.js';

/**
 * Revenge Buff rarity roll (03_GAME_DESIGN.md):
 *   SHA-256(race_seed + horse_uuid + owner_user_id_at_snapshot
 *           + burn_event_id + buff_policy_version)
 * Table v1.0: N 30% +4, R 50% +7, SR 20% +10.
 */

export interface BuffRollInput {
  raceSeed: string;
  horseUuid: string;
  ownerUserIdAtSnapshot: string;
  burnEventId: string;
  buffPolicyVersion: string;
}

export interface BuffRoll {
  rarity: BuffRarity;
  bonusScore: number;
  rollHash: string;
}

const BUFF_PROBABILITIES: Record<BuffRarity, string> = {
  N: BUFF_TABLE_V1.N.probability,
  R: BUFF_TABLE_V1.R.probability,
  SR: BUFF_TABLE_V1.SR.probability,
};

export function rollBuffRarity(input: BuffRollInput): BuffRoll {
  const rollHash = sha256Parts(
    input.raceSeed,
    input.horseUuid,
    input.ownerUserIdAtSnapshot,
    input.burnEventId,
    input.buffPolicyVersion,
  );
  const rarity = weightedDraw(hashToUnitInterval(rollHash), BUFF_PROBABILITIES);
  return { rarity, bonusScore: BUFF_TABLE_V1[rarity].bonusScore, rollHash };
}
