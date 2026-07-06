-- Migration 36: Manual Marketplace (Decision 076) — visible marketplace,
-- manual listings at ladder price, Market Lock while listed.
-- Smart listings are untouched: source defaults to 'SMART' and every
-- existing row keeps today's semantics.

alter table market_listings
  add column source text not null default 'SMART' check (source in ('SMART', 'MANUAL')),
  add column cancel_after_batch boolean not null default false,
  alter column batch_run_id drop not null;

-- SMART listings are always created inside a batch; MANUAL ones never are.
alter table market_listings
  add constraint market_listings_source_batch check (
    (source = 'SMART' and batch_run_id is not null)
    or (source = 'MANUAL' and batch_run_id is null)
  );

-- 出品操作は馬ごとに1日1回(Decision 076) — API層が読むだけの記録列。
alter table horses
  add column last_manual_market_action_date date;

-- Market Lock lookups: which ACTIVE horses are manually listed right now.
create index idx_market_listings_manual_live
  on market_listings (horse_id)
  where status = 'LISTED' and source = 'MANUAL';

-- Unlist outcome (取り下げ・翌バッチ反映) needs a terminal state of its own.
alter type listing_status add value if not exists 'CANCELLED';
