-- Migration 20: Row Level Security (06_DATABASE.md RLS Policy Direction)
--
-- Direction:
--   * RLS enabled on ALL tables.
--   * authenticated users: SELECT only their own rows on private tables.
--   * race/market/policy data: transparent read for authenticated users
--     (needed for replay verification and market display).
--   * NO insert/update/delete policies for authenticated — all writes go
--     through Cloud Run / trusted server-side using the service role
--     (which bypasses RLS). Users can never mutate financial tables.
--   * admin/system tables have no authenticated policies at all.

-- Enable RLS everywhere.
alter table users enable row level security;
alter table admin_role_grants enable row level security;
alter table ledger_accounts enable row level security;
alter table ledger_transactions enable row level security;
alter table ledger_entries enable row level security;
alter table ledger_account_balances enable row level security;
alter table blockchain_deposits enable row level security;
alter table deposit_addresses enable row level security;
alter table blockchain_withdrawals enable row level security;
alter table horses enable row level security;
alter table randomness_commits enable row level security;
alter table races enable row level security;
alter table race_participant_snapshots enable row level security;
alter table race_results enable row level security;
alter table horse_burns enable row level security;
alter table training_sessions enable row level security;
alter table revenge_buffs enable row level security;
alter table purchase_sessions enable row level security;
alter table market_listings enable row level security;
alter table ownership_assignments enable row level security;
alter table buyback_schedules enable row level security;
alter table buyback_schedule_payments enable row level security;
alter table memorial_nfts enable row level security;
alter table liquidity_policies enable row level security;
alter table reserve_policies enable row level security;
alter table buff_policies enable row level security;
alter table price_tables enable row level security;
alter table assignment_algorithm_versions enable row level security;
alter table race_engine_versions enable row level security;
alter table economy_policies enable row level security;
alter table horse_generation_versions enable row level security;
alter table economy_status_evaluations enable row level security;
alter table batch_runs enable row level security;
alter table batch_steps enable row level security;
alter table marketplace_status enable row level security;
alter table recovery_snapshots enable row level security;
alter table recovery_logs enable row level security;
alter table audit_logs enable row level security;
alter table notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Own-row read policies
-- ---------------------------------------------------------------------------

create policy sel_own_user on users
  for select to authenticated using (id = auth.uid());

create policy sel_own_ledger_accounts on ledger_accounts
  for select to authenticated using (owner_type = 'USER' and owner_id = auth.uid());

create policy sel_own_ledger_entries on ledger_entries
  for select to authenticated using (
    exists (
      select 1 from ledger_accounts a
      where a.id = ledger_entries.account_id
        and a.owner_type = 'USER'
        and a.owner_id = auth.uid()
    )
  );

create policy sel_own_balances on ledger_account_balances
  for select to authenticated using (
    exists (
      select 1 from ledger_accounts a
      where a.id = ledger_account_balances.account_id
        and a.owner_type = 'USER'
        and a.owner_id = auth.uid()
    )
  );

create policy sel_own_deposits on blockchain_deposits
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_deposit_addresses on deposit_addresses
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_withdrawals on blockchain_withdrawals
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_horses on horses
  for select to authenticated using (owner_user_id = auth.uid());

create policy sel_own_training on training_sessions
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_buffs on revenge_buffs
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_purchase_sessions on purchase_sessions
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_assignments on ownership_assignments
  for select to authenticated using (
    buyer_user_id = auth.uid() or seller_user_id = auth.uid()
  );

create policy sel_own_buyback_schedules on buyback_schedules
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_buyback_payments on buyback_schedule_payments
  for select to authenticated using (
    exists (
      select 1 from buyback_schedules s
      where s.id = buyback_schedule_payments.buyback_schedule_id
        and s.user_id = auth.uid()
    )
  );

create policy sel_own_memorials on memorial_nfts
  for select to authenticated using (user_id = auth.uid());

create policy sel_own_notifications on notifications
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Transparent read (race verification / market / policies)
-- ---------------------------------------------------------------------------

create policy sel_all_races on races
  for select to authenticated using (true);

create policy sel_all_randomness on randomness_commits
  for select to authenticated using (true);

create policy sel_all_snapshots on race_participant_snapshots
  for select to authenticated using (true);

create policy sel_all_results on race_results
  for select to authenticated using (true);

create policy sel_all_burns on horse_burns
  for select to authenticated using (true);

create policy sel_all_listings on market_listings
  for select to authenticated using (true);

create policy sel_all_marketplace_status on marketplace_status
  for select to authenticated using (true);

create policy sel_all_liquidity_policies on liquidity_policies
  for select to authenticated using (true);
create policy sel_all_reserve_policies on reserve_policies
  for select to authenticated using (true);
create policy sel_all_buff_policies on buff_policies
  for select to authenticated using (true);
create policy sel_all_price_tables on price_tables
  for select to authenticated using (true);
create policy sel_all_assignment_algorithm_versions on assignment_algorithm_versions
  for select to authenticated using (true);
create policy sel_all_race_engine_versions on race_engine_versions
  for select to authenticated using (true);
create policy sel_all_horse_generation_versions on horse_generation_versions
  for select to authenticated using (true);

-- economy_policies / economy_status_evaluations / batch / recovery / audit /
-- admin_role_grants: NO authenticated policies — service role & admin APIs only.

-- Note on reveal secrecy: randomness_commits.reveal_seed is NULL until the
-- race completes (Step 9 reveal). Rows are visible for verification, and the
-- seed value only exists after reveal, so pre-race seed leakage is impossible.
