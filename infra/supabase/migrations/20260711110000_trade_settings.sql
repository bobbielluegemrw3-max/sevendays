-- 出品方式の必須選択+自動購入予約(Decision 086)
--
-- user_trade_settings: ユーザーごとの売買自動化設定。
--   行が存在する = ユーザーが出品方式を明示的に選択済み(法務要件: 事前チェック済みの
--   デフォルトは置かない)。行が無いユーザーの馬は Smart出品の対象に決してならない。
--   auto_list      = Smart出品(経済エンジンの利確選定)の対象になるか
--   auto_reserve   = バッチ完了後に自動で購入予約を作るか(auto_list=true が前提)
--   auto_reserve_max = 1晩の自動予約上限(1..10)。null = MAX(残高と枠の許す限り)
-- mail_claims: バッチ後スイープ(売却メール等)の冪等クレーム。claim_key一意で
--   再実行しても1回しか送られない。push_broadcasts と同じ流儀・削除禁止。

create table user_trade_settings (
  user_id uuid primary key references users(id),
  auto_list boolean not null,
  auto_reserve boolean not null default false,
  auto_reserve_max int check (auto_reserve_max between 1 and 10),
  chosen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 自動予約はSmart出品モードとセット(Decision 086)
  constraint chk_auto_reserve_requires_auto_list check (not auto_reserve or auto_list)
);

alter table user_trade_settings enable row level security;

create policy user_trade_settings_own_read on user_trade_settings
  for select using (user_id = auth.uid());

create table mail_claims (
  id uuid primary key default gen_random_uuid(),
  claim_key text not null unique,
  created_at timestamptz not null default now()
);

alter table mail_claims enable row level security;

create trigger trg_mail_claims_no_delete
before delete on mail_claims
for each row execute function forbid_delete();
