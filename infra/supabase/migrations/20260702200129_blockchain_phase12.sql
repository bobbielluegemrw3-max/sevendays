-- Migration 29: Phase 12 blockchain integration support
-- (07_API.md Deposit/Withdrawal v1.0, 01_CONSTITUTION.md Deposit and Withdrawal Rules)

-- Per-chain scan cursor for the deposit watcher. Service-only (RLS enabled,
-- no policies), like race_seed_escrow.
create table chain_scan_cursors (
  chain_id text primary key,
  last_scanned_block bigint not null check (last_scanned_block >= 0),
  updated_at timestamptz not null default now()
);

alter table chain_scan_cursors enable row level security;

-- Block height of the deposit transaction, set at detection. Confirmation
-- counting is (latest block - block_number + 1); rows detected before this
-- migration (none in production) would need a backfill.
alter table blockchain_deposits
  add column block_number bigint check (block_number > 0);

-- Signed raw transaction persisted BEFORE broadcast so a crash between
-- persist and send can only ever re-send the SAME transaction (same nonce,
-- same hash) — double-spend by re-signing is structurally impossible.
alter table blockchain_withdrawals
  add column raw_tx text;

-- Set when an admin approves an ADMIN_REVIEW withdrawal; routing skips
-- already-approved rows so approval is terminal (no re-review loop).
alter table blockchain_withdrawals
  add column review_approved_at timestamptz;

-- A broadcast row must carry the transaction identity that was persisted
-- before the send (complements trg_withdrawal_lock_before_broadcast).
alter table blockchain_withdrawals
  add constraint withdrawals_broadcast_requires_tx check (
    status not in ('BROADCAST', 'CONFIRMED') or (tx_hash is not null and raw_tx is not null)
  );
