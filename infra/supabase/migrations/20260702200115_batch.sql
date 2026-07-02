-- Migration 15: batch_runs, batch_steps, marketplace_status
-- (06_DATABASE.md, 05_SETTLEMENT_ENGINE.md, Decisions 038/047)

create table batch_runs (
  id uuid primary key default gen_random_uuid(),
  batch_date date not null unique, -- MYT calendar date (Decision 047)
  batch_algorithm_version text not null,
  status batch_status not null default 'PENDING',
  -- policy versions locked at Step 3
  locked_policy_versions_json jsonb,
  marketplace_locked_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create table batch_steps (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references batch_runs (id),
  step_number int not null check (step_number between 1 and 37),
  step_key text not null,
  status batch_step_status not null default 'PENDING',
  retryable boolean not null default false,
  retry_count int not null default 0 check (retry_count >= 0),
  idempotency_key text not null unique,
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_batch_step unique (batch_run_id, step_number)
);

-- Retry of non-retryable steps is technically impossible: a completed or
-- failed non-retryable step can never return to PENDING/RUNNING.
create or replace function guard_batch_step_update()
returns trigger
language plpgsql
as $$
begin
  if new.batch_run_id is distinct from old.batch_run_id
  or new.step_number is distinct from old.step_number
  or new.step_key is distinct from old.step_key
  or new.retryable is distinct from old.retryable
  or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'BATCH_STEP_IMMUTABLE: identity fields of step % cannot change', old.id;
  end if;
  if not old.retryable
     and old.status in ('COMPLETED', 'FAILED')
     and new.status in ('PENDING', 'RUNNING') then
    raise exception 'RETRY_FORBIDDEN: step % (%) is not retryable', old.step_key, old.id;
  end if;
  if old.status = 'COMPLETED' and new.status is distinct from old.status then
    raise exception 'BATCH_STEP_FINAL: completed step % cannot change status', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_batch_step_guard
before update on batch_steps
for each row execute function guard_batch_step_update();

-- Singleton marketplace state (05_SETTLEMENT_ENGINE.md).
create table marketplace_status (
  id boolean primary key default true check (id), -- singleton row
  state marketplace_state not null default 'OPEN',
  locked_by_batch_run_id uuid references batch_runs (id),
  locked_at timestamptz,
  updated_at timestamptz not null default now()
);

create trigger trg_marketplace_no_delete
before delete on marketplace_status
for each row execute function forbid_delete();

-- Deferred FKs now that batch_runs exists (races and listings were created
-- earlier in the fixed migration order).
alter table races
  add constraint fk_races_batch_run foreign key (batch_run_id) references batch_runs (id);
alter table market_listings
  add constraint fk_listings_batch_run foreign key (batch_run_id) references batch_runs (id);
alter table ownership_assignments
  add constraint fk_assignments_batch_run foreign key (batch_run_id) references batch_runs (id);
alter table purchase_sessions
  add constraint fk_purchase_sessions_batch_run foreign key (batch_run_id) references batch_runs (id);
