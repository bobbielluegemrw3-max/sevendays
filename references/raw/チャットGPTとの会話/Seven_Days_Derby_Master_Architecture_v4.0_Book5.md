# Seven Days Derby Master Architecture v4.0

## Book 5 - Infrastructure / Database / API / Claude Code

> Status: Master Draft

# Chapter 1 - Infrastructure

## Production Stack

``` text
Frontend
- Vercel

Database
- Supabase PostgreSQL

Authentication
- Supabase Auth

Storage
- Supabase Storage

Workers
- Google Cloud Run

Queue
- Google Pub/Sub

Secrets
- Google Secret Manager

Monitoring
- Google Cloud Logging
- Google Cloud Monitoring
```

## Core Rules

-   Financial processing runs only on Cloud Run.
-   Vercel is for UI and lightweight APIs only.
-   Supabase is the only writable database.
-   Pub/Sub is the only worker communication channel.

# Chapter 2 - Database

## Principles

-   UUID primary keys
-   UTC timestamps
-   NUMERIC(20,8) for money
-   Immutable financial records
-   Ledger is the source of truth
-   RLS enabled for user-facing tables

## Core Domains

-   Users
-   Horses
-   Races
-   Purchase Sessions
-   Ownership Assignments
-   Ledger
-   Buyback
-   Revenge Buff
-   Liquidity
-   Batch
-   Audit

# Chapter 3 - API

## Public APIs

``` text
/auth
/me
/wallet
/horses
/purchase
/assignments
/races
/burns
/buybacks
/memorial-nfts
/notifications
```

## Admin APIs

``` text
/admin/dashboard
/admin/users
/admin/liquidity
/admin/stress-tests
/admin/batches
/admin/buybacks
```

## Internal APIs

``` text
/internal/race
/internal/burn
/internal/buyback
/internal/mlm
/internal/liquidity
/internal/stress
```

# Chapter 4 - Claude Code Package

## Repository

``` text
apps/
services/
packages/
infra/
docs/
```

## Implementation Order

1.  Database
2.  Ledger
3.  Batch
4.  Race
5.  Burn
6.  Revenge Buff
7.  Assignment
8.  Buyback
9.  Liquidity
10. API
11. Frontend

## Mandatory Rules

-   Never modify Race Engine.
-   Never introduce platform trading fees.
-   Never update balances directly.
-   Never bypass Ledger.
-   Always follow the Architecture Book.

# Chapter 5 - Definition of Done

Every feature must satisfy:

-   Architecture compliant
-   Unit tests pass
-   Integration tests pass
-   E2E tests pass
-   Ledger balanced
-   Audit log generated
-   Replay safe
-   Idempotent
-   Cloud Run compatible
-   Supabase compatible
