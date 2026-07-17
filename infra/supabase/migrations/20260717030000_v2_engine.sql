-- FUN overhaul V2 — engine wiring phase 1b (Decisions 101/102/104).
--
-- Adds the V2 data surfaces WITHOUT switching the engine:
--   1) horses.total_value            — current Total Value 0..100 (minted at the
--      season reset via mintTotalValueV2; NULL for V1-era horses)
--   2) training_sessions V2 columns  — the roll RESOLVES on the confirm button
--      (Decision 104) and the row stores the result; the snapshot only reads it
--   3) race_participant_snapshots    — V2 frozen inputs (total_value,
--      condition_prep_modifier) + luck_modifier score column
--   4) race_engine_v2.0 registered INACTIVE — batches keep locking v1.1 until
--      the version is activated at the testnet-reset rollout (separate step).
-- V1 replay compatibility: nothing existing changes shape; all new columns are
-- nullable and V1 rows never populate them.

-- 1) horses --------------------------------------------------------------
alter table horses
  add column total_value numeric(20, 8)
    check (total_value is null or total_value between 0.00 and 100.00);

-- 2) training_sessions ---------------------------------------------------
-- V2 rows carry menus + the confirm-time roll instead of a V1 training_type.
alter table training_sessions alter column training_type drop not null;

alter table training_sessions
  add column menus_v2 text[]
    check (menus_v2 is null or (
      array_length(menus_v2, 1) between 1 and 2
      and menus_v2 <@ array['HILL','POOL','SPAR','GATE','WOOD','REST']::text[]
    )),
  add column per_menu_v2 jsonb,
  add column synergy_v2 numeric(20, 8),
  add column delta_v2 numeric(20, 8),
  add column rests_decay_v2 boolean;

-- A row is either a complete V1 training or a complete V2 training, never a mix.
alter table training_sessions
  add constraint chk_training_v1_or_v2 check (
    (training_type is not null and menus_v2 is null and per_menu_v2 is null
       and synergy_v2 is null and delta_v2 is null and rests_decay_v2 is null)
    or
    (training_type is null and menus_v2 is not null and per_menu_v2 is not null
       and synergy_v2 is not null and delta_v2 is not null and rests_decay_v2 is not null)
  );

-- Extend the freeze guard: V2 roll results are as immutable as training_type
-- (redo is delete+insert, never update — schema constitution).
create or replace function guard_training_update()
returns trigger
language plpgsql
as $$
begin
  if old.snapshot_included_at is not null then
    raise exception 'TRAINING_FROZEN: training % is included in a snapshot and cannot change', old.id;
  end if;
  if new.horse_id is distinct from old.horse_id
  or new.user_id is distinct from old.user_id
  or new.training_type is distinct from old.training_type
  or new.training_date is distinct from old.training_date
  or new.effective_race_date is distinct from old.effective_race_date
  or new.created_at is distinct from old.created_at
  or new.menus_v2 is distinct from old.menus_v2
  or new.per_menu_v2 is distinct from old.per_menu_v2
  or new.synergy_v2 is distinct from old.synergy_v2
  or new.delta_v2 is distinct from old.delta_v2
  or new.rests_decay_v2 is distinct from old.rests_decay_v2 then
    raise exception 'TRAINING_IMMUTABLE: only snapshot_included_at may be set (training %)', old.id;
  end if;
  return new;
end;
$$;

-- 3) race_participant_snapshots -----------------------------------------
-- Inputs frozen at Step 7: total_value (post-roll, post-decay — the value that
-- races tonight) and condition_prep_modifier (type aptitude for the revealed
-- weather+track, +-4 vessel; race items join here in a later phase).
-- luck_modifier is a score column, written once by Step 8 with final_score.
alter table race_participant_snapshots
  add column total_value numeric(20, 8)
    check (total_value is null or total_value between 0.00 and 100.00),
  add column condition_prep_modifier numeric(20, 8)
    check (condition_prep_modifier is null or condition_prep_modifier between -4.00 and 4.00),
  add column luck_modifier numeric(20, 8)
    check (luck_modifier is null or luck_modifier between -3.00 and 4.00);

-- Recreate the snapshot guard: the new V2 inputs join the frozen list
-- (item_snapshot_json, added in the item-system migration, is added to the
-- frozen list here too — it is snapshot-creation data and must never change).
create or replace function guard_snapshot_update()
returns trigger
language plpgsql
as $$
begin
  if old.final_score is not null then
    raise exception 'RACE_SNAPSHOT_IMMUTABLE: snapshot % is frozen', old.id;
  end if;
  if new.race_id is distinct from old.race_id
  or new.horse_id is distinct from old.horse_id
  or new.owner_user_id is distinct from old.owner_user_id
  or new.current_day is distinct from old.current_day
  or new.horse_type is distinct from old.horse_type
  or new.rarity is distinct from old.rarity
  or new.dna_hash is distinct from old.dna_hash
  or new.ability_snapshot_json is distinct from old.ability_snapshot_json
  or new.training_snapshot_json is distinct from old.training_snapshot_json
  or new.revenge_buff_snapshot_json is distinct from old.revenge_buff_snapshot_json
  or new.item_snapshot_json is distinct from old.item_snapshot_json
  or new.total_value is distinct from old.total_value
  or new.condition_prep_modifier is distinct from old.condition_prep_modifier
  or new.weather is distinct from old.weather
  or new.track_condition is distinct from old.track_condition
  or new.race_engine_version is distinct from old.race_engine_version
  or new.liquidity_policy_version is distinct from old.liquidity_policy_version
  or new.price_table_version is distinct from old.price_table_version
  or new.race_seed_hash is distinct from old.race_seed_hash
  or new.snapshot_hash is distinct from old.snapshot_hash
  or new.created_at is distinct from old.created_at then
    raise exception 'RACE_SNAPSHOT_IMMUTABLE: input fields cannot change (snapshot %)', old.id;
  end if;
  if new.final_score is null then
    raise exception 'RACE_SNAPSHOT_SCORE_REQUIRED: score update must set final_score (snapshot %)', old.id;
  end if;
  return new;
end;
$$;

-- 4) engine version ------------------------------------------------------
-- Registered INACTIVE (activated_at null): loadActivePolicy ignores it, so
-- production batches keep locking race_engine_v1.1. Activation happens with
-- the testnet-reset rollout via activatePolicy.
insert into race_engine_versions (version, policy_json)
values ('race_engine_v2.0', '{
  "formula": "final_score = total_value + condition_prep_modifier + luck_modifier",
  "total_value_rule": "mint uniform 40..75; training roll resolves on confirm (menus public ranges, hidden preferences 70/30, synergy); recurrence at snapshot = softcap-gain(delta) then decay 2.0 (REST negates one decay tick); clamp 0..100; softcap 85 halves gains above (Decision 101/104)",
  "condition_prep_rule": "type aptitude for revealed weather + track (WEATHER_MODIFIER_V1 + TRACK_MODIFIER_V1, each +-2, sum +-4); race items join this vessel in a later phase (Decision 101)",
  "luck_rule": "Irwin-Hall(3) uniform composite in -3.00..+3.00; LUCK type with a confirmed training widens to -2.00..+4.00 (Decision 052/101)",
  "burn_rate_source": "volatility_v1.0",
  "burn_rate_rule": "rate = BURN_TARGET_RATE_V1[economy_status] + symmetric_jitter(race_seed); envelope [0.080, 0.135] fixed (ADR-012, unchanged vessel per Decision 102)",
  "burn_count_rule": "floor(eligible * rate) — constitution rule unchanged"
}'::jsonb)
on conflict (version) do nothing;
