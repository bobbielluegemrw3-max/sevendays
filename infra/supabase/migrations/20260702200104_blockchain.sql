-- Migration 04: blockchain deposits / withdrawals (06_DATABASE.md, 07_API.md, Decision 048)

create table blockchain_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  chain_id text not null,
  token_contract text not null,
  tx_hash text not null,
  from_address text not null,
  to_address text not null,
  amount numeric(20, 8) not null check (amount > 0),
  confirmation_count int not null default 0 check (confirmation_count >= 0),
  status deposit_status not null default 'DETECTED',
  ledger_transaction_id uuid references ledger_transactions (id),
  detected_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  -- duplicate tx_hash rejected (unique per chain)
  constraint uq_deposit_chain_tx unique (chain_id, tx_hash),
  -- credited deposits must have the BLOCKCHAIN_DEPOSIT_CONFIRMATION ledger transaction
  constraint deposits_credit_requires_ledger check (
    status <> 'CREDITED' or ledger_transaction_id is not null
  )
);

-- Per-user HD wallet deposit addresses (Decision 048). Address derivation
-- happens in Cloud Run; the master seed lives ONLY in Secret Manager.
create table deposit_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  chain_id text not null,
  address text not null,
  derivation_index bigint not null check (derivation_index >= 0),
  created_at timestamptz not null default now(),
  constraint uq_deposit_address unique (chain_id, address),
  constraint uq_deposit_user_chain unique (user_id, chain_id),
  constraint uq_deposit_derivation unique (chain_id, derivation_index)
);

create table blockchain_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  chain_id text not null,
  token_contract text not null,
  to_address text not null,
  requested_amount numeric(20, 8) not null check (requested_amount > 0),
  network_fee_amount numeric(20, 8) not null default 0 check (network_fee_amount >= 0),
  net_amount numeric(20, 8) not null check (net_amount > 0),
  status withdrawal_status not null default 'REQUESTED',
  ledger_transaction_id uuid references ledger_transactions (id),
  tx_hash text,
  requested_at timestamptz not null default now(),
  broadcast_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint withdrawals_net check (net_amount = requested_amount - network_fee_amount)
);

-- tx_hash unique per chain when present
create unique index uq_withdrawal_chain_tx
  on blockchain_withdrawals (chain_id, tx_hash)
  where tx_hash is not null;

-- Withdrawal funds must be locked through Ledger BEFORE broadcast
-- (01_CONSTITUTION.md). Enforced at status transition.
create or replace function assert_withdrawal_locked_before_broadcast()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('BROADCAST', 'CONFIRMED')
     and new.ledger_transaction_id is null then
    raise exception 'WITHDRAWAL_NOT_LOCKED: ledger fund lock required before broadcast (withdrawal %)', new.id;
  end if;
  return new;
end;
$$;

create trigger trg_withdrawal_lock_before_broadcast
before insert or update of status on blockchain_withdrawals
for each row execute function assert_withdrawal_locked_before_broadcast();
