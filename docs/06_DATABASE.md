# 06 Database

## Scope

This document defines table purpose, required columns, constraints, indexes, RLS direction, and immutability rules. Full DDL is not required in this architecture document. Claude Code SHALL generate migrations from this specification.

Database engine: Supabase PostgreSQL.

General rules:

- UUID primary keys.
- UTC timestamps.
- NUMERIC(20,8) for money.
- Financial tables are immutable after posting.
- RLS enabled for user-facing access.
- Service role only in Cloud Run or trusted server-side environments.

## Core Tables

### users

Purpose: user identity, referral, and status.

Main columns: id, email, status, direct_referrer_user_id, created_at.

Constraints:

- status in ACTIVE, SUSPENDED, BANNED, DELETED.
- referral cycle detection at registration/binding time.

### ledger_accounts

Purpose: account definitions.

Main columns: id, owner_type, owner_id, account_type, currency, created_at.

Account types:

- USER_AVAILABLE
- USER_LOCKED
- PLATFORM_MINT_REVENUE
- PLATFORM_BUYBACK_RESERVE
- PLATFORM_MLM_RESERVE
- PLATFORM_OPERATING_RESERVE
- PLATFORM_EMERGENCY_RESERVE
- PLATFORM_SETTLEMENT_CLEARING
- PLATFORM_DEPOSIT_CLEARING
- PLATFORM_WITHDRAWAL_CLEARING

### ledger_transactions

Purpose: immutable transaction header.

Main columns: id, transaction_type, idempotency_key, reference_type, reference_id, status, posted_at, created_at.

Constraints:

- idempotency_key unique where applicable.
- posted records immutable.

### ledger_entries

Purpose: double-entry debit/credit lines.

Main columns: id, transaction_id, account_id, direction, amount, currency, created_at.

Constraints:

- debit total must equal credit total per posted transaction.
- no direct balance mutation outside ledger service.

### blockchain_deposits

Purpose: blockchain deposit detection and confirmation.

Main columns: id, user_id, chain_id, token_contract, tx_hash, from_address, to_address, amount, confirmation_count, status, ledger_transaction_id, detected_at, confirmed_at, created_at.

Constraints:

- unique(chain_id, tx_hash).
- confirmed deposits must have BLOCKCHAIN_DEPOSIT_CONFIRMATION ledger transaction.

### blockchain_withdrawals

Purpose: withdrawal request, fund lock, broadcast, and confirmation.

Main columns: id, user_id, chain_id, token_contract, to_address, requested_amount, network_fee_amount, net_amount, status, ledger_transaction_id, tx_hash, requested_at, broadcast_at, confirmed_at, created_at.

Constraints:

- tx_hash unique per chain when present.
- withdrawal funds must be locked through Ledger before broadcast.

### horses

Purpose: horse lifecycle and ownership.

Main columns: id, owner_user_id, status, current_day, horse_type, rarity, dna_hash, dna_modifier, horse_generation_version, mint_seed_hash, ability_json, last_listed_at, created_at.

Constraints:

- Day7 and burned statuses cannot return to P2P.
- horse generation fields are immutable after creation.

### races

Purpose: race metadata.

Main columns: id, batch_run_id, race_engine_version, seed_commit_id, status, participant_count, created_at, completed_at.

### randomness_commits

Purpose: commit-reveal randomness.

Main columns: id, reference_type, reference_id, commit_hash, reveal_seed, created_at, revealed_at.

Constraints:

- unique(reference_type, reference_id).
- race cannot start unless commit exists.
- reveal must verify SHA-256(reveal_seed) == commit_hash.

### race_participant_snapshots

Purpose: immutable race input snapshot.

Main columns: id, race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash, ability_snapshot_json, training_snapshot_json, revenge_buff_snapshot_json, weather, track_condition, race_engine_version, liquidity_policy_version, price_table_version, snapshot_hash, created_at.

Constraints:

- unique(race_id, horse_id).
- immutable after creation.

### training_sessions

Purpose: one-race daily training input.

Main columns: id, horse_id, user_id, training_type, training_date, effective_race_date, created_at, snapshot_included_at.

Constraints:

- unique(horse_id, effective_race_date).
- no edit after snapshot_included_at is set.
- training does not mutate horse ability.

### race_results

Purpose: deterministic result records.

Main columns: id, race_id, horse_id, final_score, deterministic_tiebreak_score, final_rank, is_burned, created_at.

### horse_burns

Purpose: burn event records.

Main columns: id, race_id, horse_id, owner_user_id_at_snapshot, burn_event_id, burn_target_count, burn_policy_version, created_at.

### revenge_buffs

Purpose: user buff state.

Main columns: id, user_id, status, buff_rarity, buff_bonus_score, buff_policy_version, deterministic_buff_roll, generated_at, applied_at, consumed_at, refreshed_at.

Constraints:

- one active/pending/applied buff per user.
- no manual use, transfer, sale, or gift.

### purchase_sessions

Purpose: buyer demand and locked funds.

Main columns: id, user_id, status, locked_amount, assigned_price, refund_amount, funds_locked, created_at, cancelled_at, settled_at.

Indexes: status, user_id, created_at.

### market_listings

Purpose: AI Profit Taking listings.

Main columns: id, horse_id, seller_user_id, status, listed_at, listing_price, current_day, batch_run_id, deterministic_market_tiebreak_score.

### ownership_assignments

Purpose: assignment pair and settlement status.

Main columns: id, batch_run_id, purchase_session_id, market_listing_id, horse_id, buyer_user_id, seller_user_id, assigned_price, status, ledger_transaction_id, created_at.

### buyback_schedules

Purpose: Day7 Buyback plan.

Main columns: id, horse_id, user_id, status, total_amount, payment_count, day7_clear_date, created_at, completed_at.

Constraints:

- one schedule per horse.
- total_amount = 200.
- payment_count = 7.

### buyback_schedule_payments

Purpose: individual Buyback payments.

Main columns: id, buyback_schedule_id, payment_number, due_date, amount, status, ledger_transaction_id, paid_at.

Constraints:

- unique(schedule_id, payment_number).

### memorial_nfts

Purpose: memorial record after Buyback completion.

Main columns: id, horse_id, user_id, buyback_schedule_id, metadata_json, created_at.

Constraints:

- one Memorial NFT per horse.

### policy tables

Required:

- liquidity_policies
- economy_status_evaluations
- reserve_policies
- buff_policies
- price_tables
- assignment_algorithm_versions
- race_engine_versions

Policy records are versioned and immutable after activation.

### batch_runs and batch_steps

Purpose: Daily Settlement Batch tracking.

Main columns: id, batch_date, batch_algorithm_version, status, marketplace_locked_at, completed_at, failed_at.

Steps include status, retry count, idempotency key, error code, timestamps.

### recovery_snapshots and recovery_logs

Purpose: Admin Recovery audit.

Main columns: batch_run_id, recovery_reason, approval_status, approved_by_1, approved_by_2, before_snapshot_hash, after_snapshot_hash, created_at.

### audit_logs

Purpose: immutable critical action log.

Main columns: actor_type, actor_id, action, reference_type, reference_id, before_hash, after_hash, created_at.

## Index Policy

Required indexes:

- user_id
- horse_id
- race_id
- batch_run_id
- status
- created_at
- idempotency_key
- reference_type + reference_id

## RLS Policy Direction

User-facing tables:

- RLS enabled.
- Users can read only their own rows.
- Users cannot update financial/system rows directly.

Cloud Run/Admin:

- service role only.
- all writes audited.

## Migration Order

1. enums
2. users
3. ledger
4. blockchain deposit / withdrawal
5. horse
6. race
7. burn
8. training
9. revenge_buff
10. purchase / market
11. assignment
12. buyback
13. nft
14. policy
15. batch
16. recovery
17. audit
18. indexes
19. RLS
20. seed data
