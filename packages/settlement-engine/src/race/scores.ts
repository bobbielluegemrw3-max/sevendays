import type { SqlClient } from '@sevendays/shared';
import {
  isRaceEngineV2,
  type AbilityName,
  type BuffRarity,
  type HorseType,
  type Rarity,
  type TrackCondition,
  type TrainingType,
  type Weather,
} from '@sevendays/domain';
import { computeScore, computeScoreV2, type ScoreInput } from '@sevendays/race-engine';

/**
 * Batch Step 8 — Run Race Engine: compute every participant's score from
 * the immutable snapshot and fill the score columns (the single permitted
 * snapshot update; afterwards the row is frozen by the DB trigger).
 *
 * Idempotent: rows with final_score already set are skipped.
 */

interface SnapshotRow {
  id: string;
  horse_id: string;
  horse_type: HorseType;
  rarity: Rarity;
  ability_snapshot_json: {
    base_ability_score: number;
    condition: number;
    fatigue: number;
    abilities: Record<AbilityName, number>;
  };
  training_snapshot_json: { training_type: TrainingType } | null;
  revenge_buff_snapshot_json: { buff_rarity: BuffRarity } | null;
  item_snapshot_json: { item_points: number; item_random_shift: number } | null;
  weather: Weather;
  track_condition: TrackCondition;
  dna_modifier_horse: string;
}

export interface RunScoresInput {
  raceId: string;
  raceSeed: string;
  raceEngineVersion: string;
}

export async function runRaceScores(client: SqlClient, input: RunScoresInput): Promise<number> {
  // V2(Decision 101): score = total_value + condition_prep + luck。保存済み
  // バージョンで分岐 — 過去レースのリプレイは常に当時の経路(憲法)。
  if (isRaceEngineV2(input.raceEngineVersion)) {
    return runRaceScoresV2(client, input);
  }
  const snapshots = await client.query<SnapshotRow>(
    `select s.id, s.horse_id, s.horse_type::text as horse_type, s.rarity::text as rarity,
            s.ability_snapshot_json, s.training_snapshot_json, s.revenge_buff_snapshot_json,
            s.item_snapshot_json,
            s.weather::text as weather, s.track_condition::text as track_condition,
            h.dna_modifier::text as dna_modifier_horse
     from race_participant_snapshots s
     join horses h on h.id = s.horse_id
     where s.race_id = $1 and s.final_score is null
     order by s.horse_id`,
    [input.raceId],
  );

  let scored = 0;
  for (const row of snapshots.rows) {
    const scoreInput: ScoreInput = {
      horseUuid: row.horse_id,
      horseType: row.horse_type,
      rarity: row.rarity,
      baseAbilityScore: row.ability_snapshot_json.base_ability_score,
      dnaModifier: Number(row.dna_modifier_horse),
      training: row.training_snapshot_json?.training_type ?? null,
      weather: row.weather,
      track: row.track_condition,
      condition: row.ability_snapshot_json.condition,
      fatigue: row.ability_snapshot_json.fatigue,
      buffRarity: row.revenge_buff_snapshot_json?.buff_rarity ?? null,
      itemPoints: row.item_snapshot_json?.item_points ?? 0,
      itemRandomShift: row.item_snapshot_json?.item_random_shift ?? 0,
      raceSeed: input.raceSeed,
      raceEngineVersion: input.raceEngineVersion,
    };
    const s = computeScore(scoreInput);
    await client.query(
      `update race_participant_snapshots set
         base_ability_score = $2, horse_type_modifier = $3, rarity_modifier = $4,
         dna_modifier = $5, training_modifier = $6, weather_modifier = $7,
         track_modifier = $8, condition_modifier = $9, fatigue_modifier = $10,
         revenge_buff_modifier = $11, random_modifier = $12, item_modifier = $13,
         final_score = $14
       where id = $1`,
      [
        row.id,
        s.baseAbilityScore,
        s.horseTypeModifier,
        s.rarityModifier,
        s.dnaModifier,
        s.trainingModifier,
        s.weatherModifier,
        s.trackModifier,
        s.conditionModifier,
        s.fatigueModifier,
        s.revengeBuffModifier,
        s.randomModifier,
        s.itemModifier,
        s.finalScore,
      ],
    );
    scored += 1;
  }
  return scored;
}

interface SnapshotRowV2 {
  id: string;
  horse_id: string;
  horse_type: HorseType;
  total_value: string;
  condition_prep_modifier: string;
  training_snapshot_json: unknown;
}

/** V2: 凍結済みの total_value と備え補正から computeScoreV2 で採点し、
 *  luck_modifier + final_score のみを一度だけ書く(スナップショット凍結則)。 */
async function runRaceScoresV2(client: SqlClient, input: RunScoresInput): Promise<number> {
  const snapshots = await client.query<SnapshotRowV2>(
    `select s.id, s.horse_id, s.horse_type::text as horse_type,
            s.total_value::text as total_value,
            s.condition_prep_modifier::text as condition_prep_modifier,
            s.training_snapshot_json
     from race_participant_snapshots s
     where s.race_id = $1 and s.final_score is null
     order by s.horse_id`,
    [input.raceId],
  );

  let scored = 0;
  for (const row of snapshots.rows) {
    const s = computeScoreV2({
      horseUuid: row.horse_id,
      horseType: row.horse_type,
      totalValue: Number(row.total_value),
      conditionPrepModifier: Number(row.condition_prep_modifier),
      trained: row.training_snapshot_json !== null,
      raceSeed: input.raceSeed,
      raceEngineVersion: input.raceEngineVersion,
    });
    await client.query(
      `update race_participant_snapshots set luck_modifier = $2, final_score = $3 where id = $1`,
      [row.id, s.luckModifier, s.finalScore],
    );
    scored += 1;
  }
  return scored;
}
