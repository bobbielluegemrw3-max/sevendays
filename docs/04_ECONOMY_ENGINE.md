# 04 Economy Engine

## Objective

Economy Engine maximizes long-term solvency, liquidity, retention, and community growth. It does not maximize short-term platform profit.

AI may calculate and recommend. Policy versions decide.

## Economy Status

Statuses:

```text
NORMAL
WATCH
WINTER
EMERGENCY
```

Final Economy Status SHALL be validated by deterministic threshold rules in `economy_policy_version`. If multiple statuses match, the most severe status wins:

```text
EMERGENCY > WINTER > WATCH > NORMAL
```

Metrics:

- cash_coverage_ratio
- buyback_liability_ratio
- p2p_match_rate
- rebuy_rate
- gmv_change_rate
- forecasted_cash_coverage

Initial thresholds v1.0:

- NORMAL: cash_coverage_ratio >= 2.00 AND p2p_match_rate >= 80% AND rebuy_rate >= 30%.
- WATCH: cash_coverage_ratio >= 1.50 AND cash_coverage_ratio < 2.00 OR p2p_match_rate < 80% OR rebuy_rate < 30%.
- WINTER: cash_coverage_ratio >= 1.20 AND cash_coverage_ratio < 1.50 OR forecasted_cash_coverage < 1.50.
- EMERGENCY: cash_coverage_ratio < 1.20 OR forecasted_cash_coverage < 1.20 OR buyback_reserve cannot satisfy scheduled payments.

## Status Stability Rule

Economy Status uses stability rules to prevent oscillation.

v1.0:

```text
status_confirmation_days = 2
emergency_immediate = true
allow_direct_recovery = false
emergency_minimum_lock_days = 3
```

Except for EMERGENCY escalation, status transition requires target status thresholds to be satisfied for two consecutive daily evaluations.

EMERGENCY escalation occurs immediately.

Recovery from EMERGENCY proceeds stepwise:

```text
EMERGENCY -> WINTER -> WATCH -> NORMAL
```

AI SHALL NOT bypass, reset, or override the Stability Rule.

## Burn Target v1.0

Burn Target is fixed by Liquidity Policy Version:

| Economy Status | Burn Target (v1.1, Decision 069) |
|---|---:|
| NORMAL | 10.7% |
| WATCH | 11.1% |
| WINTER | 11.5% |
| EMERGENCY | 11.9% |

(Original v1.0 values were 10.0/10.4/10.8/11.2; revised +0.7pt by Decision 069 after the measured Day7 arrival rate made the buyback pool under-reserved.)

Future deterministic ranges may be introduced only through a new Liquidity Policy Version.

## AI Profit Taking Policy

AI Profit Taking Selection is:

```text
Liquidity Policy Table + deterministic sort
```

AI does not select individual horses.

Policy fields:

- listing_target_rate
- max_listing_count_per_batch
- eligible_day_min
- eligible_day_max
- owner_listing_limit_per_batch
- owner_listing_relaxation_enabled
- owner_listing_absolute_limit
- allow_day0_mint
- daily_day0_mint_limit

Initial listing target rates:

| Status | listing_target_rate |
|---|---:|
| NORMAL | 30% |
| WATCH | 25% |
| WINTER | 15% |
| EMERGENCY | 0% or limited emergency-only listing |

Listing target count:

```text
floor(eligible_horse_count * listing_target_rate)
```

Eligible horse sort:

```text
1. current_day DESC
2. last_listed_at ASC NULLS FIRST
3. deterministic_listing_tiebreak_score DESC
4. horse_uuid ASC
```

Tie-break:

```text
SHA-256(batch_id + horse_uuid + liquidity_policy_version + assignment_algorithm_version)
```

## Owner Listing Limit

Default:

```text
owner_listing_limit_per_batch = 1
owner_listing_relaxation_enabled = true
owner_listing_absolute_limit = 2
```

If listing target cannot be satisfied, the system may perform one deterministic relaxation pass to max 2 horses per owner. v1.0 forbids Pass 3.

## Stress Tests

Run daily:

- Base
- Winter 30
- Winter 90
- High Survival
- Low Burn
- P2P Freeze
- Buff Overpower
- Mass Withdrawal

