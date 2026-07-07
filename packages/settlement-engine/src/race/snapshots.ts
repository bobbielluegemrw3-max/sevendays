import { sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  ABILITY_WEIGHTS_V1,
  ITEM_POLICY_VERSION_V1,
  type AbilityName,
  type HorseType,
  type Rarity,
  type TrainingType,
} from '@sevendays/domain';
import {
  computeDailyState,
  deriveItemSetting,
  deriveTrackCondition,
  deriveWeather,
  resolveItemEffect,
  round2,
} from '@sevendays/race-engine';

function clampStat(x: number): number {
  return Math.min(100, Math.max(0, round2(x)));
}

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
  // Item setting (設定1〜6, Decision 078) — seed commit-reveal like weather.
  const itemSetting = deriveItemSetting(input.raceSeed, input.raceEngineVersion);
  await client.query(`update races set item_setting = $2 where id = $1`, [
    input.raceId,
    itemSetting,
  ]);

  // Market Lock (Decision 076): a manually listed horse does not race —
  // excluded from the snapshot, so current_day and value stay frozen while
  // it waits on the marketplace. Smart (system) listings keep racing.
  const horses = await client.query<HorseRow>(
    `select h.id, h.owner_user_id, h.current_day, h.horse_type::text as horse_type,
            h.rarity::text as rarity, h.dna_hash, h.dna_modifier::text as dna_modifier,
            h.ability_json, h.condition::text as condition, h.fatigue::text as fatigue
     from horses h
     where h.status = 'ACTIVE'
       and not exists (
         select 1 from market_listings ml
         where ml.horse_id = h.id and ml.status = 'LISTED' and ml.source = 'MANUAL'
       )
     order by h.id`,
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

    // Item usage for this race (Decision 078): resolve the public rule
    // against the stats the player saw (yesterday's condition/fatigue) and
    // today's seed-derived weather/setting, then freeze the result.
    const usage = await client.query<{ id: string; item_key: string; unit_price: string }>(
      `select id, item_key, unit_price::text as unit_price from item_usages
       where horse_id = $1 and effective_race_date = $2 and status = 'PENDING'`,
      [horse.id, input.batchDate],
    );
    const usageRow = usage.rows[0] ?? null;
    const itemEffect = resolveItemEffect(
      usageRow?.item_key ?? null,
      {
        horseType: horse.horse_type,
        currentDay: horse.current_day,
        training: trainingType,
        prevCondition: Number(horse.condition),
        prevFatigue: Number(horse.fatigue),
        weather,
      },
      itemSetting,
    );
    const itemSnapshot = usageRow
      ? {
          item_key: usageRow.item_key,
          item_policy_version: ITEM_POLICY_VERSION_V1,
          item_setting: itemSetting,
          item_points: itemEffect.itemPoints,
          item_random_shift: itemEffect.randomShift,
          condition_delta: itemEffect.conditionDelta,
          fatigue_delta: itemEffect.fatigueDelta,
          unit_price: usageRow.unit_price,
        }
      : null;

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

    // Advance the daily state (deterministic order, Decision 054). Item stat
    // effects (already setting-scaled) adjust the PREVIOUS values before the
    // recurrence — conditions were evaluated on the raw values above.
    const state = computeDailyState({
      prevCondition: clampStat(Number(horse.condition) + itemEffect.conditionDelta),
      prevFatigue: clampStat(Number(horse.fatigue) + itemEffect.fatigueDelta),
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
      JSON.stringify(itemSnapshot),
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
         item_snapshot_json,
         weather, track_condition, race_engine_version, liquidity_policy_version,
         price_table_version, race_seed_hash, snapshot_hash
       )
       select $1, $2, $3, $4, $5::horse_type, $6::rarity, $7, $8, $9, $10, $11,
              $12::weather, $13::track_condition, $14, $15, $16,
              (select commit_hash from randomness_commits rc
                 join races r on r.seed_commit_id = rc.id where r.id = $1),
              $17
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
        itemSnapshot ? JSON.stringify(itemSnapshot) : null,
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
        if (usageRow) {
          // Snapshot inclusion commits the item to exactly this race.
          await client.query(
            `update item_usages set status = 'SNAPSHOTTED', race_id = $2 where id = $1`,
            [usageRow.id, input.raceId],
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
