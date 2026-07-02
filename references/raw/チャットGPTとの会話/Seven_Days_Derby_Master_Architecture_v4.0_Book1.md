# Seven Days Derby Master Architecture v4.0

## Book 1 - Executive Summary / Constitution / Business Model

> Status: Master Draft (Authoritative)

# Executive Summary

## Vision

Build the world's largest high-liquidity Web3 horse racing marketplace.

## Core Objectives

-   High RTP (\~99%)
-   Low platform margin (\~1%)
-   Zero P2P trading fee
-   Long-term community growth
-   Sustainable economy

# Constitution

## Immutable Principles

1.  Platform revenue source is **Day0 Mint only (100 USDT)**.
2.  P2P trading fee is **always 0%**.
3.  Race Engine is deterministic, versioned, auditable and immutable.
4.  AI never changes race outcomes.
5.  AI manages liquidity and economy only.
6.  Ledger is the single source of truth.
7.  Day7 horses enter a guaranteed Buyback schedule.
8.  Burn creates one Revenge Buff and one MLM reward event.
9.  Financial integrity is always more important than UI convenience.
10. Community growth is prioritized over short-term profit.

# Business Model

## Revenue

Platform Revenue:

-   Day0 Mint = 100 USDT

No revenue is generated from:

-   P2P Trading
-   Buyback
-   MLM

Platform Fee:

``` text
0%
```

## P2P

-   Buyer cannot choose horse.
-   Buyer cannot choose Day.
-   AI assigns horses.
-   Existing inventory is always prioritized.
-   Day0 Mint occurs only if inventory is insufficient.

## Burn

Purpose:

-   Supply control
-   Inflation control
-   Liquidity maintenance

Burn automatically generates:

-   Revenge Buff
-   MLM reward event

## Day7 Buyback

-   Day7 clear horse leaves marketplace.
-   Platform creates Buyback schedule.
-   Total Buyback = 200 USDT.
-   Paid over 7 daily installments.
-   After completion the horse becomes a Memorial NFT.

# Economic Philosophy

The project is NOT designed to maximize player losses.

The owner intends to build a sustainable global GameFi community.

Player-to-player profits and losses arise naturally from voluntary
market trading, not from platform manipulation.

The platform intentionally targets:

-   RTP ≈ 99%
-   Platform Margin ≈ 1%

The primary KPI is:

-   GMV
-   Liquidity
-   Retention
-   Community Growth

NOT short-term platform profit.

# Infrastructure

Frontend: - Vercel

Backend Database: - Supabase PostgreSQL

Workers: - Google Cloud Run

Queue: - Google Pub/Sub

Secrets: - Google Secret Manager

# Next Books

Book 2 - Game Design

Book 3 - Economy Design

Book 4 - Settlement Design

Book 5 - Infrastructure / Database / API / Claude Code
