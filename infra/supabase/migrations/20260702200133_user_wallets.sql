-- Migration 33: wallet <-> account linking (Decision 072)
--
-- A wallet address maps to exactly ONE game account. Two ways a row
-- appears:
--   * a Web3-first login provisions its own account and records its wallet
--   * an existing (Google/email) account links a wallet by signing a
--     server-verified message
-- Login-time aliasing: a Supabase Web3 session whose auth uid has no own
-- users row resolves through this table to the linked game account.

create table user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  wallet_address text not null,
  created_at timestamptz not null default now(),
  -- one game account per wallet, stored lowercased for lookups
  constraint uq_user_wallet_address unique (wallet_address),
  constraint wallet_address_lowercase check (wallet_address = lower(wallet_address))
);

create index idx_user_wallets_user on user_wallets (user_id);

alter table user_wallets enable row level security;
create policy sel_own_wallets on user_wallets
  for select to authenticated using (user_id = auth.uid());
