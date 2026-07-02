import { sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import type { EconomyStatus } from '@sevendays/domain';
import {
  burnTargetCount,
  rankParticipants,
  rollBuffRarity,
  selectBurnTargets,
} from '@sevendays/race-engine';
import { mlmRewardPayment } from '@sevendays/ledger';

/**
 * Batch Steps 11-16 — Finalize rankings, calculate burn target count,
 * select and execute burns, generate/refresh revenge buffs, pay MLM.
 *
 * Everything here is deterministic given (snapshots, race_seed, policy):
 *   - ranking: final_score desc -> tiebreak desc -> uuid asc
 *   - burn count: floor(eligible * rate[economy_status]) — never exceeded
 *   - burn targets: bottom `count` ranks, ties resolved by the total order
 *   - burn_event_id: hash-derived, stable across retries
 *   - buff rarity: SHA-256 roll per spec
 * Idempotent: race_results / horse_burns inserts are conflict-guarded, MLM
 * uses ledger idempotency keys, buffs refresh rather than duplicate.
 */

export interface FinalizeAndBurnInput {
  raceId: string;
  raceSeed: string;
  raceEngineVersion: string;
  economyStatus: EconomyStatus;
  /** burn rate source (04_ECONOMY_ENGINE.md) — recorded on each burn. */
  liquidityPolicyVersion: string;
  buffPolicyVersion: string;
}

export interface FinalizeAndBurnResult {
  participantCount: number;
  burnTargetCount: number;
  burnedHorseIds: string[];
  buffsGenerated: number;
  buffsRefreshed: number;
  mlmPaymentsMade: number;
}

/** Deterministic UUID (v4 format) from hash input — stable across retries. */
function uuidFromParts(...parts: string[]): string {
  const hex = sha256Parts(...parts).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

export async function finalizeAndBurn(
  client: SqlClient,
  input: FinalizeAndBurnInput,
): Promise<FinalizeAndBurnResult> {
  // 1. Load scored snapshots (Race Engine must have completed).
  const snapshots = await client.query<{
    horse_id: string;
    owner_user_id: string;
    final_score: string | null;
  }>(
    `select horse_id, owner_user_id, final_score::text as final_score
     from race_participant_snapshots where race_id = $1 order by horse_id`,
    [input.raceId],
  );
  if (snapshots.rows.some((r) => r.final_score === null)) {
    throw new Error(`RACE_NOT_SCORED: race ${input.raceId} has unscored participants`);
  }
  const ownerByHorse = new Map(snapshots.rows.map((r) => [r.horse_id, r.owner_user_id]));

  // 2. Deterministic ranking.
  const ranking = rankParticipants(
    snapshots.rows.map((r) => ({ horseUuid: r.horse_id, finalScore: Number(r.final_score) })),
    input.raceSeed,
    input.raceEngineVersion,
  );

  // 3. Burn count and targets (floor rule — never exceeded).
  const eligible = ranking.length;
  const count = burnTargetCount(eligible, input.economyStatus);
  const burnTargets = new Set(selectBurnTargets(ranking, count));

  // 4. Persist race results with final burn flags (immutable after insert).
  for (const r of ranking) {
    await client.query(
      `insert into race_results (race_id, horse_id, final_score, deterministic_tiebreak_score, final_rank, is_burned)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (race_id, horse_id) do nothing`,
      [input.raceId, r.horseUuid, r.finalScore, r.tiebreakScore, r.finalRank, burnTargets.has(r.horseUuid)],
    );
  }

  // 5. Execute burns + buffs + MLM.
  let buffsGenerated = 0;
  let buffsRefreshed = 0;
  let mlmPaymentsMade = 0;
  const burnedHorseIds: string[] = [];

  for (const horseId of burnTargets) {
    const ownerId = ownerByHorse.get(horseId)!;
    const burnEventId = uuidFromParts(input.raceId, horseId, 'burn_event');
    burnedHorseIds.push(horseId);

    await client.query(
      `insert into horse_burns (race_id, horse_id, owner_user_id_at_snapshot, burn_event_id, burn_target_count, burn_policy_version)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (horse_id) do nothing`,
      [input.raceId, horseId, ownerId, burnEventId, count, input.liquidityPolicyVersion],
    );
    // Burned horses never return to P2P; current_day frozen (DB guard enforces).
    await client.query(
      `update horses set status = 'BURNED' where id = $1 and status = 'ACTIVE'`,
      [horseId],
    );

    // Revenge Buff: one active buff per user — refresh, never duplicate.
    const roll = rollBuffRarity({
      raceSeed: input.raceSeed,
      horseUuid: horseId,
      ownerUserIdAtSnapshot: ownerId,
      burnEventId,
      buffPolicyVersion: input.buffPolicyVersion,
    });
    const existing = await client.query<{ id: string }>(
      `select id from revenge_buffs where user_id = $1 and status = 'ACTIVE'`,
      [ownerId],
    );
    if (existing.rows.length > 0) {
      await client.query(
        `update revenge_buffs
         set buff_rarity = $2::buff_rarity, buff_bonus_score = $3,
             buff_policy_version = $4, deterministic_buff_roll = $5, refreshed_at = now()
         where id = $1`,
        [existing.rows[0]!.id, roll.rarity, roll.bonusScore, input.buffPolicyVersion, roll.rollHash],
      );
      buffsRefreshed += 1;
    } else {
      await client.query(
        `insert into revenge_buffs (user_id, buff_rarity, buff_bonus_score, buff_policy_version, deterministic_buff_roll)
         values ($1, $2::buff_rarity, $3, $4, $5)`,
        [ownerId, roll.rarity, roll.bonusScore, input.buffPolicyVersion, roll.rollHash],
      );
      buffsGenerated += 1;
    }

    // MLM Reward: valid direct referrer = ACTIVE only (Decision 041).
    const referrer = await client.query<{ id: string; status: string }>(
      `select ref.id, ref.status::text as status
       from users u join users ref on ref.id = u.direct_referrer_user_id
       where u.id = $1`,
      [ownerId],
    );
    const ref = referrer.rows[0];
    if (ref && ref.status === 'ACTIVE') {
      const payment = await mlmRewardPayment(client, {
        referrerUserId: ref.id,
        idempotencyKey: `mlm:${burnEventId}`,
        referenceType: 'horse_burn_event',
        referenceId: burnEventId,
      });
      if (!payment.alreadyPosted) mlmPaymentsMade += 1;
    }
  }

  await client.query(
    `update races set status = 'FINALIZED', completed_at = coalesce(completed_at, now()) where id = $1`,
    [input.raceId],
  );

  return {
    participantCount: eligible,
    burnTargetCount: count,
    burnedHorseIds,
    buffsGenerated,
    buffsRefreshed,
    mlmPaymentsMade,
  };
}
