-- Migration 09: revenge_buffs (06_DATABASE.md, 03_GAME_DESIGN.md)

create table revenge_buffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  status buff_status not null default 'ACTIVE',
  buff_rarity buff_rarity not null,
  buff_bonus_score numeric(20, 8) not null,
  buff_policy_version text not null,
  deterministic_buff_roll text not null,
  generated_at timestamptz not null default now(),
  applied_at timestamptz,
  consumed_at timestamptz,
  refreshed_at timestamptz,
  -- Buff Table v1.0: N +4, R +7, SR +10
  constraint buff_bonus_matches_rarity check (
    (buff_rarity = 'N' and buff_bonus_score = 4)
    or (buff_rarity = 'R' and buff_bonus_score = 7)
    or (buff_rarity = 'SR' and buff_bonus_score = 10)
  )
);

-- Maximum one active buff per user (refresh, not duplicate).
create unique index uq_revenge_buff_one_active
  on revenge_buffs (user_id)
  where status = 'ACTIVE';

-- Buffs cannot be transferred between users; consumed buffs are frozen.
create or replace function guard_buff_update()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'BUFF_NOT_TRANSFERABLE: revenge buff % belongs to its user forever', old.id;
  end if;
  if old.status = 'CONSUMED' then
    raise exception 'BUFF_FROZEN: consumed buff % cannot change', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_buff_guard
before update on revenge_buffs
for each row execute function guard_buff_update();

create trigger trg_buff_no_delete
before delete on revenge_buffs
for each row execute function forbid_delete();
