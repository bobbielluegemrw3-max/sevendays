-- 管理者ユーザー運用(2026-07-09):
--   1) presence: 認証済みAPIアクセスの最終時刻(オンライン判定・最終ログイン表示)
--   2) admin_fund_grants: 管理者からのUSDT付与キュー。
--      憲法「Admin adjustments require audit records and dual approval」に従い、
--      申請者と別の管理者の承認で postAdminAdjustment(ADMIN_ADJUSTMENT)を起票する。

alter table users add column if not exists last_seen_at timestamptz;

create table admin_fund_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  amount numeric(20, 8) not null check (amount > 0),
  reason text not null,
  requested_by uuid not null references users (id),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'CANCELLED')),
  approved_by uuid references users (id),
  ledger_transaction_id uuid references ledger_transactions (id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint admin_fund_grants_distinct_approver check (approved_by is null or approved_by <> requested_by)
);

create index idx_admin_fund_grants_status on admin_fund_grants (status, created_at desc);
create index idx_users_last_seen on users (last_seen_at desc nulls last);
