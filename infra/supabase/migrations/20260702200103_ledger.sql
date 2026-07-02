-- Migration 03: ledger — the single source of truth (01_CONSTITUTION.md, 06_DATABASE.md)
--
-- Rules enforced at DB level:
--   * double-entry: per posted transaction, debit total == credit total (deferred trigger)
--   * posted transactions and entries are immutable (no UPDATE/DELETE)
--   * amounts are positive NUMERIC(20,8)
--   * derived balances kept in ledger_account_balances (cache; source of truth = entries)
--   * non-clearing accounts can never go negative (deferred trigger)

create table ledger_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_type account_owner_type not null,
  owner_id uuid references users (id),
  account_type account_type not null,
  currency text not null default 'USDT',
  created_at timestamptz not null default now(),
  constraint ledger_accounts_owner_shape check (
    (owner_type = 'USER' and owner_id is not null
      and account_type in ('USER_AVAILABLE', 'USER_LOCKED'))
    or
    (owner_type = 'PLATFORM' and owner_id is null
      and account_type not in ('USER_AVAILABLE', 'USER_LOCKED'))
  )
);

create unique index uq_ledger_accounts_user
  on ledger_accounts (owner_id, account_type, currency)
  where owner_type = 'USER';

create unique index uq_ledger_accounts_platform
  on ledger_accounts (account_type, currency)
  where owner_type = 'PLATFORM';

create table ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_type transaction_type not null,
  idempotency_key text not null unique,
  reference_type text,
  reference_id uuid,
  status ledger_transaction_status not null default 'POSTED',
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table ledger_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references ledger_transactions (id),
  account_id uuid not null references ledger_accounts (id),
  direction entry_direction not null,
  amount numeric(20, 8) not null check (amount > 0),
  currency text not null default 'USDT',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Immutability: posted ledger records can never be updated or deleted.
-- ---------------------------------------------------------------------------

create or replace function forbid_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'LEDGER_IMMUTABLE: % on % is forbidden', tg_op, tg_table_name;
end;
$$;

create trigger trg_ledger_transactions_immutable
before update or delete on ledger_transactions
for each row execute function forbid_ledger_mutation();

create trigger trg_ledger_entries_immutable
before update or delete on ledger_entries
for each row execute function forbid_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Double-entry balance check, deferred to transaction commit.
-- ---------------------------------------------------------------------------

create or replace function assert_ledger_transaction_balanced()
returns trigger
language plpgsql
as $$
declare
  debit_total numeric(20, 8);
  credit_total numeric(20, 8);
  entry_count int;
begin
  select
    coalesce(sum(amount) filter (where direction = 'DEBIT'), 0),
    coalesce(sum(amount) filter (where direction = 'CREDIT'), 0),
    count(*)
  into debit_total, credit_total, entry_count
  from ledger_entries
  where transaction_id = new.transaction_id;

  if entry_count < 2 then
    raise exception 'LEDGER_UNBALANCED: transaction % has fewer than 2 entries', new.transaction_id;
  end if;
  if debit_total <> credit_total then
    raise exception 'LEDGER_UNBALANCED: transaction % debit % <> credit %',
      new.transaction_id, debit_total, credit_total;
  end if;
  return null;
end;
$$;

create constraint trigger trg_ledger_balanced
after insert on ledger_entries
deferrable initially deferred
for each row execute function assert_ledger_transaction_balanced();

-- ---------------------------------------------------------------------------
-- Derived balances. Convention: balance = credits - debits for every account.
-- Clearing accounts interface with the outside world and may be negative;
-- all other accounts must be >= 0 at commit time.
-- ---------------------------------------------------------------------------

create table ledger_account_balances (
  account_id uuid primary key references ledger_accounts (id),
  balance numeric(20, 8) not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function apply_ledger_entry_to_balance()
returns trigger
language plpgsql
as $$
declare
  delta numeric(20, 8);
begin
  delta := case new.direction when 'CREDIT' then new.amount else -new.amount end;
  insert into ledger_account_balances (account_id, balance, updated_at)
  values (new.account_id, delta, now())
  on conflict (account_id)
  do update set balance = ledger_account_balances.balance + excluded.balance,
                updated_at = now();
  return null;
end;
$$;

create trigger trg_ledger_entry_balance
after insert on ledger_entries
for each row execute function apply_ledger_entry_to_balance();

create or replace function assert_no_negative_balance()
returns trigger
language plpgsql
as $$
declare
  acct_type account_type;
  current_balance numeric(20, 8);
begin
  select a.account_type, b.balance
  into acct_type, current_balance
  from ledger_accounts a
  join ledger_account_balances b on b.account_id = a.id
  where a.id = new.account_id;

  if acct_type not in (
    'PLATFORM_SETTLEMENT_CLEARING',
    'PLATFORM_DEPOSIT_CLEARING',
    'PLATFORM_WITHDRAWAL_CLEARING'
  ) and current_balance < 0 then
    raise exception 'NEGATIVE_BALANCE_FORBIDDEN: account % (%) balance %',
      new.account_id, acct_type, current_balance;
  end if;
  return null;
end;
$$;

create constraint trigger trg_no_negative_balance
after insert on ledger_entries
deferrable initially deferred
for each row execute function assert_no_negative_balance();

-- Balance cache is system-maintained only; direct tampering is forbidden.
-- (Writes happen via the SECURITY DEFINER-free internal trigger above, which
-- runs as the inserting role; service role is the only writer of entries.)
