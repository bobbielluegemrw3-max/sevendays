-- Migration 06: races, randomness_commits, race_participant_snapshots
-- (06_DATABASE.md; 03_GAME_DESIGN.md commit-reveal, snapshots; Decision 039)

-- Commit-reveal randomness. Race cannot start unless commit exists;
-- reveal must verify SHA-256(reveal_seed) == commit_hash — enforced here.
create table randomness_commits (
  id uuid primary key default gen_random_uuid(),
  reference_type text not null,
  reference_id uuid not null,
  commit_hash text not null,
  reveal_seed text,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  constraint uq_randomness_reference unique (reference_type, reference_id)
);

create or replace function guard_randomness_commit()
returns trigger
language plpgsql
as $$
begin
  if new.commit_hash is distinct from old.commit_hash then
    raise exception 'SEED_COMMIT_IMMUTABLE: commit_hash cannot change (commit %)', old.id;
  end if;
  if old.reveal_seed is not null and new.reveal_seed is distinct from old.reveal_seed then
    raise exception 'SEED_REVEAL_IMMUTABLE: reveal_seed cannot change once set (commit %)', old.id;
  end if;
  if new.reveal_seed is not null and old.reveal_seed is null then
    if encode(digest(new.reveal_seed, 'sha256'), 'hex') <> lower(new.commit_hash) then
      raise exception 'RACE_SEED_VERIFICATION_FAILED: SHA-256(reveal_seed) does not match commit_hash (commit %)', old.id;
    end if;
    new.revealed_at := coalesce(new.revealed_at, now());
  end if;
  return new;
end;
$$;

create trigger trg_randomness_guard
before update on randomness_commits
for each row execute function guard_randomness_commit();

create trigger trg_randomness_no_delete
before delete on randomness_commits
for each row execute function forbid_delete();

-- Races. batch_run_id FK is added in migration 15 (batch tables come later
-- in the fixed migration order).
create table races (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null,
  race_engine_version text not null,
  seed_commit_id uuid not null references randomness_commits (id),
  status race_status not null default 'CREATED',
  participant_count int not null default 0 check (participant_count >= 0),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Immutable participant snapshot (03_GAME_DESIGN.md).
-- Input columns are written once at snapshot creation (Step 7).
-- Score columns are written exactly once by the Race Engine (Step 8),
-- then the whole row is frozen.
create table race_participant_snapshots (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references races (id),
  horse_id uuid not null references horses (id),
  owner_user_id uuid not null references users (id),
  current_day int not null check (current_day between 0 and 6),
  horse_type horse_type not null,
  rarity rarity not null,
  dna_hash text not null,
  ability_snapshot_json jsonb not null,
  training_snapshot_json jsonb,
  revenge_buff_snapshot_json jsonb,
  weather weather not null,
  track_condition track_condition not null,
  race_engine_version text not null,
  liquidity_policy_version text not null,
  price_table_version text not null,
  race_seed_hash text not null,
  snapshot_hash text not null,
  created_at timestamptz not null default now(),
  -- score columns, filled once by Race Engine step
  base_ability_score numeric(20, 8) check (base_ability_score between 50.00 and 100.00),
  horse_type_modifier numeric(20, 8) check (horse_type_modifier between -3.00 and 3.00),
  rarity_modifier numeric(20, 8) check (rarity_modifier in (0, 1, 2, 3, 4)),
  dna_modifier numeric(20, 8) check (dna_modifier between -2.00 and 2.00),
  training_modifier numeric(20, 8) check (training_modifier between 0.00 and 5.00),
  weather_modifier numeric(20, 8) check (weather_modifier between -2.00 and 2.00),
  track_modifier numeric(20, 8) check (track_modifier between -2.00 and 2.00),
  condition_modifier numeric(20, 8) check (condition_modifier between -3.00 and 3.00),
  fatigue_modifier numeric(20, 8) check (fatigue_modifier between -5.00 and 0.00),
  revenge_buff_modifier numeric(20, 8) check (revenge_buff_modifier in (0, 4, 7, 10)),
  random_modifier numeric(20, 8) check (random_modifier between -3.00 and 4.00),
  final_score numeric(20, 8),
  constraint uq_snapshot_race_horse unique (race_id, horse_id)
);

-- Immutability: the only permitted update fills the score columns while they
-- are all NULL. Everything else is frozen forever.
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

create trigger trg_snapshot_guard
before update on race_participant_snapshots
for each row execute function guard_snapshot_update();

create trigger trg_snapshot_no_delete
before delete on race_participant_snapshots
for each row execute function forbid_delete();
