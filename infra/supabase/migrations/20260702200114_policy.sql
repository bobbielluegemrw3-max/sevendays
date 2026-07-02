-- Migration 14: policy tables (06_DATABASE.md)
-- Policy records are versioned and IMMUTABLE after activation.
-- Content is stored as policy_json validated by the application layer
-- (packages/economy-engine); version strings are referenced everywhere else.

create or replace function guard_policy_update()
returns trigger
language plpgsql
as $$
begin
  if old.activated_at is not null then
    -- Once activated, only deactivation is allowed (superseded by a new version).
    if new.version is distinct from old.version
    or new.policy_json is distinct from old.policy_json
    or new.created_at is distinct from old.created_at
    or new.activated_at is distinct from old.activated_at then
      raise exception 'POLICY_IMMUTABLE: activated policy % cannot change', old.version;
    end if;
    if old.deactivated_at is not null and new.deactivated_at is distinct from old.deactivated_at then
      raise exception 'POLICY_IMMUTABLE: deactivated policy % is frozen', old.version;
    end if;
  end if;
  return new;
end;
$$;

-- Template applied to each policy table:
--   id, version (unique), policy_json, created_at, activated_at, deactivated_at

create table liquidity_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_liquidity_policies_guard before update on liquidity_policies
for each row execute function guard_policy_update();
create trigger trg_liquidity_policies_no_delete before delete on liquidity_policies
for each row execute function forbid_delete();

create table reserve_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_reserve_policies_guard before update on reserve_policies
for each row execute function guard_policy_update();
create trigger trg_reserve_policies_no_delete before delete on reserve_policies
for each row execute function forbid_delete();

create table buff_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_buff_policies_guard before update on buff_policies
for each row execute function guard_policy_update();
create trigger trg_buff_policies_no_delete before delete on buff_policies
for each row execute function forbid_delete();

create table price_tables (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_price_tables_guard before update on price_tables
for each row execute function guard_policy_update();
create trigger trg_price_tables_no_delete before delete on price_tables
for each row execute function forbid_delete();

create table assignment_algorithm_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_assignment_algorithm_versions_guard before update on assignment_algorithm_versions
for each row execute function guard_policy_update();
create trigger trg_assignment_algorithm_versions_no_delete before delete on assignment_algorithm_versions
for each row execute function forbid_delete();

create table race_engine_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_race_engine_versions_guard before update on race_engine_versions
for each row execute function guard_policy_update();
create trigger trg_race_engine_versions_no_delete before delete on race_engine_versions
for each row execute function forbid_delete();

-- Economy thresholds + stability rule live in economy_policies (referenced
-- as economy_policy_version by 04_ECONOMY_ENGINE.md).
create table economy_policies (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_economy_policies_guard before update on economy_policies
for each row execute function guard_policy_update();
create trigger trg_economy_policies_no_delete before delete on economy_policies
for each row execute function forbid_delete();

create table horse_generation_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  policy_json jsonb not null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  deactivated_at timestamptz
);
create trigger trg_horse_generation_versions_guard before update on horse_generation_versions
for each row execute function guard_policy_update();
create trigger trg_horse_generation_versions_no_delete before delete on horse_generation_versions
for each row execute function forbid_delete();

-- Daily economy status evaluation records (04_ECONOMY_ENGINE.md).
-- The Deterministic Policy Engine recommendation and the threshold-validated
-- final status are both recorded (AI recommends; policy decides).
create table economy_status_evaluations (
  id uuid primary key default gen_random_uuid(),
  evaluation_date date not null unique,
  economy_policy_version text not null,
  metrics_json jsonb not null,
  recommended_status economy_status not null,
  final_status economy_status not null,
  consecutive_match_days int not null default 1,
  created_at timestamptz not null default now()
);
create trigger trg_economy_evaluations_immutable
before update or delete on economy_status_evaluations
for each row execute function forbid_mutation();
