-- Migration 08: training_sessions (06_DATABASE.md, 03_GAME_DESIGN.md)

create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses (id),
  user_id uuid not null references users (id),
  training_type training_type not null,
  training_date date not null,
  effective_race_date date not null,
  created_at timestamptz not null default now(),
  snapshot_included_at timestamptz,
  -- one horse has at most one training per effective_race_date
  constraint uq_training_horse_race_date unique (horse_id, effective_race_date)
);

-- No edit after snapshot_included_at is set. The only permitted update is
-- setting snapshot_included_at itself (once).
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
  or new.created_at is distinct from old.created_at then
    raise exception 'TRAINING_IMMUTABLE: only snapshot_included_at may be set (training %)', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_training_guard
before update on training_sessions
for each row execute function guard_training_update();

-- Deleting is allowed ONLY while not yet snapshot-included (user changes mind
-- before the cutoff); afterwards the record is part of replay history.
create or replace function guard_training_delete()
returns trigger
language plpgsql
as $$
begin
  if old.snapshot_included_at is not null then
    raise exception 'TRAINING_FROZEN: snapshot-included training % cannot be deleted', old.id;
  end if;
  return old;
end;
$$;

create trigger trg_training_delete_guard
before delete on training_sessions
for each row execute function guard_training_delete();
