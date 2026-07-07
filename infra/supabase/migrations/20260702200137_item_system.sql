-- Item System v1 (Decisions 078/079, ITEM_REVISION.md)
-- Enums are extended here; rows USING the new values live in the next
-- migration file (PG forbids using a fresh enum value in the same tx).

alter type transaction_type add value if not exists 'ITEM_PURCHASE';
alter type transaction_type add value if not exists 'ITEM_SUPPORT_FUNDING';
alter type transaction_type add value if not exists 'ITEM_REVENUE_SETTLEMENT';
alter type account_type add value if not exists 'PLATFORM_ITEM_CLEARING';

-- ---------------------------------------------------------------------------
-- Catalog (operational mirror of domain ITEM_CATALOG_V1; effects/copy live in
-- versioned code — item_policy_v1.0. `active` is the admin kill switch.)
-- ---------------------------------------------------------------------------
create table item_catalog (
  key text primary key,
  name_ja text not null,
  name_en text not null,
  band text not null check (band in ('BASIC', 'STANDARD', 'PREMIUM', 'BURN_DROP')),
  price numeric(20, 8) not null check (price >= 0),
  sellable boolean not null,
  giftable boolean not null default true,
  usable_day_min int,
  usable_day_max int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Inventory: one row per unit. unit_price = the money parked in
-- PLATFORM_ITEM_CLEARING for this unit (0 for burn drops); it travels with
-- the unit through gifts and decides the burn->support / survive->operating
-- settlement regardless of who finally uses it (Decision 078).
-- ---------------------------------------------------------------------------
create table user_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  item_key text not null references item_catalog (key),
  unit_price numeric(20, 8) not null check (unit_price >= 0),
  source text not null check (source in ('PURCHASE', 'BURN_DROP', 'GIFT')),
  -- burn drops are granted once per burn event (idempotent batch retries)
  source_burn_event_id uuid unique,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'APPLIED', 'CONSUMED')),
  acquired_at timestamptz not null default now()
);
create index idx_user_items_available on user_items (user_id, item_key) where status = 'AVAILABLE';

-- ---------------------------------------------------------------------------
-- Usage: apply a unit to a horse for the next race. One item per horse per
-- race (cancel before snapshot returns the unit and frees the slot).
-- ---------------------------------------------------------------------------
create table item_usages (
  id uuid primary key default gen_random_uuid(),
  user_item_id uuid not null references user_items (id),
  horse_id uuid not null references horses (id),
  user_id uuid not null references users (id),
  item_key text not null references item_catalog (key),
  unit_price numeric(20, 8) not null check (unit_price >= 0),
  effective_race_date date not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'CANCELLED', 'SNAPSHOTTED', 'SETTLED')),
  race_id uuid references races (id),
  settled_outcome text check (settled_outcome in ('BURNED', 'SURVIVED')),
  created_at timestamptz not null default now()
);
create unique index uq_item_usage_horse_race on item_usages (horse_id, effective_race_date)
  where status <> 'CANCELLED';
create unique index uq_item_usage_unit on item_usages (user_item_id)
  where status <> 'CANCELLED';
create index idx_item_usages_pending on item_usages (effective_race_date) where status = 'PENDING';

-- ---------------------------------------------------------------------------
-- Generic user-to-user transfers (Decision 079): items today, in-site USDT
-- book transfers tomorrow — same recipient resolution, idempotency, audit.
-- ---------------------------------------------------------------------------
create table user_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references users (id),
  recipient_user_id uuid not null references users (id),
  asset_type text not null check (asset_type in ('ITEM', 'USDT')),
  user_item_id uuid references user_items (id),
  amount numeric(20, 8),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  constraint user_transfers_asset check (
    (asset_type = 'ITEM' and user_item_id is not null and amount is null)
    or (asset_type = 'USDT' and user_item_id is null and amount > 0)
  ),
  constraint user_transfers_not_self check (sender_user_id <> recipient_user_id)
);
create index idx_user_transfers_sender_day on user_transfers (sender_user_id, created_at);

-- ---------------------------------------------------------------------------
-- Score formula v1.1: item columns on snapshots + the revealed daily setting
-- on races. random_modifier widens to -3.00..+5.50 (item shift x setting 6).
-- ---------------------------------------------------------------------------
alter table race_participant_snapshots
  add column item_snapshot_json jsonb,
  add column item_modifier numeric(20, 8) check (item_modifier between 0.00 and 6.00);

alter table race_participant_snapshots
  drop constraint race_participant_snapshots_random_modifier_check;
alter table race_participant_snapshots
  add constraint race_participant_snapshots_random_modifier_check
  check (random_modifier between -3.00 and 5.50);

alter table races add column item_setting int check (item_setting between 1 and 6);
