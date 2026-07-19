-- Decision 113 (2026-07-20): 確定済みロールへの調教アイテム後付け。
--
-- これまで item_key_v3 / item_bonus_v3 / item_user_item_id は「確定と同時のみ・
-- 以後不変」(20260718020000)。調教は無料・アイテムは有料の上乗せ手段なので、
-- レース処理前(snapshot_included_at が null)に限り、確定後の一回限りの添付
-- (3列同時に null → 値)を許可する。
--
-- 変わらないもの:
--  - 添付済みの変更・付け替え・取り外しは不可(即最終 = Decision 107)
--  - スナップショット凍結後は一切変更不可
--  - ロール本体(menus/per_menu/synergy/delta/rests_decay)は引き続き不変
--  - chk_training_item_v3_complete が「3列は常に揃って null か揃って非 null」を保証

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
  or new.rests_decay_v2 is distinct from old.rests_decay_v2 then
    raise exception 'TRAINING_IMMUTABLE: only snapshot_included_at may be set (training %)', old.id;
  end if;
  -- Decision 113: アイテム3列は「未添付 → 添付」の一方向のみ可
  if old.item_key_v3 is not null
     and (new.item_key_v3 is distinct from old.item_key_v3
       or new.item_bonus_v3 is distinct from old.item_bonus_v3
       or new.item_user_item_id is distinct from old.item_user_item_id) then
    raise exception 'TRAINING_ITEM_FINAL: attached item cannot change or detach (training %)', old.id;
  end if;
  if old.item_key_v3 is null and new.item_key_v3 is null
     and (new.item_bonus_v3 is distinct from old.item_bonus_v3
       or new.item_user_item_id is distinct from old.item_user_item_id) then
    raise exception 'TRAINING_IMMUTABLE: only snapshot_included_at may be set (training %)', old.id;
  end if;
  return new;
end;
$$;
