import { sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { ABILITY_WEIGHTS_V1, type AbilityName, type HorseType, type Rarity, type TrainingType } from '@sevendays/domain';
import {
  computeDailyState,
  deriveTrackCondition,
  deriveWeather,
  round2,
} from '@sevendays/race-engine';

/**
 * Batch Step 7 — Create Race Participant Snapshots (03_GAME_DESIGN.md).
 *
 * All ACTIVE horses participate in the one daily race (Decision 038).
 * For each horse, this snapshot:
 *   - freezes ownership, generation data, and today's training
 *   - advances the daily condition/fatigue recurrence (Decision 054) and
 *     freezes the resulting values
 *   - freezes weather/track derived from the committed race seed
 * After this step, nothing mutable can influence the race.
 *
 * Idempotent: a horse with an existing snapshot for this race is skipped
 * entirely (state advance happens exactly once).
 *
 * NOTE: revenge_buff_snapshot is NULL pending owner decision P9 (buff
 * consumption semantics at assignment, Phase 8).
 */

export interface CreateSnapshotsInput {
  raceId: string;
  raceSeed: string;
  raceEngineVersion: string;
  liquidityPolicyVersion: string;
  priceTableVersion: string;
  /** effective_race_date for training lookup (MYT batch date). */
  batchDate: string;
}

interface HorseRow {
  id: string;
  owner_user_id: string;
  current_day: number;
  horse_type: HorseType;
  rarity: Rarity;
  dna_hash: string;
  dna_modifier: string;
  ability_json: Record<AbilityName, number>;
  condition: string;
  fatigue: string;
}

export async function createParticipantSnapshots(
  client: SqlClient,
  input: CreateSnapshotsInput,
): Promise<number> {
  const weather = deriveWeather(input.raceSeed, input.raceEngineVersion);
  const track = deriveTrackCondition(input.raceSeed, input.raceEngineVersion);

  const horses = await client.query<HorseRow>(
    `select id, owner_user_id, current_day, horse_type::text as horse_type,
            rarity::text as rarity, dna_hash, dna_modifier::text as dna_modifier,
            ability_json, condition::text as condition, fatigue::text as fatigue
     from horses where status = 'ACTIVE' order by id`,
  );

  let created = 0;
  for (const horse of horses.rows) {
    const training = await client.query<{ id: string; training_type: TrainingType }>(
      `select id, training_type::text as training_type from training_sessions
       where horse_id = $1 and effective_race_date = $2 and snapshot_included_at is null`,
      [horse.id, input.batchDate],
    );
    const trainingRow = training.rows[0] ?? null;
    const trainingType = trainingRow?.training_type ?? null;

    // Advance the daily state (deterministic order, Decision 054).
    const state = computeDailyState({
      prevCondition: Number(horse.condition),
      prevFatigue: Number(horse.fatigue),
      training: trainingType,
      ranRace: true,
    });

    const baseAbilityScore = round2(
      (Object.keys(ABILITY_WEIGHTS_V1) as AbilityName[]).reduce(
        (sum, name) => sum + Number(horse.ability_json[name] ?? 0) * ABILITY_WEIGHTS_V1[name],
        0,
      ),
    );

    const abilitySnapshot = {
      abilities: horse.ability_json,
      base_ability_score: baseAbilityScore,
      condition: state.condition,
      fatigue: state.fatigue,
    };
    const trainingSnapshot = trainingType ? { training_type: trainingType } : null;

    const snapshotHash = sha256Parts(
      input.raceId,
      horse.id,
      horse.owner_user_id,
      String(horse.current_day),
      horse.horse_type,
      horse.rarity,
      horse.dna_hash,
      JSON.stringify(abilitySnapshot),
      JSON.stringify(trainingSnapshot),
      weather,
      track,
      input.raceEngineVersion,
    );

    const inserted = await client.query<{ id: string }>(
      `insert into race_participant_snapshots (
         race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash,
         ability_snapshot_json, training_snapshot_json, revenge_buff_snapshot_json,
         weather, track_condition, race_engine_version, liquidity_policy_version,
         price_table_version, race_seed_hash, snapshot_hash
       )
       select $1, $2, $3, $4, $5::horse_type, $6::rarity, $7, $8, $9, null,
              $10::weather, $11::track_condition, $12, $13, $14,
              (select commit_hash from randomness_commits rc
                 join races r on r.seed_commit_id = rc.id where r.id = $1),
              $15
       on conflict (race_id, horse_id) do nothing
       returning id`,
      [
        input.raceId,
        horse.id,
        horse.owner_user_id,
        horse.current_day,
        horse.horse_type,
        horse.rarity,
        horse.dna_hash,
        JSON.stringify(abilitySnapshot),
        trainingSnapshot ? JSON.stringify(trainingSnapshot) : null,
        weather,
        track,
        input.raceEngineVersion,
        input.liquidityPolicyVersion,
        input.priceTableVersion,
        snapshotHash,
      ],
    );

    if (inserted.rows.length === 0) continue; // already snapshotted — skip state advance
    created += 1;

    await client.query(
      `update horses set condition = $2, fatigue = $3 where id = $1`,
      [horse.id, state.condition, state.fatigue],
    );
    if (trainingRow) {
      await client.query(
        `update training_sessions set snapshot_included_at = now() where id = $1`,
        [trainingRow.id],
      );
    }
  }

  await client.query(
    `update races set participant_count = (
       select count(*) from race_participant_snapshots where race_id = $1
     ) where id = $1`,
    [input.raceId],
  );
  return created;
}
