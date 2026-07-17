-- FUN overhaul V2 — item catalog V2 (Decision 109), phase V2実装-6 (IT2-2).
-- コード上の版数は item_policy_v3.0(既存の item_policy_v2.0 = Decision 082版と区別)。
--
-- すべて追加のみ・V1挙動不変:
--  - item_catalog.item_class: 'V1'(既定=旧35種)| 'TRAINING' | 'RACE'
--  - V3の35行は **active=false でシード** — 現行シーズンのショップには一切出ない。
--    有効化はテストネットリセット時(旧35種の active=false 化と同時・§7チェックリスト)
--  - item_usages: (date)→(date, slot) のレース単位化+usage_kind(RACE=既定/TRAINING)+
--    DUAL_PREP の備え先選択(params_json)。ユニークは (horse, date, slot, kind) へ
--    (V1行は既定値でこれまでと同一の一意性)
--  - training_sessions: TRAINING系アイテムの添付記録(キー・確定ロールボーナス・在庫リンク)
--  - horses.decay_shield_v2: 星霜の砂(aeon_sand)の減衰無効残回数

alter table item_catalog
  add column item_class text not null default 'V1'
    check (item_class in ('V1', 'TRAINING', 'RACE'));

-- item_usages: race-cycle keying + class split ---------------------------
alter table item_usages
  add column slot race_slot not null default 'NIGHT',
  add column usage_kind text not null default 'RACE'
    check (usage_kind in ('RACE', 'TRAINING')),
  add column params_json jsonb;

drop index uq_item_usage_horse_race;
create unique index uq_item_usage_horse_race_slot_kind
  on item_usages (horse_id, effective_race_date, slot, usage_kind)
  where status <> 'CANCELLED';

-- training_sessions: V3 training-item attachment (rolled at confirm) -----
alter table training_sessions
  add column item_key_v3 text references item_catalog (key),
  add column item_bonus_v3 numeric(20, 8),
  add column item_user_item_id uuid references user_items (id),
  add constraint chk_training_item_v3_requires_menus
    check (item_key_v3 is null or menus_v2 is not null),
  add constraint chk_training_item_v3_complete
    check ((item_key_v3 is null) = (item_bonus_v3 is null)
       and (item_key_v3 is null) = (item_user_item_id is null));

-- 添付はロールと同時に確定(Decision 107)— 凍結リストに追補
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
  or new.slot is distinct from old.slot
  or new.created_at is distinct from old.created_at
  or new.menus_v2 is distinct from old.menus_v2
  or new.per_menu_v2 is distinct from old.per_menu_v2
  or new.synergy_v2 is distinct from old.synergy_v2
  or new.delta_v2 is distinct from old.delta_v2
  or new.rests_decay_v2 is distinct from old.rests_decay_v2
  or new.item_key_v3 is distinct from old.item_key_v3
  or new.item_bonus_v3 is distinct from old.item_bonus_v3
  or new.item_user_item_id is distinct from old.item_user_item_id then
    raise exception 'TRAINING_IMMUTABLE: only snapshot_included_at may be set (training %)', old.id;
  end if;
  return new;
end;
$$;

-- horses: decay shield (aeon_sand — instant apply, consumed per race) ----
alter table horses
  add column decay_shield_v2 int not null default 0 check (decay_shield_v2 >= 0);

-- V3 catalog seed (35 rows, active=false until the reset switch) ---------
insert into item_catalog
  (key, name_ja, name_en, band, price, sellable, giftable, usable_day_min, usable_day_max, active, item_class)
values
  ('carrot_cube', 'にんじんキューブ', 'Carrot Cubes', 'BASIC', 2, true, true, null, null, false, 'TRAINING'),
  ('highland_hay', '高原の干し草', 'Highland Hay', 'BASIC', 3, true, true, null, null, false, 'TRAINING'),
  ('protein_mash', 'プロテインマッシュ', 'Protein Mash', 'STANDARD', 5, true, true, null, null, false, 'TRAINING'),
  ('royal_banquet', 'ロイヤルフィースト', 'Royal Banquet', 'PREMIUM', 8, true, true, null, null, false, 'TRAINING'),
  ('masters_eye', '名伯楽の眼', 'Master''s Eye', 'PREMIUM', 6, true, true, null, null, false, 'TRAINING'),
  ('farrier_kit', '装蹄キット', 'Farrier Kit', 'STANDARD', 4, true, true, null, null, false, 'TRAINING'),
  ('foal_milk', '若駒のミルク', 'Foal Milk', 'BASIC', 3, true, true, null, 1, false, 'TRAINING'),
  ('awakening_elixir', '覚醒のエリキシル', 'Awakening Elixir', 'PREMIUM', 10, true, true, null, null, false, 'TRAINING'),
  ('hill_manual', '坂路の心得', 'Hill Manual', 'BASIC', 3, true, true, null, null, false, 'TRAINING'),
  ('pool_float', 'プールの浮き具', 'Pool Float', 'BASIC', 3, true, true, null, null, false, 'TRAINING'),
  ('spar_guard', '併せ馬の防具', 'Sparring Guard', 'STANDARD', 4, true, true, null, null, false, 'TRAINING'),
  ('gate_bell', 'ゲートの鈴', 'Gate Bell', 'BASIC', 3, true, true, null, null, false, 'TRAINING'),
  ('wood_premium', '極上ウッドチップ', 'Premium Wood Chips', 'BASIC', 3, true, true, null, null, false, 'TRAINING'),
  ('elder_blanket', '古馬の毛布', 'Elder Blanket', 'STANDARD', 5, true, true, 4, null, false, 'TRAINING'),
  ('synergy_incense', '好物の香', 'Synergy Incense', 'PREMIUM', 6, true, true, null, null, false, 'TRAINING'),
  ('rain_cape', '雨のケープ', 'Rain Cape', 'BASIC', 2, true, true, null, null, false, 'RACE'),
  ('storm_armor', '嵐の完全装具', 'Storm Armor', 'STANDARD', 5, true, true, null, null, false, 'RACE'),
  ('sun_visor', '陽よけのバイザー', 'Sun Visor', 'BASIC', 2, true, true, null, null, false, 'RACE'),
  ('solar_silks', '快晴の勝負服', 'Solar Silks', 'STANDARD', 5, true, true, null, null, false, 'RACE'),
  ('mud_shoes', '道悪蹄鉄', 'Mud Shoes', 'BASIC', 2, true, true, null, null, false, 'RACE'),
  ('mud_plates', '重馬場プレート', 'Mud Plates', 'STANDARD', 5, true, true, null, null, false, 'RACE'),
  ('speed_calks', '快速カルクス', 'Speed Calks', 'BASIC', 2, true, true, null, null, false, 'RACE'),
  ('glass_plates', '良馬場プレート', 'Glass Plates', 'STANDARD', 5, true, true, null, null, false, 'RACE'),
  ('full_harness', '完全装備', 'Full Harness', 'PREMIUM', 8, true, true, null, null, false, 'RACE'),
  ('storm_eye', '嵐の眼', 'Eye of the Storm', 'BASIC', 3, true, true, null, null, false, 'RACE'),
  ('clear_plume', '快晴の羽根飾り', 'Clear-Sky Plume', 'BASIC', 3, true, true, null, null, false, 'RACE'),
  ('deep_tread', '不良の深爪', 'Deep Treads', 'BASIC', 3, true, true, null, null, false, 'RACE'),
  ('firm_grip', '堅良のグリップ', 'Firm Grip', 'BASIC', 3, true, true, null, null, false, 'RACE'),
  ('field_kit', '野営一式', 'Field Kit', 'STANDARD', 4, true, true, null, null, false, 'RACE'),
  ('steady_tack', '堅実な馬具', 'Steady Tack', 'STANDARD', 4, true, true, null, null, false, 'RACE'),
  ('keepsake_shoe', '形見の蹄鉄', 'Keepsake Shoe', 'BURN_DROP', 0, false, false, null, null, false, 'RACE'),
  ('farewell_wreath', '追悼の花冠', 'Farewell Wreath', 'BURN_DROP', 0, false, false, null, null, false, 'TRAINING'),
  ('testament_mane', '遺志のたてがみ', 'Testament Mane', 'BURN_DROP', 0, false, false, null, null, false, 'TRAINING'),
  ('roar_soul', '咆哮の魂', 'Roar Soul', 'BURN_DROP', 0, false, false, null, null, false, 'TRAINING'),
  ('aeon_sand', '星霜の砂', 'Aeon Sand', 'BURN_DROP', 0, false, false, null, null, false, 'TRAINING')
;
