# 07 API

## Scope

This is the API architecture specification. It defines endpoints, purpose, authentication, request summary, response summary, business rules, idempotency requirements, and major error codes.

It is not the complete OpenAPI specification. Claude Code SHALL generate OpenAPI, DTOs, type definitions, validation schemas, and controllers from this document.

All public APIs are versioned:

```text
/api/v1/
```

## Authentication

- User APIs: JWT.
- Admin APIs: JWT + role validation.
- Internal APIs: Cloud Run service authentication only. External access forbidden.

## User APIs

- GET `/api/v1/me`
- GET `/api/v1/wallet`
- GET `/api/v1/wallet/history`
- POST `/api/v1/wallet/deposit`
- POST `/api/v1/wallet/withdraw`
- GET `/api/v1/horses` (2026-07-05: response rows additionally carry read-only `dna_hash` and `trained_for_next_race` — the latter mirrors the POST /training effective_race_date rule — so the dashboard can render deterministic art and the trained/untrained badge without extra calls)
- GET `/api/v1/horses/{id}`
- POST `/api/v1/purchase`
- POST `/api/v1/purchase/{id}/cancel`
- GET `/api/v1/purchase/{id}`
- GET `/api/v1/assignments`
- GET `/api/v1/races`
- GET `/api/v1/races/{id}`
- GET `/api/v1/races/{id}/results`
- GET `/api/v1/races/{id}/replay`
- GET `/api/v1/revenge-buffs/current`
- GET `/api/v1/buybacks`
- GET `/api/v1/buybacks/{id}`
- GET `/api/v1/notifications`
- POST `/api/v1/horses/{id}/training` (Decision 066)

`POST /purchase` requires Marketplace OPEN, sufficient USER_AVAILABLE balance, and Idempotency-Key. It creates immediate fund locking.

`POST /purchase/{id}/cancel` is allowed only before batch lock and when session is cancellable.

`POST /wallet/deposit` creates or returns deposit instructions for USDT. Deposit credit occurs only after blockchain watcher confirmation and Ledger transaction.

`POST /wallet/withdraw` requires Idempotency-Key, minimum withdrawal of 10 USDT (at most 6 decimal places, Decision 064), sufficient USER_AVAILABLE balance, and Ledger fund lock before blockchain broadcast.

`POST /horses/{id}/training` (Decision 066) selects the daily training (SPEED_TRAINING / POWER_TRAINING / RECOVERY_TRAINING). One training per horse per effective_race_date; owner only; rejected with MARKETPLACE_LOCKED after Batch Lock (the day's intake closes); while open it applies to the next race to run. Errors: HORSE_NOT_FOUND, NOT_HORSE_OWNER, TRAINING_ALREADY_EXISTS, RACE_SNAPSHOT_ALREADY_CREATED, INVALID_TRAINING_TYPE, MARKETPLACE_LOCKED.

## Admin APIs

- GET `/api/v1/admin/dashboard`
- GET `/api/v1/admin/batches`
- POST `/api/v1/admin/batches/{id}/retry`
- GET `/api/v1/admin/recovery` (Decision 067)
- GET `/api/v1/admin/recovery/{id}` (Decision 067)
- POST `/api/v1/admin/recovery/{id}/approve`
- POST `/api/v1/admin/recovery/{id}/execute` (Decision 067)
- GET `/api/v1/admin/withdrawals` (Decision 060)
- POST `/api/v1/admin/withdrawals/{id}/approve` (Decision 060)
- POST `/api/v1/admin/withdrawals/{id}/reject` (Decision 060)
- GET `/api/v1/admin/audit`
- GET `/api/v1/admin/liquidity/reports`
- GET `/api/v1/admin/stress-tests`
- GET `/api/v1/admin/policies`

Admin recovery and retry require role validation and audit. Dual approval is required for recovery and for releasing large withdrawals (Decision 060: one FINANCE_ADMIN + one SUPER_ADMIN, two distinct persons).

## Notifications v1.0 (Decision 065)

In-App only. Types: DEPOSIT_CONFIRMED, ASSIGNMENT_COMPLETED, TRAINING_COMPLETED, RACE_RESULT_READY, HORSE_BURNED, REVENGE_BUFF_GENERATED, BUYBACK_PAYMENT_PAID, BUYBACK_COMPLETED, MEMORIAL_NFT_MINTED, WITHDRAWAL_COMPLETED, WITHDRAWAL_FAILED, MARKETPLACE_LOCKED, MARKETPLACE_REOPENED. Fixed Japanese templates live in the Decision Log / packages/domain.

## Internal APIs

Cloud Run only:

- POST `/internal/batch/start`
- POST `/internal/race/run`
- POST `/internal/burn/run`
- POST `/internal/assignment/run`
- POST `/internal/buyback/pay`
- POST `/internal/mlm/pay`
- POST `/internal/recovery/run`
- POST `/internal/stress/run`
- POST `/internal/liquidity/report`

## Idempotency

Required for:

- Purchase
- Deposit
- Withdrawal
- Retry
- Recovery
- All financial internal operations

Header:

```text
Idempotency-Key
```

## Common Error Codes

- MARKETPLACE_LOCKED
- INSUFFICIENT_BALANCE
- PURCHASE_EXPIRED
- ASSIGNMENT_NOT_FOUND
- BUYBACK_NOT_FOUND
- REVENGE_BUFF_NOT_FOUND
- LEDGER_UNBALANCED
- INVALID_BATCH_STATE
- RACE_SEED_VERIFICATION_FAILED
- RACE_SNAPSHOT_VERIFICATION_FAILED
- UNAUTHORIZED
- FORBIDDEN

## Forbidden APIs

These APIs must not exist:

- Race result change API
- Burn cancel API
- Manual ledger update API
- Manual ownership rewrite API
- Manual Buyback amount change API
- Manual Revenge Buff use API
- P2P fee setting API
- Race seed replacement API
- POST `/race/change`
- POST `/burn/cancel`
- POST `/ledger/update`
- POST `/buyback/change`
- POST `/revenge-buff/use`
- POST `/ownership/change`
- POST `/market/force-sell`
- POST `/admin/race/recalculate`
- POST `/admin/seed/change`

## Deposit / Withdrawal v1.0

Supported asset:

```text
USDT only
```

Default chain:

```text
Polygon PoS USDT
```

If the Malaysia owner determines that BSC USDT is more suitable for the target user base, the chain may be changed before launch. Multi-chain support is out of scope for v1.0.

Deposit confirmation:

```text
Polygon PoS confirmation_count = 128 blocks
```

Withdrawal policy:

- minimum withdrawal = 10 USDT
- network fee deducted from withdrawal amount
- Idempotency-Key required
- large withdrawals may require Admin Review

Duplicate blockchain `tx_hash` is rejected.
