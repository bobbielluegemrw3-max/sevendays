# Seven Days Derby

# Architecture Decision Record

## MLM System & Smart Marketplace (Approved Discussion)

Status: APPROVED FOR CLAUDE CODE

## MLM

-   Unilevel
-   Unlimited width
-   10 levels
-   1 USDT per level
-   Burn event triggers MLM
-   Sponsor Tree determines rewards
-   Placement does not determine rewards

## Unclaimed MLM

If fewer than 10 valid uplines exist, the remaining reward becomes
Unclaimed MLM.

Recommended allocation: - 40% Platform Reserve - 40% Community Growth
Pool - 20% Emergency Reserve

Community Growth Pool funds: - Tournaments - Seasonal events - NFT
campaigns - Community incentives

All allocations are recorded through Ledger.

## Smart Marketplace

Default: Smart Marketplace = ON.

Smart Marketplace participates in the Liquidity Engine.

Users explicitly consent to automatic marketplace participation.

## Manual Marketplace

Manual Marketplace is available.

Manual listings participate only in the Manual Queue.

They are not artificially slowed.

They are naturally slower because they are outside the Liquidity Engine.

## Market Lock Rule

A manually listed horse cannot participate in races while listed.

Flow:

Race -\> Manual Listing -\> Waiting -\> No Race Participation -\> Sold
-\> Buyer receives horse

This prevents players from intentionally waiting for Day7 Buyback while
remaining listed.

## User Modes

Smart Marketplace - High liquidity - Automatic selling - Continuous
racing

Manual Marketplace - Manual listing - Horse unavailable for racing until
sold

## Constitution Rules

-   Smart Marketplace is the recommended default.
-   Manual Marketplace is optional.
-   Manual listed horses are race-ineligible.
-   Sponsor Tree determines MLM rewards.
-   Placement does not affect MLM rewards.
-   Unclaimed MLM is redistributed.
-   All MLM and Community Pool transactions use Ledger only.
