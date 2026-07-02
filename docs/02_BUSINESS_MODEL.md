# 02 Business Model

## Revenue Model

Platform revenue is generated only by Day0 Mint.

```text
User pays 100 USDT
Day0 horse is minted
Platform records Day0 Mint revenue
Reserve Allocation is executed immediately
```

P2P assignment has no platform fee:

```text
Buyer payment = Seller proceeds
Platform Fee = 0
```

## Price Table v1.0

| Day | Price |
|---:|---:|
| Day0 | 100.00 USDT |
| Day1 | 110.00 USDT |
| Day2 | 121.00 USDT |
| Day3 | 133.10 USDT |
| Day4 | 146.41 USDT |
| Day5 | 161.05 USDT |
| Day6 | 177.16 USDT |
| Day7 | 200.00 USDT Buyback |

P2P assignment price is always `price_table[current_day]`.

## Reserve Allocation v1.0

Day0 Mint revenue is allocated immediately after Day0 Mint Settlement.

```text
Day0 Mint = 100.00 USDT

PLATFORM_BUYBACK_RESERVE       93.60
PLATFORM_MLM_RESERVE            5.40
PLATFORM_OPERATING_RESERVE      0.70
PLATFORM_EMERGENCY_RESERVE      0.30
TOTAL                         100.00
```

Reserve Allocation is governed by `reserve_policy_version`. AI SHALL NOT modify reserve allocation ratios. Reserve Allocation uses Ledger transaction type `RESERVE_ALLOCATION`.

The v1.0 allocation is based on:

```text
Target Day7 Arrival Rate = 46.8%
Expected Buyback Liability = 200 * 46.8% = 93.60 USDT
Expected Burn Rate = 53.2%
Expected MLM Liability = 53.2% * 10 = 5.32 USDT
```

Reserve usage is purpose-bound:

- Buyback Reserve: Buyback payments only.
- MLM Reserve: MLM Reward payments only.
- Operating Reserve: operating expenses only.
- Emergency Reserve: Emergency Recovery only.

Reserve transfers are forbidden except through Admin Emergency Recovery with dual approval, audit, and Ledger transaction.

## Day0 Mint Fallback

Assignment priority:

1. Eligible P2P Horses Day1-Day6.
2. Day0 Mint if needed and allowed by Liquidity Policy.
3. Refund.

P2P assignment SHALL always have higher priority than Day0 Mint. Day0 Mint exists only as a liquidity fallback mechanism. The platform shall never prefer Day0 Mint over an available eligible P2P horse.

Liquidity Policy includes:

- `allow_day0_mint`
- `daily_day0_mint_limit`

## Burn Recovery Incentives

Burn may create:

- Revenge Buff for the snapshot owner.
- MLM Reward for the valid direct referrer of the snapshot owner.

MLM Reward is a community recovery incentive, not financial compensation.

## Target Economics

The original target is approximately:

- Day7 Arrival Rate: 46.8%.
- RTP: 98.92%.
- Platform margin: approximately 1%.

These are model targets, not rules that may override deterministic race, Burn, Ledger, or Buyback rules.
