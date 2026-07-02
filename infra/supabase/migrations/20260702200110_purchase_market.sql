-- Migration 10: purchase_sessions, market_listings
-- (06_DATABASE.md, 05_SETTLEMENT_ENGINE.md, Decisions 043/051)

create table purchase_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  status purchase_session_status not null default 'PENDING_ASSIGNMENT',
  locked_amount numeric(20, 8) not null check (locked_amount > 0),
  assigned_price numeric(20, 8) check (assigned_price > 0),
  refund_amount numeric(20, 8) check (refund_amount >= 0),
  funds_locked boolean not null default false,
  idempotency_key text not null unique,
  batch_run_id uuid,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  settled_at timestamptz
);

-- Max 10 concurrent sessions per user (Decision 051) is enforced in the
-- application inside a transaction; a DB-level count constraint would need
-- serializable isolation. The partial index below supports that check.
create index idx_purchase_sessions_user_pending
  on purchase_sessions (user_id)
  where status = 'PENDING_ASSIGNMENT';

create table market_listings (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses (id),
  seller_user_id uuid not null references users (id),
  status listing_status not null default 'LISTED',
  listed_at timestamptz not null default now(),
  listing_price numeric(20, 8) not null check (listing_price > 0),
  current_day int not null check (current_day between 1 and 6),
  batch_run_id uuid not null,
  deterministic_market_tiebreak_score numeric(30, 20) not null,
  created_at timestamptz not null default now()
);

-- A horse can have at most one live listing.
create unique index uq_market_listing_live
  on market_listings (horse_id)
  where status = 'LISTED';
