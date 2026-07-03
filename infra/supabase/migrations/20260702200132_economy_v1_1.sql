-- Migration 32: economy revision v1.1 (Decision 069, ECONOMY_REVISION.md)
--
-- The measured Day7 arrival rate (~49.4%) made the buyback pool
-- structurally under-reserved (aggregate RTP ~100.6%). v1.1:
--   * burn ladder +0.7pt (NORMAL 10.7 / WATCH 11.1 / WINTER 11.5 / EMERGENCY 11.9)
--   * Day0 mint fee 2 USDT (charge 102; 1 -> operating, 1 -> buyback buffer)
--   * P2P fee 2% seller-side (1% -> operating, 1% -> buyback buffer)
--   * mint coverage gate (engine-enforced; recorded here for audit)
-- Buyback 200/7, price curve, and the lock amount are UNCHANGED.

update liquidity_policies set deactivated_at = now()
where version = 'liquidity_policy_v1.0' and deactivated_at is null;

insert into liquidity_policies (version, policy_json, activated_at)
values ('liquidity_policy_v1.1', '{
  "burn_target_rate": {
    "NORMAL": "0.107", "WATCH": "0.111", "WINTER": "0.115", "EMERGENCY": "0.119"
  },
  "listing_target_rate": {
    "NORMAL": "0.30", "WATCH": "0.25", "WINTER": "0.15", "EMERGENCY": "0"
  },
  "eligible_day_min": 1,
  "eligible_day_max": 6,
  "owner_listing_limit_per_batch": 1,
  "owner_listing_relaxation_enabled": true,
  "owner_listing_absolute_limit": 2,
  "allow_day0_mint": true,
  "daily_day0_mint_limit": 10000,
  "day0_mint_fee": "2.00",
  "p2p_fee_rate": "0.02",
  "fee_split": { "PLATFORM_OPERATING_RESERVE": "0.5", "PLATFORM_BUYBACK_RESERVE": "0.5" },
  "mint_coverage_gate": { "enabled": true, "safety_margin": "1.035" }
}'::jsonb, now());
