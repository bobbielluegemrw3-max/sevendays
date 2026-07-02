# Seven Days Derby Master Architecture v4.0

## Book 4 - Settlement Design Master Edition

> Status: Master Draft

# Chapter 1 - Settlement Philosophy

Settlement is the only financial execution engine.

Principles:

-   Ledger First
-   Ownership Second
-   Notification Last
-   Fully Auditable
-   Idempotent

# Chapter 2 - Daily Liquidity Settlement Batch

Execution Time:

``` text
20:00 UTC
```

Execution Order:

``` text
01 Lock Batch
02 Lock Versions
03 Run Race
04 Confirm Results
05 Burn
06 Generate Revenge Buff
07 Calculate MLM
08 Pay MLM
09 Day7 Clear
10 Create Buyback Schedule
11 Execute Buyback Payments
12 Create Memorial NFT
13 Close Purchase Sessions
14 AI Profit Taking
15 Buyer Assignment
16 Day0 Mint (if needed)
17 Ledger Settlement
18 Ownership Transfer
19 Liquidity Report
20 Stress Test
21 Liquidity Controller
22 Audit Snapshot
23 Complete
```

# Chapter 3 - Ledger

Rules:

-   No direct balance updates
-   Double-entry accounting
-   Debit = Credit
-   Immutable after posting
-   Replayable

# Chapter 4 - Ownership

Ownership changes only after successful Ledger settlement.

Forbidden:

-   Manual transfer
-   Manual ownership edit

# Chapter 5 - Buyback Settlement

Trigger:

``` text
Day7 Clear
```

Result:

``` text
Create 7-payment schedule
```

Payments:

-   1-6: 28.57 USDT
-   7: 28.58 USDT

# Chapter 6 - MLM Settlement

Trigger:

``` text
Burn
```

Reward:

``` text
10 USDT
```

Winter/Emergency:

Pool allocation allowed.

# Chapter 7 - Revenge Buff Settlement

Burn generates one Revenge Buff.

Rules:

-   Auto generated
-   Auto applied
-   One active buff per user
-   No manual use
-   No transfer
-   No trading

# Chapter 8 - Assignment Settlement

Rules:

-   Buyer chooses neither horse nor day
-   AI assigns randomly
-   Existing inventory first
-   Day0 Mint only if inventory is insufficient

# Chapter 9 - Transactions

All financial operations execute in a single database transaction:

-   Ledger
-   Ownership
-   Audit

Failure:

``` text
ROLLBACK
```

# Chapter 10 - Constraints

\`\`\`text Ledger is Truth Platform Fee = 0 Revenue = Day0 Mint Only
Race Engine Immutable Buyback Guaranteed AI manages Economy only
Financial tables immutable
