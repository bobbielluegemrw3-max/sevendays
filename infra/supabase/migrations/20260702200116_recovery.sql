-- Migration 16: recovery_snapshots, recovery_logs
-- (06_DATABASE.md, 05_SETTLEMENT_ENGINE.md Admin Recovery)

create table recovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references batch_runs (id),
  recovery_reason text not null,
  approval_status recovery_approval_status not null default 'PENDING',
  approved_by_1 uuid references users (id),
  approved_by_2 uuid references users (id),
  before_snapshot_hash text not null,
  after_snapshot_hash text,
  created_at timestamptz not null default now(),
  -- dual approval requires two DISTINCT admins
  constraint recovery_distinct_approvers check (
    approved_by_1 is null or approved_by_2 is null or approved_by_1 <> approved_by_2
  ),
  constraint recovery_approved_requires_both check (
    approval_status <> 'APPROVED' or (approved_by_1 is not null and approved_by_2 is not null)
  )
);

create table recovery_logs (
  id uuid primary key default gen_random_uuid(),
  recovery_snapshot_id uuid not null references recovery_snapshots (id),
  batch_run_id uuid not null references batch_runs (id),
  actor_user_id uuid references users (id),
  action text not null,
  step_key text,
  reason text,
  result text,
  created_at timestamptz not null default now()
);

-- Recovery logs are append-only audit records.
create trigger trg_recovery_logs_immutable
before update or delete on recovery_logs
for each row execute function forbid_mutation();

create trigger trg_recovery_snapshots_no_delete
before delete on recovery_snapshots
for each row execute function forbid_delete();
