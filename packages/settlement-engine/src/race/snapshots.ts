import { sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  ABILITY_WEIGHTS_V1,
  ITEM_POLICY_VERSION_V2,
  ITEM_POLICY_VERSION_V3,
  ITEM_POLICY_VERSION_V4,
  aptitudeEdgeV3,
  applyRacePrepItemV3,
  composeConditionPrepV3,
  deriveAptitudeV3,
  deriveNightForecastV1,
  isRaceEngineV2,
  isRaceEngineV3,
  raceItemEdgeV4,
  trainingPrepEdgeV3,
  type AbilityName,
  type HorseType,
  type RaceConditionsV3,
  type RacePrepParamsV3,
  type RaceSlotV2,
  type Rarity,
  type Surface,
  type TrackCondition,
  type TrainingMenuV2,
  type TrainingMenuV3,
  type TrainingType,
  type Weather,
} from '@sevendays/domain';
import {
  applyDecayV2,
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
  // 保存済みバージョンで分岐 — 過去レースのリプレイは常に当時の経路を通る(憲法)。
  // V3(調教・適性再設計): condition_prep を「個体適性+調教の備え+レースアイテム(加算)」で作る。
  if (isRaceEngineV3(input.raceEngineVersion)) {
    return createParticipantSnapshotsV3(client, input, conditions);
  }
  // V2(Decision 101/104): 総合値の漸化+備え(タイプ適性)凍結。
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
  decay_shield_v2: number;
}

interface TrainingRowV2 {
  id: string;
  menus_v2: TrainingMenuV2[] | null;
  per_menu_v2: unknown;
  synergy_v2: string | null;
  delta_v2: string | null;
  rests_decay_v2: boolean | null;
  item_key_v3: string | null;
  item_bonus_v3: string | null;
}

interface ItemUsageRowV3 {
  id: string;
  item_key: string;
  unit_price: string;
  usage_kind: 'RACE' | 'TRAINING';
  params_json: RacePrepParamsV3 | null;
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
            h.rarity::text as rarity, h.dna_hash, h.total_value::text as total_value,
            h.decay_shield_v2
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
              delta_v2::text as delta_v2, rests_decay_v2, item_key_v3,
              item_bonus_v3::text as item_bonus_v3
       from training_sessions
       where horse_id = $1 and effective_race_date = $2 and slot = $3::race_slot
         and snapshot_included_at is null`,
      [horse.id, input.batchDate, input.slot ?? 'NIGHT'],
    );
    const trainingRow = training.rows[0] ?? null;
    // A V1-shaped row (no menus) in a V2 race has no Total Value effect but is
    // still frozen below — it must not leak into a later race date.
    const v2Roll = trainingRow !== null && trainingRow.menus_v2 !== null ? trainingRow : null;
    const restsDecay = v2Roll ? v2Roll.rests_decay_v2 === true : false;

    // V3 items (Decision 109): at most one usage per class for this cycle.
    // The TRAINING bonus already rolled at confirm (it rides the training
    // row); the RACE prep applies the override law against today's actual
    // conditions. Both usages freeze into this snapshot.
    const usages = await client.query<ItemUsageRowV3>(
      `select id, item_key, unit_price::text as unit_price, usage_kind, params_json
       from item_usages
       where horse_id = $1 and effective_race_date = $2 and slot = $3::race_slot
         and status = 'PENDING'`,
      [horse.id, input.batchDate, input.slot ?? 'NIGHT'],
    );
    const raceUsage = usages.rows.find((u) => u.usage_kind === 'RACE') ?? null;
    const trainingUsage = usages.rows.find((u) => u.usage_kind === 'TRAINING') ?? null;

    const itemBonus = v2Roll?.item_key_v3 ? Number(v2Roll.item_bonus_v3) : 0;

    // Decay shield (aeon_sand): negates the decay tick when REST does not
    // already cover it; consumed one race at a time.
    const shieldUsed = !restsDecay && horse.decay_shield_v2 > 0;

    const before = Number(horse.total_value);
    // Decision 112 (2026-07-19): 調教ロール(+アイテム上乗せ)は確定時に
    // horses.total_value へ適用済み。レースで起こる変化は減衰(-2.0)のみ。
    // delta はスナップショットへの凍結(監査・演出)にだけ使う。
    const totalValue = applyDecayV2(before, restsDecay || shieldUsed);

    const naturalWeatherMod = weatherModifier(weather, horse.horse_type);
    const naturalTrackMod = trackModifier(track, horse.horse_type);
    const prepMods = raceUsage
      ? applyRacePrepItemV3({
          itemKey: raceUsage.item_key,
          params: raceUsage.params_json,
          naturalWeatherMod,
          naturalTrackMod,
          actualWeather: weather,
          actualTrack: track,
        })
      : { weatherMod: naturalWeatherMod, trackMod: naturalTrackMod, weatherHit: null, trackHit: null };
    const prep = round2(prepMods.weatherMod + prepMods.trackMod);

    const trainingSnapshot = v2Roll
      ? {
          menus: v2Roll.menus_v2,
          per_menu: v2Roll.per_menu_v2,
          synergy: Number(v2Roll.synergy_v2),
          delta: Number(v2Roll.delta_v2),
          rests_decay: v2Roll.rests_decay_v2 === true,
        }
      : null;

    // Frozen item record (replay recomputes the prep from exactly this).
    const itemSnapshot =
      raceUsage || trainingUsage || shieldUsed
        ? {
            item_policy_version: ITEM_POLICY_VERSION_V3,
            race_item: raceUsage
              ? {
                  item_key: raceUsage.item_key,
                  params: raceUsage.params_json,
                  weather_mod: prepMods.weatherMod,
                  track_mod: prepMods.trackMod,
                  weather_hit: prepMods.weatherHit,
                  track_hit: prepMods.trackHit,
                  unit_price: raceUsage.unit_price,
                }
              : null,
            training_item: v2Roll?.item_key_v3
              ? {
                  item_key: v2Roll.item_key_v3,
                  bonus: itemBonus,
                  unit_price: trainingUsage?.unit_price ?? '0',
                }
              : null,
            decay_shield_used: shieldUsed,
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
      JSON.stringify(itemSnapshot),
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
           ability_snapshot_json, training_snapshot_json, item_snapshot_json,
           total_value, condition_prep_modifier,
           weather, track_condition, race_engine_version, liquidity_policy_version,
           price_table_version, race_seed_hash, snapshot_hash
         )
         select $1, $2, $3, $4, $5::horse_type, $6::rarity, $7, '{}'::jsonb, $8, $9,
                $10, $11, $12::weather, $13::track_condition, $14, $15, $16,
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
          trainingSnapshot ? JSON.stringify(trainingSnapshot) : null,
          itemSnapshot ? JSON.stringify(itemSnapshot) : null,
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
        if (shieldUsed) {
          await client.query(
            `update horses set decay_shield_v2 = decay_shield_v2 - 1
             where id = $1 and decay_shield_v2 > 0`,
            [horse.id],
          );
        }
        if (trainingRow) {
          await client.query(
            `update training_sessions set snapshot_included_at = now() where id = $1`,
            [trainingRow.id],
          );
        }
        // Snapshot inclusion commits both item usages to exactly this race
        // (same rule as V1 — Step 16 settles them by the burn outcome).
        for (const usage of [raceUsage, trainingUsage]) {
          if (usage) {
            await client.query(
              `update item_usages set status = 'SNAPSHOTTED', race_id = $2
               where id = $1 and status = 'PENDING'`,
              [usage.id, input.raceId],
            );
          }
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

interface HorseRowV3 {
  id: string;
  owner_user_id: string;
  current_day: number;
  horse_type: HorseType;
  rarity: Rarity;
  dna_hash: string;
  total_value: string | null;
  decay_shield_v2: number;
}

/**
 * V3 snapshot (調教・適性再設計 — TRAINING_APTITUDE_REDESIGN.md):
 * total_value の漸化(減衰・V2と同一。骨格は不変 §9)は V2 と同じだが、
 * condition_prep を**新しい入力で作る**:
 *   condition_prep = clamp( 個体適性(dna由来) + 調教の備え(メニュー↔条件) + レースアイテム(加算), ±4 )
 * ★コース(surface)がここで初めてスコアに効く(適性/レースアイテムの1軸として)。
 * ★合算後の ±4 クランプは composeConditionPrepV3 が担う(prep>±4 での例外を防ぐ・§12.2)。
 * 調教ロールは V2 同様、確定時に total_value へ反映済み(Decision 112)。ここは読むだけ。
 */
async function createParticipantSnapshotsV3(
  client: SqlClient,
  input: CreateSnapshotsInput,
  conditions: { weather: Weather; track: TrackCondition; surface: Surface },
): Promise<number> {
  const { weather, track, surface } = conditions;
  const conds: RaceConditionsV3 = { weather, track, surface };

  // Market Lock (Decision 076) 不変: 手動出品中の馬は走らない。
  const horses = await client.query<HorseRowV3>(
    `select h.id, h.owner_user_id, h.current_day, h.horse_type::text as horse_type,
            h.rarity::text as rarity, h.dna_hash, h.total_value::text as total_value,
            h.decay_shield_v2
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
      throw new Error(`V3_TOTAL_VALUE_MISSING: horse ${horse.id} has no total_value`);
    }

    // 調教: 選んだメニュー(menus_v2 を V3 でも流用 — キーは同じ enum)と REST 減衰無効。
    const training = await client.query<{ id: string; menus_v2: string[] | null; rests_decay_v2: boolean | null }>(
      `select id, menus_v2, rests_decay_v2 from training_sessions
       where horse_id = $1 and effective_race_date = $2 and slot = $3::race_slot
         and snapshot_included_at is null`,
      [horse.id, input.batchDate, input.slot ?? 'NIGHT'],
    );
    const trainingRow = training.rows[0] ?? null;
    const menus = (trainingRow?.menus_v2 ?? []) as TrainingMenuV3[];
    const restsDecay = trainingRow ? trainingRow.rests_decay_v2 === true : false;

    // レースアイテム(V4): 今夜の条件に対する加算値(的中で+/外れで−・保険は常時+)。
    const raceUsage =
      (
        await client.query<{ id: string; item_key: string; unit_price: string }>(
          `select id, item_key, unit_price::text as unit_price from item_usages
           where horse_id = $1 and effective_race_date = $2 and slot = $3::race_slot
             and usage_kind = 'RACE' and status = 'PENDING'`,
          [horse.id, input.batchDate, input.slot ?? 'NIGHT'],
        )
      ).rows[0] ?? null;
    const itemEdge = raceUsage ? raceItemEdgeV4(raceUsage.item_key, conds) : 0;

    // 減衰シールド(aeon_sand 等): REST が覆わない時に1レース消費。
    const shieldUsed = !restsDecay && horse.decay_shield_v2 > 0;
    const before = Number(horse.total_value);
    // 総合値の漸化はレースでは減衰のみ(Decision 112・ロールは確定時反映済み)。
    const totalValue = applyDecayV2(before, restsDecay || shieldUsed);

    // ★condition_prep = 個体適性 + 調教の備え + レースアイテム(加算)→ ±4 クランプ。
    const apt = deriveAptitudeV3(horse.dna_hash);
    const aptEdge = aptitudeEdgeV3(apt, conds);
    const trnEdge = trainingPrepEdgeV3(menus, conds);
    const prep = round2(composeConditionPrepV3({ apt, menus, itemEdge, conditions: conds }));

    const trainingSnapshot = trainingRow
      ? { menus, rests_decay: restsDecay, apt_edge: round2(aptEdge), prep_edge: round2(trnEdge) }
      : null;
    const itemSnapshot =
      raceUsage || shieldUsed
        ? {
            item_policy_version: ITEM_POLICY_VERSION_V4,
            race_item: raceUsage
              ? { item_key: raceUsage.item_key, item_edge: round2(itemEdge), unit_price: raceUsage.unit_price }
              : null,
            decay_shield_used: shieldUsed,
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
      JSON.stringify(itemSnapshot),
      weather,
      track,
      surface,
      input.raceEngineVersion,
    );

    await client.query('begin');
    try {
      const inserted = await client.query<{ id: string }>(
        `insert into race_participant_snapshots (
           race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash,
           ability_snapshot_json, training_snapshot_json, item_snapshot_json,
           total_value, condition_prep_modifier,
           weather, track_condition, race_engine_version, liquidity_policy_version,
           price_table_version, race_seed_hash, snapshot_hash
         )
         select $1, $2, $3, $4, $5::horse_type, $6::rarity, $7, '{}'::jsonb, $8, $9,
                $10, $11, $12::weather, $13::track_condition, $14, $15, $16,
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
          trainingSnapshot ? JSON.stringify(trainingSnapshot) : null,
          itemSnapshot ? JSON.stringify(itemSnapshot) : null,
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
        await client.query(`update horses set total_value = $2 where id = $1`, [horse.id, totalValue]);
        if (shieldUsed) {
          await client.query(
            `update horses set decay_shield_v2 = decay_shield_v2 - 1
             where id = $1 and decay_shield_v2 > 0`,
            [horse.id],
          );
        }
        if (trainingRow) {
          await client.query(
            `update training_sessions set snapshot_included_at = now() where id = $1`,
            [trainingRow.id],
          );
        }
        if (raceUsage) {
          await client.query(
            `update item_usages set status = 'SNAPSHOTTED', race_id = $2
             where id = $1 and status = 'PENDING'`,
            [raceUsage.id, input.raceId],
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
