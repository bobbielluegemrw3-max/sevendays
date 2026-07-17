-- FUN overhaul V2 — training per race cycle + final-on-confirm (Decisions
-- 102/104/107), phase V2実装-4a.
--
-- 1) training_sessions gains a race slot: one training per horse per
--    (effective_race_date, slot) — two cycles a day under V2. Existing rows
--    and V1 writes default to NIGHT, so the current season is unchanged.
-- 2) Decision 107: a V2 rolled training (menus_v2 not null) is FINAL on
--    confirm — it can never be deleted (no redo; the roll resolved at
--    confirm is the gamble). The V1 rollless redo (delete+insert while not
--    snapshot-included) stays exactly as before for V1 rows.

alter table training_sessions
  add column slot race_slot not null default 'NIGHT';

alter table training_sessions drop constraint uq_training_horse_race_date;
alter table training_sessions
  add constraint uq_training_horse_race_slot unique (horse_id, effective_race_date, slot);

-- slot joins the frozen-fields list of the update guard.
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
  return new;
end;
$$;

create or replace function guard_training_delete()
returns trigger
language plpgsql
as $$
begin
  if old.snapshot_included_at is not null then
    raise exception 'TRAINING_FROZEN: snapshot-included training % cannot be deleted', old.id;
  end if;
  -- Decision 107: the confirm-time roll is final — no redo for V2 rows.
  if old.menus_v2 is not null then
    raise exception 'TRAINING_FINAL: V2 training % resolved on confirm and cannot be redone (Decision 107)', old.id;
  end if;
  return old;
end;
$$;
