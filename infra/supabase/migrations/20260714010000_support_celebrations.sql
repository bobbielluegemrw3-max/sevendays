-- Decision 092: サポートボーナスは「チャンピオン誕生時のお祝い金」に変更。
--
-- 変更点はトリガーのみ:
--   財源(不変): ミント時のRESERVE_ALLOCATION 5.40/頭 + BURN馬のアイテム代
--               (ITEM_SUPPORT_FUNDING)が PLATFORM_MLM_RESERVE(=サポートプール)へ
--   支払い(新): BURN時の直接分配を廃止し、組織内でチャンピオン(7日間走破)が
--               誕生した時に、その持ち主の上位7ティアへ計10 USDT(3/2/1×5)を
--               プールから支払う。プール残高が上限(不足分は本テーブルで繰越
--               =FIFOで残高回復後に支払い)。
--
-- 本テーブルは1チャンピオン×1ティア=1行の支払いキュー。
--   PENDING   → 支払い待ち(プール不足時はこのまま繰越)
--   PAID      → 支払い済み(最終・ledger_transaction_id必須)
--   UNCLAIMED → 支払い先なし(該当ティアの祖先が不在/非ACTIVE/ティア未解放。
--               最終。資金はプールに残る — 旧設計の「未達分は準備金滞留」と同じ)

create table support_celebrations (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses (id),
  champion_user_id uuid not null references users (id),
  tier int not null check (tier between 1 and 7),
  amount numeric(20, 8) not null check (amount > 0),
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID', 'UNCLAIMED')),
  beneficiary_user_id uuid references users (id),
  champion_date date not null,
  ledger_transaction_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint uq_support_celebration unique (horse_id, tier),
  -- PAIDは受取人と台帳txが必須
  constraint chk_paid_fields check (
    status <> 'PAID' or (beneficiary_user_id is not null and ledger_transaction_id is not null)
  )
);

-- FIFO順の支払い走査用
create index idx_support_celebrations_pending
  on support_celebrations (champion_date, created_at, horse_id, tier)
  where status = 'PENDING';

-- PAID/UNCLAIMEDは最終(buyback_schedule_paymentsと同じ最終性ガード)
create or replace function guard_support_celebration_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('PAID', 'UNCLAIMED') then
    raise exception 'SETTLED_CELEBRATION_IMMUTABLE: celebration % is % and cannot change', old.id, old.status;
  end if;
  if new.horse_id is distinct from old.horse_id
     or new.champion_user_id is distinct from old.champion_user_id
     or new.tier is distinct from old.tier
     or new.amount is distinct from old.amount
     or new.champion_date is distinct from old.champion_date then
    raise exception 'CELEBRATION_IDENTITY_IMMUTABLE: celebration % identity fields cannot change', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_guard_support_celebration_update
before update on support_celebrations
for each row execute function guard_support_celebration_update();

create or replace function guard_support_celebration_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'CELEBRATION_DELETE_FORBIDDEN: celebrations cannot be deleted';
end;
$$;

create trigger trg_guard_support_celebration_delete
before delete on support_celebrations
for each row execute function guard_support_celebration_delete();
