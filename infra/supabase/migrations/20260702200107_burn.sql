-- Migration 07: race_results, horse_burns (06_DATABASE.md, 03_GAME_DESIGN.md)

-- Generic immutability guard for non-ledger permanent records.
create or replace function forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'IMMUTABLE_RECORD: % on % is forbidden', tg_op, tg_table_name;
end;
$$;

create table race_results (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id),
  horse_id uuid not null references horses (id),
  final_score numeric(20, 8) not null,
  deterministic_tiebreak_score numeric(30, 20) not null,
  final_rank int not null check (final_rank >= 1),
  is_burned boolean not null default false,
  created_at timestamptz not null default now(),
  constraint uq_result_race_horse unique (race_id, horse_id),
  constraint uq_result_race_rank unique (race_id, final_rank)
);

create trigger trg_race_results_immutable
before update or delete on race_results
for each row execute function forbid_mutation();

create table horse_burns (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id),
  horse_id uuid not null references horses (id) unique,
  owner_user_id_at_snapshot uuid not null references users (id),
  burn_event_id uuid not null default gen_random_uuid(),
  burn_target_count int not null check (burn_target_count >= 0),
  burn_policy_version text not null,
  created_at timestamptz not null default now()
);

create trigger trg_horse_burns_immutable
before update or delete on horse_burns
for each row execute function forbid_mutation();
