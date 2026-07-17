-- FUN改修 B層(FUN_V2_PLAN.md §4・FUN_REVISION.md §9.3): 運営広告費口座。
-- 「吐き出し」= レースの数学(BURN率・価格表・割当)は一切曲げず、賞金イベントを
-- この口座から**足す**。原資は運営利益からの帳簿上の移動のみ(現物ウォレットは1つ・
-- オンチェーン移動なし)。ユーザーには残高・予算を見せない(イベント単位の当選発表のみ)。
--
-- 移動の承認は admin_fund_grants と同じ閾値思想(Decision 089):
--   ≤1,000 USDT = 1名の FINANCE_ADMIN/SUPER_ADMIN で即時(監査ログ必須)
--   それ超      = 二重承認(申請者≠承認者)
-- 上限値は packages/ledger/src/admin.ts の SINGLE_APPROVAL_ADJUSTMENT_LIMIT_USDT と一致。

insert into ledger_accounts (owner_type, owner_id, account_type, currency)
values ('PLATFORM', null, 'PLATFORM_MARKETING_BUDGET', 'USDT');

create table marketing_budget_transfers (
  id uuid primary key default gen_random_uuid(),
  -- FUND = 運営利益→広告費 / RETURN = 広告費→運営利益(戻し)
  direction text not null check (direction in ('FUND', 'RETURN')),
  amount numeric(20, 8) not null check (amount > 0),
  reason text not null,
  requested_by uuid not null references users (id),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'CANCELLED')),
  approved_by uuid references users (id),
  ledger_transaction_id uuid references ledger_transactions (id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  constraint marketing_transfers_distinct_approver
    check (approved_by is null or approved_by <> requested_by or amount <= 1000)
);

create index idx_marketing_transfers_status on marketing_budget_transfers (status, created_at desc);
