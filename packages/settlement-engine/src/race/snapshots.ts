import { sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  ABILITY_WEIGHTS_V1,
  ITEM_POLICY_VERSION_V2,
  deriveNightForecastV1,
  isRaceEngineV2,
  type AbilityName,
  type HorseType,
  type RaceSlotV2,
  type Rarity,
  type Surface,
  type TrackCondition,
  type TrainingMenuV2,
  type TrainingType,
  type Weather,
} from '@sevendays/domain';
import {
  applyDecayV2,
  applyTotalValueGainV2,
  computeDailyState,
  deriveSurface,
  deriveTrackCondition,
  deriveWeather,
  resolveItemEffect,
  round2,
  trackModifier,
  weatherModifier,
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
  /** Race slot (Decision 102). Defaults to NIGHT — the V1 cadence. */
  slot?: RaceSlotV2;
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

/** ADR-012: 条件シード(night_forecasts)があればそこから、無ければレースシード由来で
 *  条件を導出し、レース行へ凍結する(V1/V2共通 — 予報との70%結合のため同一シードが必須)。 */
async function deriveAndFreezeConditions(
  client: SqlClient,
  input: CreateSnapshotsInput,
): Promise<{ weather: Weather; track: TrackCondition; surface: Surface }> {
  const fc = await client.query<{ seed: string }>(
    `select seed from night_forecasts where forecast_date = $1::date and slot = $2::race_slot`,
    [input.batchDate, input.slot ?? 'NIGHT'],
  );
  const derived = fc.rows[0]
    ? deriveNightForecastV1(fc.rows[0].seed).actual
    : {
        weather: deriveWeather(input.raceSeed, input.raceEngineVersion),
        track: deriveTrackCondition(input.raceSeed, input.raceEngineVersion),
        surface: deriveSurface(input.raceSeed, input.raceEngineVersion),
      };
  await client.query(
    `update races set weather = $2, track_condition = $3, surface = $4 where id = $1`,
    [input.raceId, derived.weather, derived.track, derived.surface],
  );
  return derived;
}

export async function createParticipantSnapshots(
  client: SqlClient,
  input: CreateSnapshotsInput,
): Promise<number> {
  const conditions = await deriveAndFreezeConditions(client, input);
  // V2(Decision 101/104): 保存済みバージョンで分岐 — 過去レースのリプレイは
  // 常に当時の経路を通る(リプレイ互換は憲法)。
  if (isRaceEngineV2(input.raceEngineVersion)) {
    return createParticipantSnapshotsV2(client, input, conditions);
  }
  const { weather, track, surface } = conditions;

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
      conditions,
    );
    const itemSnapshot = usageRow
      ? {
          item_key: usageRow.item_key,
          item_policy_version: ITEM_POLICY_VERSION_V2,
          conditions: { weather, track, surface },
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

interface HorseRowV2 {
  id: string;
  owner_user_id: string;
  current_day: number;
  horse_type: HorseType;
  rarity: Rarity;
  dna_hash: string;
  total_value: string | null;
}

interface TrainingRowV2 {
  id: string;
  menus_v2: TrainingMenuV2[] | null;
  per_menu_v2: unknown;
  synergy_v2: string | null;
  delta_v2: string | null;
  rests_decay_v2: boolean | null;
}

/**
 * V2 snapshot (Decision 101/104): the training roll already RESOLVED at
 * confirm time and lives on the training_sessions row — this step only reads
 * it, advances the Total Value recurrence (softcap-gain then decay, REST
 * negates the decay tick — same order as the design sim), and freezes:
 *   - total_value                (the value that races tonight)
 *   - condition_prep_modifier    (type aptitude for revealed weather+track,
 *                                 +-4 vessel; race items join in a later phase)
 *   - training_snapshot_json     (the V2 roll, for attribution display/replay)
 * No condition/fatigue advance, no rarity/buff/item modifiers — the V2 score
 * is total_value + prep + luck, nothing else (Decision 101).
 */
async function createParticipantSnapshotsV2(
  client: SqlClient,
  input: CreateSnapshotsInput,
  conditions: { weather: Weather; track: TrackCondition; surface: Surface },
): Promise<number> {
  const { weather, track } = conditions;

  // Market Lock (Decision 076) unchanged: manually listed horses do not race.
  const horses = await client.query<HorseRowV2>(
    `select h.id, h.owner_user_id, h.current_day, h.horse_type::text as horse_type,
            h.rarity::text as rarity, h.dna_hash, h.total_value::text as total_value
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
    if (horse.total_value === null) {
      // A V2 race requires every horse to be minted with a Total Value —
      // a NULL here means corrupted season state, never a legal input.
      throw new Error(`V2_TOTAL_VALUE_MISSING: horse ${horse.id} has no total_value`);
    }

    const training = await client.query<TrainingRowV2>(
      `select id, menus_v2, per_menu_v2, synergy_v2::text as synergy_v2,
              delta_v2::text as delta_v2, rests_decay_v2
       from training_sessions
       where horse_id = $1 and effective_race_date = $2 and slot = $3::race_slot
         and snapshot_included_at is null`,
      [horse.id, input.batchDate, input.slot ?? 'NIGHT'],
    );
    const trainingRow = training.rows[0] ?? null;
    // A V1-shaped row (no menus) in a V2 race has no Total Value effect but is
    // still frozen below — it must not leak into a later race date.
    const v2Roll = trainingRow !== null && trainingRow.menus_v2 !== null ? trainingRow : null;
    const delta = v2Roll ? Number(v2Roll.delta_v2) : null;
    const restsDecay = v2Roll ? v2Roll.rests_decay_v2 === true : false;

    const before = Number(horse.total_value);
    const afterGain = delta === null ? before : applyTotalValueGainV2(before, delta);
    const totalValue = applyDecayV2(afterGain, restsDecay);

    const prep = round2(
      weatherModifier(weather, horse.horse_type) + trackModifier(track, horse.horse_type),
    );

    const trainingSnapshot = v2Roll
      ? {
          menus: v2Roll.menus_v2,
          per_menu: v2Roll.per_menu_v2,
          synergy: Number(v2Roll.synergy_v2),
          delta: Number(v2Roll.delta_v2),
          rests_decay: v2Roll.rests_decay_v2 === true,
        }
      : null;

    const snapshotHash = sha256Parts(
      input.raceId,
      horse.id,
      horse.owner_user_id,
      String(horse.current_day),
      horse.horse_type,
      horse.dna_hash,
      String(totalValue),
      String(prep),
      JSON.stringify(trainingSnapshot),
      weather,
      track,
      input.raceEngineVersion,
    );

    // Per-horse atomicity (same as V1): snapshot insert, Total Value advance
    // and training freeze commit together or not at all.
    await client.query('begin');
    try {
      const inserted = await client.query<{ id: string }>(
        `insert into race_participant_snapshots (
           race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash,
           ability_snapshot_json, training_snapshot_json,
           total_value, condition_prep_modifier,
           weather, track_condition, race_engine_version, liquidity_policy_version,
           price_table_version, race_seed_hash, snapshot_hash
         )
         select $1, $2, $3, $4, $5::horse_type, $6::rarity, $7, '{}'::jsonb, $8,
                $9, $10, $11::weather, $12::track_condition, $13, $14, $15,
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
          trainingSnapshot ? JSON.stringify(trainingSnapshot) : null,
          totalValue,
          prep,
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
        await client.query(`update horses set total_value = $2 where id = $1`, [
          horse.id,
          totalValue,
        ]);
        if (trainingRow) {
          await client.query(
            `update training_sessions set snapshot_included_at = now() where id = $1`,
            [trainingRow.id],
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
