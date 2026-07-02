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
 * Revenge Buff (Decision 057): a buff APPLIED to this horse is frozen into
 * the snapshot and marked CONSUMED — snapshot inclusion irreversibly commits
 * the buff to exactly this one race, whatever the outcome.
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

    // Buff bound to this horse via the owner's last successful assignment.
    const buff = await client.query<{ id: string; buff_rarity: string; buff_bonus_score: string }>(
      `select id, buff_rarity::text as buff_rarity, buff_bonus_score::text as buff_bonus_score
       from revenge_buffs
       where applied_horse_id = $1 and user_id = $2 and status = 'APPLIED'`,
      [horse.id, horse.owner_user_id],
    );
    const buffRow = buff.rows[0] ?? null;
    const buffSnapshot = buffRow
      ? { buff_rarity: buffRow.buff_rarity, bonus_score: Number(buffRow.buff_bonus_score) }
      : null;

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
      JSON.stringify(buffSnapshot),
      weather,
      track,
      input.raceEngineVersion,
    );

    // Per-horse atomicity: snapshot insert, state advance, training lock and
    // buff consumption commit together or not at all — a crash can never
    // leave a snapshot without its side effects (audit fix F-E).
    await client.query('begin');
    try {
      const inserted = await client.query<{ id: string }>(
        `insert into race_participant_snapshots (
         race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash,
         ability_snapshot_json, training_snapshot_json, revenge_buff_snapshot_json,
         weather, track_condition, race_engine_version, liquidity_policy_version,
         price_table_version, race_seed_hash, snapshot_hash
       )
       select $1, $2, $3, $4, $5::horse_type, $6::rarity, $7, $8, $9, $10,
              $11::weather, $12::track_condition, $13, $14, $15,
              (select commit_hash from randomness_commits rc
                 join races r on r.seed_commit_id = rc.id where r.id = $1),
              $16
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
        buffSnapshot ? JSON.stringify(buffSnapshot) : null,
        weather,
        track,
        input.raceEngineVersion,
        input.liquidityPolicyVersion,
        input.priceTableVersion,
        snapshotHash,
      ],
    );

      if (inserted.rows.length > 0) {
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
        if (buffRow) {
          // Exactly one race (Decision 057): snapshot inclusion consumes the buff.
          await client.query(
            `update revenge_buffs set status = 'CONSUMED', consumed_at = now() where id = $1`,
            [buffRow.id],
          );
        }
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
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
