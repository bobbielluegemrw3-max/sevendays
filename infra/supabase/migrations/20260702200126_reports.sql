-- Migration 26: liquidity reports and stress test results (Steps 31-32).
-- Implementation artifacts backing GET /admin/liquidity/reports and
-- GET /admin/stress-tests (07_API.md). Admin/service access only.

create table liquidity_reports (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references batch_runs (id) unique,
  report_date date not null,
  metrics_json jsonb not null,
  created_at timestamptz not null default now()
);

create table stress_test_results (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null references batch_runs (id),
  scenario text not null,
  passed boolean not null,
  detail_json jsonb not null,
  created_at timestamptz not null default now(),
  constraint uq_stress_result unique (batch_run_id, scenario)
);

create index idx_stress_results_batch on stress_test_results (batch_run_id);

create trigger trg_liquidity_reports_immutable
before update or delete on liquidity_reports
for each row execute function forbid_mutation();

create trigger trg_stress_results_immutable
before update or delete on stress_test_results
for each row execute function forbid_mutation();

alter table liquidity_reports enable row level security;
alter table stress_test_results enable row level security;
-- no authenticated policies: admin API / service role only
