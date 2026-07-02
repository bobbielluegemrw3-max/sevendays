# 05 Settlement Engine

## Philosophy

Settlement is the only financial execution layer.

```text
Ledger First
Ownership Second
Notification Last
```

No direct balance update is allowed.

## Marketplace States

```text
OPEN
MARKET_LOCKED
MAINTENANCE
```

Marketplace enters `MARKET_LOCKED` at Daily Race Batch start. It reopens only after Audit Snapshot is created and batch completes successfully. If batch fails, Marketplace remains locked until Admin Recovery completes.

## Purchase Session

v1.0 uses immediate fund locking.

`POST /purchase`:

1. validates Marketplace is OPEN
2. validates sufficient user balance
3. calculates required lock amount
4. moves funds from USER_AVAILABLE to USER_LOCKED through Ledger
5. creates purchase_session with `PENDING_ASSIGNMENT`

Required lock amount:

```text
max_assignable_price = Day6 price = 177.16 USDT
```

If assigned price is lower:

```text
refund_amount = locked_amount - assigned_price
```

Unassigned purchase sessions are refunded through Ledger in v1.0.

## Assignment Priority

```text
1. Eligible P2P horses Day1-Day6
2. Day0 Mint fallback if needed and allowed
3. Refund
```

P2P platform fee is always 0.

## Horse Queue

```text
1. listed_at ASC
2. current_day DESC
3. deterministic_market_tiebreak_score DESC
4. horse_uuid ASC
```

Market tie-break:

```text
SHA-256(batch_id + market_pool_id + horse_uuid + assignment_algorithm_version)
```

## Buyer Queue

```text
1. created_at ASC
2. deterministic_purchase_tiebreak_score DESC
3. purchase_session_uuid ASC
```

Purchase tie-break:

```text
SHA-256(batch_id + purchase_session_uuid + assignment_algorithm_version)
```

Assignment is sequential one-to-one:

```text
Purchase #1 <- Horse #1
Purchase #2 <- Horse #2
```

VIP, referral, balance size, AI preference, or admin preference must never affect assignment order.

## AI Profit Taking

AI Profit Taking creates market listings only. It does not transfer ownership.

Ownership transfers only after Assignment Settlement completes.

If listed horse is assigned:

- buyer locked balance debit
- seller available balance credit
- platform fee = 0
- ownership transfers to buyer

If unassigned, ownership remains with seller.

## Day7 Buyback

Day7 Buyback is triggered only when a horse reaches Day7 through Race Survival.

```text
total_amount = 200 USDT
payment_count = 7
payment_1_due_date = day7_clear_date + 1
```

Payments 1-6 are 28.57142857 USDT. Payment 7 adjusts rounding difference so total equals exactly 200 USDT.

All Buyback payments use Ledger from PLATFORM_BUYBACK_RESERVE.

Memorial NFT is created only after all seven payments are PAID.

## Daily Settlement Batch Order v1.0

1. Start Batch
2. Lock Marketplace = MARKET_LOCKED
3. Lock Policy Versions
4. Lock eligible purchase sessions
5. Create races
6. Generate race_seed and commit seed_hash per race
7. Create Race Participant Snapshots
8. Run Race Engine
9. Reveal race_seed
10. Verify race replay inputs
11. Finalize race rankings
12. Calculate Burn Target Count
13. Select Burn Targets
14. Execute Burns
15. Generate / Refresh Revenge Buffs
16. Calculate and Pay MLM Rewards
17. Increment current_day for survivors
18. Process Day7 Clear
19. Create Buyback Schedules
20. Process due Buyback Payments
21. Run AI Profit Taking Selection
22. Create Market Listings
23. Build Horse Queue
24. Build Buyer Queue
25. Execute Assignment
26. Execute Reserve Allocation for Day0 Mint settlements
27. Refund unassigned purchase sessions
28. Finalize ownership transfers
29. Ledger Reconciliation / Settlement Verification
30. Create Memorial NFTs for completed Buybacks
31. Create Liquidity Report
32. Run Stress Tests
33. Calculate Tomorrow Economy Status
34. Save Tomorrow Policy
35. Create Audit Snapshot
36. Reopen Marketplace
37. Complete Batch

New Buyback Schedules created in the current batch do not receive first payment until the next batch date.

## Admin Recovery

If batch status is FAILED or PARTIAL_FAILED:

- Marketplace remains MARKET_LOCKED.
- Recovery requires dual approval: FINANCE_ADMIN + SUPER_ADMIN.
- Recovery Snapshot is saved before recovery starts.
- Recovery Log records who, when, reason, approval, step, and result.
- During Recovery Mode, all non-Cloud Run write operations are disabled.
- Admin UI is read-only except approved recovery actions.

Retry allowed:

- MLM Payment
- Buyback Payment
- Refund
- Notification
- Liquidity Report
- Stress Test
- Tomorrow Policy
- Audit Snapshot

Retry forbidden:

- Race Engine with changed inputs
- Race Ranking
- Burn Selection
- Race Seed replacement
- Snapshot replacement
- Posted Ledger mutation
- Ownership rewrite

Recovery Timeout is 24 hours. If recovery is not completed within 24 hours, system enters EMERGENCY Mode and triggers critical alerts.
