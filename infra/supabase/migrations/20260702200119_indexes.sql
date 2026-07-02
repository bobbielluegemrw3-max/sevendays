-- Migration 19: indexes (06_DATABASE.md Index Policy)
-- Required: user_id, horse_id, race_id, batch_run_id, status, created_at,
-- idempotency_key, reference_type + reference_id.
-- (idempotency_key columns already have UNIQUE indexes.)

-- ledger
create index idx_ledger_accounts_owner on ledger_accounts (owner_id) where owner_id is not null;
create index idx_ledger_transactions_reference on ledger_transactions (reference_type, reference_id);
create index idx_ledger_transactions_type_created on ledger_transactions (transaction_type, created_at);
create index idx_ledger_entries_transaction on ledger_entries (transaction_id);
create index idx_ledger_entries_account_created on ledger_entries (account_id, created_at);

-- blockchain
create index idx_deposits_user on blockchain_deposits (user_id, created_at);
create index idx_deposits_status on blockchain_deposits (status);
create index idx_withdrawals_user on blockchain_withdrawals (user_id, created_at);
create index idx_withdrawals_status on blockchain_withdrawals (status);

-- horses
create index idx_horses_owner on horses (owner_user_id);
create index idx_horses_status_day on horses (status, current_day);
create index idx_horses_last_listed on horses (last_listed_at nulls first) where status = 'ACTIVE';

-- races
create index idx_races_batch on races (batch_run_id);
create index idx_races_status on races (status);
create index idx_snapshots_race on race_participant_snapshots (race_id);
create index idx_snapshots_horse on race_participant_snapshots (horse_id);
create index idx_snapshots_owner on race_participant_snapshots (owner_user_id);
create index idx_race_results_race_rank on race_results (race_id, final_rank);
create index idx_race_results_horse on race_results (horse_id);

-- burn
create index idx_horse_burns_race on horse_burns (race_id);
create index idx_horse_burns_owner on horse_burns (owner_user_id_at_snapshot);

-- training
create index idx_training_user on training_sessions (user_id);
create index idx_training_effective_date on training_sessions (effective_race_date);

-- revenge buffs
create index idx_buffs_user_status on revenge_buffs (user_id, status);

-- purchase / market
create index idx_purchase_sessions_status on purchase_sessions (status);
create index idx_purchase_sessions_user on purchase_sessions (user_id);
create index idx_purchase_sessions_created on purchase_sessions (created_at);
create index idx_purchase_sessions_batch on purchase_sessions (batch_run_id) where batch_run_id is not null;
create index idx_listings_status_listed on market_listings (status, listed_at);
create index idx_listings_seller on market_listings (seller_user_id);
create index idx_listings_batch on market_listings (batch_run_id);

-- assignments
create index idx_assignments_batch on ownership_assignments (batch_run_id);
create index idx_assignments_buyer on ownership_assignments (buyer_user_id);
create index idx_assignments_seller on ownership_assignments (seller_user_id) where seller_user_id is not null;
create index idx_assignments_horse on ownership_assignments (horse_id);
create index idx_assignments_status on ownership_assignments (status);

-- buyback
create index idx_buyback_schedules_user on buyback_schedules (user_id);
create index idx_buyback_schedules_status on buyback_schedules (status);
create index idx_buyback_payments_due on buyback_schedule_payments (status, due_date);
create index idx_buyback_payments_schedule on buyback_schedule_payments (buyback_schedule_id);

-- nft
create index idx_memorial_user on memorial_nfts (user_id);

-- batch
create index idx_batch_steps_run on batch_steps (batch_run_id, step_number);
create index idx_batch_steps_status on batch_steps (status);
create index idx_batch_runs_status on batch_runs (status);

-- recovery / audit
create index idx_recovery_snapshots_batch on recovery_snapshots (batch_run_id);
create index idx_recovery_logs_batch on recovery_logs (batch_run_id, created_at);
create index idx_audit_logs_reference on audit_logs (reference_type, reference_id);
create index idx_audit_logs_actor on audit_logs (actor_type, actor_id, created_at);
create index idx_audit_logs_created on audit_logs (created_at);

-- notifications
create index idx_notifications_user_created on notifications (user_id, created_at desc);
create index idx_notifications_unread on notifications (user_id) where read_at is null;
