-- Migration 01: extensions and enums (06_DATABASE.md Migration Order step 1)

create extension if not exists pgcrypto;

-- users
create type user_status as enum ('ACTIVE', 'SUSPENDED', 'BANNED', 'DELETED');

-- horses (03_GAME_DESIGN.md)
create type horse_type as enum ('SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK');
create type rarity as enum ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');
create type horse_status as enum ('ACTIVE', 'BURNED', 'DAY7_CLEARED', 'MEMORIALIZED');

-- economy (04_ECONOMY_ENGINE.md)
create type economy_status as enum ('NORMAL', 'WATCH', 'WINTER', 'EMERGENCY');
create type marketplace_state as enum ('OPEN', 'MARKET_LOCKED', 'MAINTENANCE');

-- training (03_GAME_DESIGN.md)
create type training_type as enum ('SPEED_TRAINING', 'POWER_TRAINING', 'RECOVERY_TRAINING');

-- revenge buff (03_GAME_DESIGN.md)
create type buff_rarity as enum ('N', 'R', 'SR');
create type buff_status as enum ('ACTIVE', 'CONSUMED');

-- weather / track (Decision 039; track state names are draft P1 pending owner confirmation)
create type weather as enum ('SUNNY', 'RAIN', 'CLOUDY', 'STORM');
create type track_condition as enum ('FAST', 'GOOD', 'SOFT', 'HEAVY');

-- purchase (05_SETTLEMENT_ENGINE.md, Decisions 043)
create type purchase_session_status as enum (
  'PENDING_ASSIGNMENT', 'ASSIGNED', 'REFUNDED', 'CANCELLED', 'EXPIRED'
);

-- market / assignment
create type listing_status as enum ('LISTED', 'ASSIGNED', 'UNASSIGNED');
create type assignment_status as enum ('PENDING', 'SETTLED', 'FAILED');

-- batch (05_SETTLEMENT_ENGINE.md)
create type batch_status as enum ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL_FAILED');
create type batch_step_status as enum ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- races
create type race_status as enum ('CREATED', 'SEED_COMMITTED', 'COMPLETED', 'FINALIZED');

-- ledger (06_DATABASE.md)
create type account_owner_type as enum ('USER', 'PLATFORM');
create type account_type as enum (
  'USER_AVAILABLE',
  'USER_LOCKED',
  'PLATFORM_MINT_REVENUE',
  'PLATFORM_BUYBACK_RESERVE',
  'PLATFORM_MLM_RESERVE',
  'PLATFORM_OPERATING_RESERVE',
  'PLATFORM_EMERGENCY_RESERVE',
  'PLATFORM_SETTLEMENT_CLEARING',
  'PLATFORM_DEPOSIT_CLEARING',
  'PLATFORM_WITHDRAWAL_CLEARING'
);
create type entry_direction as enum ('DEBIT', 'CREDIT');
create type ledger_transaction_status as enum ('POSTED', 'REVERSED');
create type transaction_type as enum (
  'RESERVE_ALLOCATION',
  'BLOCKCHAIN_DEPOSIT_CONFIRMATION',
  'PURCHASE_FUND_LOCK',
  'PURCHASE_REFUND',
  'ASSIGNMENT_SETTLEMENT',
  'DAY0_MINT_SETTLEMENT',
  'BUYBACK_PAYMENT',
  'MLM_REWARD_PAYMENT',
  'WITHDRAWAL_FUND_LOCK',
  'WITHDRAWAL_BROADCAST',
  'WITHDRAWAL_CONFIRMATION',
  'WITHDRAWAL_REJECTION_REFUND',
  'ADMIN_ADJUSTMENT'
);

-- blockchain (07_API.md)
create type deposit_status as enum ('DETECTED', 'CONFIRMED', 'CREDITED', 'REJECTED');
create type withdrawal_status as enum (
  'REQUESTED', 'LOCKED', 'ADMIN_REVIEW', 'BROADCAST', 'CONFIRMED', 'FAILED', 'REJECTED'
);

-- buyback (05_SETTLEMENT_ENGINE.md)
create type buyback_status as enum ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED');
create type buyback_payment_status as enum ('SCHEDULED', 'PAID', 'FAILED');

-- recovery / admin (05_SETTLEMENT_ENGINE.md)
create type recovery_approval_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type admin_role as enum ('FINANCE_ADMIN', 'SUPER_ADMIN');
create type actor_type as enum ('USER', 'ADMIN', 'SYSTEM');
