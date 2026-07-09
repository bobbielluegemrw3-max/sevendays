import { Money, insertNotification, sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  BURN_DROP_KEYS_V2,
  ITEM_BY_KEY_V2,
  renderNotification,
  type EconomyStatus,
} from '@sevendays/domain';
import {
  burnTargetCount,
  rankParticipants,
  rollBuffRarity,
  selectBurnTargets,
  unitFromParts,
} from '@sevendays/race-engine';
import { itemSettlement } from '@sevendays/ledger';
import { paySupportBonusesForBurns, type SupportBonusBurn } from './support-bonus.js';

/**
 * Batch Steps 11-16 — Finalize rankings, calculate burn target count,
 * select and execute burns, generate/refresh revenge buffs, pay Support
 * Bonuses (Decision 074).
 *
 * Everything here is deterministic given (snapshots, race_seed, policy):
 *   - ranking: final_score desc -> tiebreak desc -> uuid asc
 *   - burn count: floor(eligible * rate[economy_status]) — never exceeded
 *   - burn targets: bottom `count` ranks, ties resolved by the total order
 *   - burn_event_id: hash-derived, stable across retries
 *   - buff rarity: SHA-256 roll per spec
 * Idempotent: race_results / horse_burns inserts are conflict-guarded, the
 * support bonus uses ledger idempotency keys, buffs refresh rather than
 * duplicate.
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
  supportBonusPayments: number;
  itemDrops: number;
  itemSettlements: number;
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

  // 5. Execute burns + buffs; support bonuses are paid AFTER the whole
  //    loop so tier volumes see one consistent post-burn snapshot.
  let buffsGenerated = 0;
  let buffsRefreshed = 0;
  const burnedHorseIds: string[] = [];
  const supportBonusBurns: SupportBonusBurn[] = [];

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
    // One live buff per user across ACTIVE and APPLIED (refresh, never duplicate).
    const existing = await client.query<{ id: string }>(
      `select id from revenge_buffs where user_id = $1 and status in ('ACTIVE', 'APPLIED')`,
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

    supportBonusBurns.push({ burnedOwnerUserId: ownerId, burnEventId });
  }

  // Burn drops (Decision 078): alongside the Revenge Buff, every burn grants
  // one of the five non-sellable items — seed-deterministic pick, idempotent
  // via the unique source_burn_event_id.
  let itemDrops = 0;
  for (const horseId of burnTargets) {
    const ownerId = ownerByHorse.get(horseId)!;
    const burnEventId = uuidFromParts(input.raceId, horseId, 'burn_event');
    const u = unitFromParts(input.raceSeed, burnEventId, 'item_drop', input.raceEngineVersion);
    const dropKey = BURN_DROP_KEYS_V2[Math.min(BURN_DROP_KEYS_V2.length - 1, Math.floor(u * BURN_DROP_KEYS_V2.length))]!;
    const dropped = await client.query<{ id: string }>(
      `insert into user_items (user_id, item_key, unit_price, source, source_burn_event_id)
       values ($1, $2, 0, 'BURN_DROP', $3)
       on conflict (source_burn_event_id) do nothing
       returning id`,
      [ownerId, dropKey, burnEventId],
    );
    if (dropped.rows.length > 0) {
      itemDrops += 1;
      const rendered = renderNotification('ITEM_DROPPED', {
        item_name: ITEM_BY_KEY_V2.get(dropKey)?.nameJa ?? dropKey,
      });
      await insertNotification(client, {
        userId: ownerId,
        type: 'ITEM_DROPPED',
        dedupeKey: `notif:ITEM_DROPPED:${burnEventId}`,
        payload: { ...rendered, item_key: dropKey },
      });
    }
  }

  // Item settlement (Decision 078): every item committed to this race pays
  // out of the clearing account — the horse BURNED -> full price funds the
  // Support Bonus reserve; it SURVIVED -> full price is operating revenue.
  // Ledger idempotency keys make retries converge; price-0 drops just close.
  let itemSettlements = 0;
  const usages = await client.query<{
    id: string;
    user_item_id: string;
    horse_id: string;
    unit_price: string;
  }>(
    `select id, user_item_id, horse_id, unit_price::text as unit_price
     from item_usages where race_id = $1 and status = 'SNAPSHOTTED'
     order by id`,
    [input.raceId],
  );
  for (const usage of usages.rows) {
    const outcome = burnTargets.has(usage.horse_id) ? 'BURNED' : 'SURVIVED';
    if (Number(usage.unit_price) > 0) {
      await itemSettlement(client, {
        amount: Money.of(usage.unit_price),
        outcome,
        idempotencyKey: `item:${usage.id}:settle`,
        referenceType: 'item_usage',
        referenceId: usage.id,
      });
    }
    await client.query(
      `update item_usages set status = 'SETTLED', settled_outcome = $2 where id = $1 and status = 'SNAPSHOTTED'`,
      [usage.id, outcome],
    );
    await client.query(`update user_items set status = 'CONSUMED' where id = $1`, [
      usage.user_item_id,
    ]);
    itemSettlements += 1;
  }

  // Support Bonus (Decision 074): up to 7 placement tiers per burn, all of
  // tonight's burns evaluated against the same post-burn state.
  const supportBonusPayments = await paySupportBonusesForBurns(client, supportBonusBurns);

  // In-App notifications (Decision 065): results per participant, burn +
  // buff per burned owner. Deterministic dedupe keys — retries converge.
  const names = await client.query<{ id: string; name: string }>(
    `select id, name from horses where id = any($1)`,
    [ranking.map((r) => r.horseUuid)],
  );
  const nameById = new Map(names.rows.map((r) => [r.id, r.name]));
  for (const r of ranking) {
    const rendered = renderNotification('RACE_RESULT_READY', {
      horse_name: nameById.get(r.horseUuid) ?? '',
    });
    await insertNotification(client, {
      userId: ownerByHorse.get(r.horseUuid)!,
      type: 'RACE_RESULT_READY',
      dedupeKey: `notif:RACE_RESULT_READY:${input.raceId}:${r.horseUuid}`,
      payload: { ...rendered, race_id: input.raceId, horse_id: r.horseUuid },
    });
  }
  for (const horseId of burnTargets) {
    const ownerId = ownerByHorse.get(horseId)!;
    const burned = renderNotification('HORSE_BURNED', { horse_name: nameById.get(horseId) ?? '' });
    await insertNotification(client, {
      userId: ownerId,
      type: 'HORSE_BURNED',
      dedupeKey: `notif:HORSE_BURNED:${input.raceId}:${horseId}`,
      payload: { ...burned, horse_id: horseId },
    });
    const buff = renderNotification('REVENGE_BUFF_GENERATED');
    await insertNotification(client, {
      userId: ownerId,
      type: 'REVENGE_BUFF_GENERATED',
      dedupeKey: `notif:REVENGE_BUFF_GENERATED:${uuidFromParts(input.raceId, horseId, 'burn_event')}`,
      payload: { ...buff },
    });
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
    supportBonusPayments,
    itemDrops,
    itemSettlements,
  };
}
