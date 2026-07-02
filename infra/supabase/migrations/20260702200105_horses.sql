-- Migration 05: horses (06_DATABASE.md, 03_GAME_DESIGN.md, Decisions 038/050)

create table horses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users (id),
  status horse_status not null default 'ACTIVE',
  current_day int not null default 0 check (current_day between 0 and 7),
  -- deterministic Name Generator output (Decision 050): Bloodline + Prefix + Suffix
  name text not null,
  horse_type horse_type not null,
  rarity rarity not null,
  dna_hash text not null,
  dna_modifier numeric(20, 8) not null check (dna_modifier between -2.00 and 2.00),
  horse_generation_version text not null,
  mint_seed_hash text not null,
  ability_json jsonb not null,
  last_listed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Generation fields are immutable after creation; lifecycle rules are guarded.
create or replace function guard_horse_update()
returns trigger
language plpgsql
as $$
begin
  -- Horse generation records are immutable (03_GAME_DESIGN.md).
  if new.name               is distinct from old.name
  or new.horse_type          is distinct from old.horse_type
  or new.rarity              is distinct from old.rarity
  or new.dna_hash            is distinct from old.dna_hash
  or new.dna_modifier        is distinct from old.dna_modifier
  or new.horse_generation_version is distinct from old.horse_generation_version
  or new.mint_seed_hash      is distinct from old.mint_seed_hash
  or new.ability_json        is distinct from old.ability_json
  or new.created_at          is distinct from old.created_at then
    raise exception 'HORSE_GENERATION_IMMUTABLE: generation fields cannot be modified (horse %)', old.id;
  end if;

  -- Day7 and burned statuses cannot return to P2P (06_DATABASE.md).
  if old.status = 'BURNED' and new.status is distinct from old.status then
    raise exception 'HORSE_STATUS_FINAL: burned horse cannot change status (horse %)', old.id;
  end if;
  if old.status = 'MEMORIALIZED' and new.status is distinct from old.status then
    raise exception 'HORSE_STATUS_FINAL: memorialized horse cannot change status (horse %)', old.id;
  end if;
  if old.status = 'DAY7_CLEARED' and new.status not in ('DAY7_CLEARED', 'MEMORIALIZED') then
    raise exception 'HORSE_STATUS_FINAL: day7-cleared horse can only become MEMORIALIZED (horse %)', old.id;
  end if;

  -- current_day increments only via race survival, never decreases,
  -- and moves at most one day at a time (03_GAME_DESIGN.md).
  if new.current_day < old.current_day then
    raise exception 'HORSE_DAY_DECREASE_FORBIDDEN (horse %)', old.id;
  end if;
  if new.current_day > old.current_day + 1 then
    raise exception 'HORSE_DAY_SKIP_FORBIDDEN (horse %)', old.id;
  end if;
  -- Burned horses do not increment current_day.
  if new.status = 'BURNED' and new.current_day is distinct from old.current_day then
    raise exception 'HORSE_BURNED_DAY_FROZEN (horse %)', old.id;
  end if;

  return new;
end;
$$;

create trigger trg_horses_guard
before update on horses
for each row execute function guard_horse_update();

create or replace function forbid_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'DELETE_FORBIDDEN: % rows are permanent', tg_table_name;
end;
$$;

create trigger trg_horses_no_delete
before delete on horses
for each row execute function forbid_delete();
