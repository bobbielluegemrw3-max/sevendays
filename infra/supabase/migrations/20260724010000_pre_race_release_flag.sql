-- Migration: Pre-race "release(手放す)" path flag — DORMANT.
-- MARKET_PAGE_IDENTITY_REVISION_SPEC.md §2-X/§4-3 (owner decision 2026-07-24).
--
-- The pre-race release path reuses the EXISTING manual-listing mechanism
-- (same queue, same allocation, same settlement) and differs ONLY in the
-- seller-side fee rate (5% vs the 2% P2P fee). This column marks a listing
-- as a release so the settlement can pick PRE_RACE_RELEASE_FEE_SPLIT_RATE.
--
-- ★DORMANT: defaults to false and NOTHING writes it true yet (no API/UI is
-- wired — that is the post-mock-approval "本番結線" step). Every existing and
-- new listing keeps today's 2% semantics until then. Queue, allocation, price
-- ladder and BURN floor are all UNCHANGED.

alter table market_listings
  add column pre_race_release boolean not null default false;

comment on column market_listings.pre_race_release is
  'Pre-race release(手放す) path — settlement uses PRE_RACE_RELEASE_FEE_RATE(5%) '
  'instead of P2P_FEE_RATE(2%). Dormant until the market page is wired (spec §4-3).';
