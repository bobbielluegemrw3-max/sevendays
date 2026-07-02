-- Migration 17: audit_logs — immutable critical action log (06_DATABASE.md)

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_type actor_type not null,
  actor_id uuid,
  action text not null,
  reference_type text,
  reference_id uuid,
  before_hash text,
  after_hash text,
  created_at timestamptz not null default now()
);

create trigger trg_audit_logs_immutable
before update or delete on audit_logs
for each row execute function forbid_mutation();
