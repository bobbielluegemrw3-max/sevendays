-- Migration 21: v1.0 seed data (06_DATABASE.md step 20)
-- Initial policy versions (activated), platform ledger accounts,
-- and the marketplace singleton.

-- ---------------------------------------------------------------------------
-- Platform ledger accounts (one per platform account type)
-- ---------------------------------------------------------------------------

insert into ledger_accounts (owner_type, owner_id, account_type, currency)
values
  ('PLATFORM', null, 'PLATFORM_MINT_REVENUE', 'USDT'),
  ('PLATFORM', null, 'PLATFORM_BUYBACK_RESERVE', 'USDT'),
  ('PLATFORM', null, 'PLATFORM_MLM_RESERVE', 'USDT'),
  ('PLATFORM', null, 'PLATFORM_OPERATING_RESERVE', 'USDT'),
  ('PLATFORM', null, 'PLATFORM_EMERGENCY_RESERVE', 'USDT'),
  ('PLATFORM', null, 'PLATFORM_SETTLEMENT_CLEARING', 'USDT'),
  ('PLATFORM', null, 'PLATFORM_DEPOSIT_CLEARING', 'USDT'),
  ('PLATFORM', null, 'PLATFORM_WITHDRAWAL_CLEARING', 'USDT');

-- ---------------------------------------------------------------------------
-- Marketplace singleton (OPEN)
-- ---------------------------------------------------------------------------

insert into marketplace_status (id, state) values (true, 'OPEN');

-- ---------------------------------------------------------------------------
-- Policy versions v1.0 (all values from docs/02-05 and Decision Log)
-- ---------------------------------------------------------------------------

insert into price_tables (version, policy_json, activated_at)
values ('price_table_v1.0', '{
  "prices": {
    "0": "100.00", "1": "110.00", "2": "121.00", "3": "133.10",
    "4": "146.41", "5": "161.05", "6": "177.16"
  },
  "buyback_total": "200.00",
  "purchase_lock_amount": "177.16"
}'::jsonb, now());

insert into reserve_policies (version, policy_json, activated_at)
values ('reserve_policy_v1.0', '{
  "mint_price": "100.00",
  "allocation": {
    "PLATFORM_BUYBACK_RESERVE": "93.60",
    "PLATFORM_MLM_RESERVE": "5.40",
    "PLATFORM_OPERATING_RESERVE": "0.70",
    "PLATFORM_EMERGENCY_RESERVE": "0.30"
  }
}'::jsonb, now());

insert into liquidity_policies (version, policy_json, activated_at)
values ('liquidity_policy_v1.0', '{
  "burn_target_rate": {
    "NORMAL": "0.100", "WATCH": "0.104", "WINTER": "0.108", "EMERGENCY": "0.112"
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
  "daily_day0_mint_limit": 10000
}'::jsonb, now());
-- NOTE: daily_day0_mint_limit initial value 10000 is an operational default;
-- adjust via a new liquidity policy version before launch if the owner decides.

insert into buff_policies (version, policy_json, activated_at)
values ('buff_policy_v1.0', '{
  "table": {
    "N":  { "probability": "0.30", "bonus_score": 4 },
    "R":  { "probability": "0.50", "bonus_score": 7 },
    "SR": { "probability": "0.20", "bonus_score": 10 }
  }
}'::jsonb, now());

insert into economy_policies (version, policy_json, activated_at)
values ('economy_policy_v1.0', '{
  "thresholds": {
    "NORMAL":    { "cash_coverage_min": "2.00", "p2p_match_rate_min": "0.80", "rebuy_rate_min": "0.30" },
    "WATCH":     { "cash_coverage_min": "1.50" },
    "WINTER":    { "cash_coverage_min": "1.20", "forecasted_cash_coverage_below": "1.50" },
    "EMERGENCY": { "cash_coverage_below": "1.20", "forecasted_cash_coverage_below": "1.20" }
  },
  "stability_rule": {
    "status_confirmation_days": 2,
    "emergency_immediate": true,
    "allow_direct_recovery": false,
    "emergency_minimum_lock_days": 3
  },
  "metric_formulas_note": "p2p_match_rate = assigned_p2p/p2p_listings; rebuy_rate = burned_owners_rebuying_24h/burned_owners; gmv_change_rate = (gmv_today-gmv_yesterday)/gmv_yesterday (Decision 044)"
}'::jsonb, now());

insert into assignment_algorithm_versions (version, policy_json, activated_at)
values ('assignment_algorithm_v1.0', '{
  "horse_queue_order": ["listed_at ASC", "current_day DESC", "deterministic_market_tiebreak_score DESC", "horse_uuid ASC"],
  "buyer_queue_order": ["created_at ASC", "deterministic_purchase_tiebreak_score DESC", "purchase_session_uuid ASC"],
  "priority": ["P2P_DAY1_DAY6", "DAY0_MINT_FALLBACK", "REFUND"],
  "platform_fee": "0"
}'::jsonb, now());

insert into race_engine_versions (version, policy_json, activated_at)
values ('race_engine_v1.0', '{
  "formula": "final_score = base_ability_score + horse_type_modifier + rarity_modifier + dna_modifier + training_modifier + weather_modifier + track_modifier + condition_modifier + fatigue_modifier + revenge_buff_modifier + random_modifier",
  "modifier_ranges": {
    "base_ability_score": [50.0, 100.0],
    "horse_type_modifier": [-3.0, 3.0],
    "dna_modifier": [-2.0, 2.0],
    "training_modifier": [0.0, 5.0],
    "weather_modifier": [-2.0, 2.0],
    "track_modifier": [-2.0, 2.0],
    "condition_modifier": [-3.0, 3.0],
    "fatigue_modifier": [-5.0, 0.0],
    "random_modifier": [-3.0, 3.0],
    "luck_trained_random_modifier": [-2.0, 4.0]
  },
  "rarity_modifier": { "COMMON": 0, "UNCOMMON": 1, "RARE": 2, "EPIC": 3, "LEGENDARY": 4 },
  "revenge_buff_modifier": { "N": 4, "R": 7, "SR": 10 },
  "weather_values": ["SUNNY", "RAIN", "CLOUDY", "STORM"],
  "race_formation": "one logical race per day, all ACTIVE horses (Decision 038)"
}'::jsonb, now());

insert into horse_generation_versions (version, policy_json, activated_at)
values ('horse_generation_v1.0', '{
  "type_probability": { "SPRINTER": "0.20", "POWER": "0.20", "BALANCED": "0.20", "ENDURANCE": "0.20", "LUCK": "0.20" },
  "rarity_probability": { "COMMON": "0.50", "UNCOMMON": "0.25", "RARE": "0.15", "EPIC": "0.08", "LEGENDARY": "0.02" },
  "ability_distribution": { "mean": 75.0, "standard_deviation": 10.0, "min": 50.0, "max": 100.0 },
  "ability_weights": { "speed": 0.25, "power": 0.25, "stamina": 0.20, "recovery": 0.15, "luck": 0.15 },
  "dna_modifier_range": [-2.0, 2.0]
}'::jsonb, now());
