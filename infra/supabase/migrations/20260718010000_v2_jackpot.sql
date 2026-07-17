-- FUN overhaul V2 — weekly jackpot (Decision 106/108), phase V2実装-5.
--
-- 週 = 月曜MORNING〜日曜NIGHTのレースサイクル(MYT・Decision 108)。チケット =
-- その週のサイクルへ帰属する調教確定(training_sessions の (effective_race_date, slot))。
-- 抽選はレースと同じ commit-reveal(randomness_commits reference_type='JACKPOT')。
-- 原資は PLATFORM_MARKETING_BUDGET のみ(残高が構造上の上限・Decision 106)。
-- 原資不足の週は中止(CANCELLED_BUDGET)・チケット0の週は不成立(VOID_NO_TICKETS)・
-- 賞金の繰越はしない(Decision 108)。
--
-- V1不変: 抽選行の作成・解決はアクティブエンジンがv2のバッチだけが行う
-- (アプリ側ゲート)。本マイグレーションは追加のみで既存の挙動を変えない。
--
-- JACKPOT_PAYOUT: 払い出し専用の新txタイプ。ALTER TYPE の新値は同一トランザクション
-- のDMLで使えない制約があるが、本ファイルのDML(system_settings)は当該値を使わない
-- (BUYBACK_RESERVE_BACKSTOP と同じ前例)。

alter type transaction_type add value if not exists 'JACKPOT_PAYOUT';

-- 抽選(週1行)。作成時にコミット済み・解決(日曜NIGHTバッチ)で終端状態へ。
create table jackpot_draws (
  id uuid primary key default gen_random_uuid(),
  week_start_date date not null unique,  -- 月曜(MYT)
  week_end_date date not null,           -- 日曜(MYT)
  seed_commit_id uuid not null references randomness_commits (id),
  status text not null default 'COMMITTED'
    check (status in ('COMMITTED', 'PAID', 'VOID_NO_TICKETS', 'CANCELLED_BUDGET', 'SKIPPED_DISABLED')),
  -- 解決フェーズ1で凍結する実効パラメータ(当選者1名あたりの賞金)。
  prize_amount numeric(20, 8) check (prize_amount is null or prize_amount > 0),
  winners_target int not null default 1 check (winners_target >= 1),
  total_tickets int check (total_tickets is null or total_tickets >= 0),
  resolved_batch_run_id uuid references batch_runs (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (week_end_date = week_start_date + 6)
);

-- 不変ガード: 週の同定・コミット参照は常に凍結。resolved_at が入ったら行全体が凍結。
create or replace function guard_jackpot_draw_update()
returns trigger
language plpgsql
as $$
begin
  if old.resolved_at is not null then
    raise exception 'JACKPOT_DRAW_IMMUTABLE: draw % is resolved and frozen', old.id;
  end if;
  if new.id is distinct from old.id
  or new.week_start_date is distinct from old.week_start_date
  or new.week_end_date is distinct from old.week_end_date
  or new.seed_commit_id is distinct from old.seed_commit_id
  or new.created_at is distinct from old.created_at then
    raise exception 'JACKPOT_DRAW_IMMUTABLE: identity fields cannot change (draw %)', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_jackpot_draw_guard
before update on jackpot_draws
for each row execute function guard_jackpot_draw_update();

create trigger trg_jackpot_draw_no_delete
before delete on jackpot_draws
for each row execute function forbid_delete();

-- 当選記録(検証用に当選チケット番号も保存)。挿入のみ・更新/削除不可。
create table jackpot_winners (
  draw_id uuid not null references jackpot_draws (id),
  user_id uuid not null references users (id),
  ticket_index int not null check (ticket_index >= 0),
  amount numeric(20, 8) not null check (amount > 0),
  ledger_transaction_id uuid references ledger_transactions (id),
  created_at timestamptz not null default now(),
  primary key (draw_id, user_id)
);

create or replace function forbid_update_immutable_record()
returns trigger
language plpgsql
as $$
begin
  raise exception 'IMMUTABLE_RECORD: % rows cannot be updated', tg_table_name;
end;
$$;

create trigger trg_jackpot_winners_no_update
before update on jackpot_winners
for each row execute function forbid_update_immutable_record();

create trigger trg_jackpot_winners_no_delete
before delete on jackpot_winners
for each row execute function forbid_delete();

-- シードエスクロー(race_seed_escrow と同型・サービス専用)。reveal は
-- randomness_commits 側のガードが SHA-256 検証を強制する。
create table jackpot_seed_escrow (
  draw_id uuid primary key references jackpot_draws (id),
  seed text not null,
  created_at timestamptz not null default now()
);

-- すべてサービス専用(RLS有効・ポリシーなし)。ユーザー向け表示は -7 のAPI経由。
alter table jackpot_draws enable row level security;
alter table jackpot_winners enable row level security;
alter table jackpot_seed_escrow enable row level security;

-- 実行時設定(Decision 106「実行時設定可能」)。enabled は既定 false —
-- 有効化は広告費口座残高と整合させてからの運用判断(§7-5)。prize_usdt は1名あたり。
insert into system_settings (key, value)
values ('jackpot', jsonb_build_object('enabled', false, 'prize_usdt', '100.00', 'winners', 1))
on conflict (key) do nothing;
