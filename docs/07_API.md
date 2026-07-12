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
- GET `/api/v1/horses` (2026-07-05: response rows additionally carry read-only `dna_hash` and `trained_for_next_race` — the latter mirrors the POST /training effective_race_date rule — so the dashboard can render deterministic art and the trained/untrained badge without extra calls; 2026-07-11 Decision 087 audit: rows also carry `listing` = 'SMART' | 'MANUAL' | null so the stable page can show the market-lock truth — a manually listed horse does not race tonight; limit raised 100 → 500 to match the show-all UI)
- GET `/api/v1/horses/{id}` (2026-07-11 Decision 087 audit: response additionally carries `listing` and `history` — the horse's full race record from race_results/races: batch_date, final_rank/final_score, is_burned, participant_count and the revealed conditions weather/track_condition/surface). POST `/horses/{id}/training` and POST `/horses/{id}/item` now reject a MANUALLY listed horse with HORSE_MARKET_LOCKED (409) — a market-locked horse does not race tonight, so training rights and item units must not be wasted on it.
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
- GET `/api/v1/notifications` (2026-07-12: rows carry `is_broadcast` — broadcast rows are shared and cannot be per-user read-marked, so unread badges count personal rows only)
- POST `/api/v1/notifications/read` (2026-07-12: marks ALL of the caller's unread personal notifications read; the notifications page fires it on open — resolves the long-standing "no read_at API" debt)
- POST `/api/v1/horses/{id}/training` (Decision 066)
- POST `/api/v1/market/list` (Decision 076)
- POST `/api/v1/market/unlist` (Decision 076)
- GET `/api/v1/market/place` (Decision 076)
- GET `/api/v1/support/summary` (Decision 074)
- GET `/api/v1/support/pool` (Decision 074)
- GET `/api/v1/support/network` (Decision 074)
- GET `/api/v1/support/bonuses` (Decision 074)
- POST `/api/v1/support/place` (Decision 074)

`POST /purchase` requires Marketplace OPEN, sufficient USER_AVAILABLE balance, and Idempotency-Key. It creates immediate fund locking. Decision 085: optional body `{count}` (1-10, default 1) creates that many sessions in one call — the server derives per-session idempotency keys `{key}#i` (count=1 keeps the bare key for backward compatibility), so a replay of the same request converges on the same sessions. Sessions are created one-by-one; if creation fails midway (insufficient balance / session cap), the already-created sessions REMAIN valid (each independently cancellable) and a retry with the same key resumes from where it stopped. Response adds `session_ids` (array; `purchase_session_id` stays = first id). A best-effort reservation-received email (Resend, Decision 081 wrapper) fires for newly created sessions only — never on replay, never blocking the purchase.

`POST /purchase/{id}/cancel` is allowed only before batch lock and when session is cancellable.

`POST /wallet/deposit` creates or returns deposit instructions for USDT. Deposit credit occurs only after blockchain watcher confirmation and Ledger transaction.

`POST /wallet/withdraw` requires Idempotency-Key, minimum withdrawal of 10 USDT (at most 6 decimal places, Decision 064), sufficient USER_AVAILABLE balance, and Ledger fund lock before blockchain broadcast.

`POST /horses/{id}/training` (Decision 066) selects the daily training (SPEED_TRAINING / POWER_TRAINING / RECOVERY_TRAINING). One training per horse per effective_race_date; owner only; rejected with MARKETPLACE_LOCKED after Batch Lock (the day's intake closes); while open it applies to the next race to run. Errors: HORSE_NOT_FOUND, NOT_HORSE_OWNER, TRAINING_ALREADY_EXISTS, RACE_SNAPSHOT_ALREADY_CREATED, INVALID_TRAINING_TYPE, MARKETPLACE_LOCKED.

Support Bonus (Decision 074; user-facing name サポートボーナス — never "MLM"):
- Invite capture: a visit with `?ref={referral_code}` stores the code (first-touch cookie); the first authenticated provisioning binds `direct_referrer_user_id` (immutable; unknown codes never block signup).
- GET `/support/summary` returns the caller's referral_code, unlocked_tiers (1..7), volume (direct referrals' ACTIVE-horse current value), tier amounts/thresholds, pool_count and lifetime bonuses received.
- GET `/support/pool` lists unplaced direct referrals (masked display names). GET `/support/network` returns the placement subtree down to tier 7 (max 500 nodes). GET `/support/bonuses` lists received payments (amount, tier, burn_event_id).
- POST `/support/place` `{user_id, parent_user_id}` places a pooled referral either directly under the sponsor (unlimited width) or under any node inside the sponsor's own placement subtree. ONE-SHOT: replaying the identical placement succeeds quietly; any different placement is refused. Errors: SUPPORT_NOT_YOUR_REFERRAL, SUPPORT_ALREADY_PLACED, SUPPORT_PARENT_OUT_OF_SCOPE, SUPPORT_PLACEMENT_CYCLE.
- POST `/admin/support/replace` `{user_id, new_parent_user_id|null, reason}` is the audited SUPER_ADMIN-only exception path (placement_audit ADMIN_OVERRIDE + audit_logs).

- POST `/api/v1/horses/train-all` (Decision 088) — one-tap bulk training: applies recommendedTrainingV1 (type affinity; fatigue ≥ 60 → recovery) to every untrained ACTIVE horse of the caller, skipping manually listed (Market Lock) and snapshot-frozen horses; individually trained horses are respected via on-conflict skip. Returns `{trained, by_type, effective_race_date}`. No per-horse notifications. Requires Marketplace OPEN.

Trade automation settings (Decision 086):
- GET `/trade-settings` returns `{chosen, auto_list, auto_reserve, auto_reserve_max}`; `chosen:false` means the user has never made the mandatory listing-mode choice (the UI must block with the choice modal; until chosen the user's horses are never smart-listed).
- POST `/trade-settings` `{auto_list, auto_reserve?, auto_reserve_max?}` upserts the choice. `auto_reserve` requires `auto_list` (TRADE_SETTINGS_INVALID). `auto_reserve_max` 1-10 or null = MAX (as balance/slots allow, default 1). Switching `auto_list` OFF flags the caller's live SMART listings `cancel_after_batch` (delisted after tonight, a sale tonight wins — same promise as manual unlist).
- POST `/internal/market/post-batch` (internal; worker fires once after the day's batch COMPLETED, fully idempotent): sends the per-seller sold email (mail_claims unique claim) and creates auto reservations for `auto_reserve` users — min(setting, free session slots, balance/177.16) sessions with keys `autoreserve:{date}:{user}#i` + AUTO_RESERVED notification + email with an off-switch pointer.

Manual Marketplace (Decision 076):
- POST `/market/list` `{horse_id}` lists the caller's ACTIVE Day1-6 horse at the CURRENT ladder price (no free pricing). While listed the horse does not race (Market Lock, snapshot exclusion). Errors: HORSE_NOT_FOUND, NOT_HORSE_OWNER, HORSE_NOT_ACTIVE, MARKET_DAY_RANGE, MARKET_ALREADY_LISTED, MARKET_ACTION_LIMIT, MARKETPLACE_LOCKED.
- POST `/market/unlist` `{horse_id}` requests delisting; it takes effect AFTER the next batch (a sale tonight wins). Replays converge quietly. Listing operations are limited to one per horse per day.
- GET `/market/place` returns the shelf (all LISTED horses in matching order, Decision 012), tonight's pending buy-reservation COUNT, the last 20 settled matches and the caller's own manual listings. Decision 085: `recent_matches` now includes Day0 mint settlements (`is_mint` flag) alongside P2P matches, plus `dna_hash`/`rarity` so the UI can render SOLD art cards (still anonymized: horse name, price, masked buyer id). The buy side itself is unchanged (POST /purchase reservations).

Item System (Decisions 078/079) — effects are public deterministic rules (item_policy_v1.0); the daily setting 1-6 is seed-committed and revealed with results (`races.item_setting`):

| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/items/catalog | 35 items (30 sellable / 5 burn drops); `active=false` rows hidden |
| GET | /api/v1/items/inventory | AVAILABLE units grouped by key + PENDING usages |
| POST | /api/v1/items/purchase | `{item_key, quantity<=10}`; USER_AVAILABLE -> PLATFORM_ITEM_CLEARING. ITEM_NOT_FOUND / ITEM_NOT_SELLABLE / INSUFFICIENT_BALANCE |
| POST | /api/v1/horses/:id/item | `{item_key}` apply for the next race (training boundary; oldest unit first). NOT_HORSE_OWNER / HORSE_NOT_ACTIVE / MARKETPLACE_LOCKED / ITEM_DAY_RANGE / ITEM_NOT_OWNED / ITEM_ALREADY_APPLIED (409) |
| POST | /api/v1/horses/:id/item/cancel | pending usage -> CANCELLED, unit returns to inventory. ITEM_USAGE_NOT_FOUND |
| POST | /api/v1/items/gift | `{recipient_email, item_key, quantity<=50}` (Decision 079): case-insensitive email, ACTIVE recipients only; the N oldest units and their clearing money move together; ITEM_GIFT_RECEIVED notification. ITEM_NOT_GIFTABLE / GIFT_RECIPIENT_NOT_FOUND / GIFT_SELF / GIFT_LIMIT (429; 20 transfers/24h across user_transfers) / ITEM_NOT_OWNED (owns fewer than quantity) |
| GET | /api/v1/items/transactions | history (newest 100): PURCHASED (from the ledger — inventory rows change owners) / RECEIVED (gifts + burn drops, masked counterparty) / SENT / USED (horse name) |
| GET | /api/v1/items/settings | revealed daily settings of FINALIZED races (last 62) + today's batch date |

Batch settlement (not an API): usages freeze at Step 7; at finalize BURNED -> full unit price to PLATFORM_MLM_RESERVE, SURVIVED -> PLATFORM_OPERATING_RESERVE; each burn drops 1 of 5 non-sellable items (seed-deterministic).

Daily Derby live status (ADR-008 R1, Decision 073):

| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/daily-derby/status | read-only: phase (WAITING/LIVE/COMPLETED/FAILED_SAFE_MODE from tonight's batch_runs), server_time + next_derby_at (client clock sync), live_started_at, tonight's real counts (participants/burns/listed/assignments/mints), revealed item_setting, anonymized ticker (sold/burn/day7 lines), the caller's personal result (DAY7 > SOLD > BURNED > SURVIVED, with dna_hash for the finale art) and my_horse_names (log-flood YOU highlight). Log-flood lines stay client-side deterministic generation (plan A) |
| GET | /api/v1/support/member/:id | member modal (owner request 2026-07-08): masked display, tier depth, placed_at, ACTIVE horses + their ladder value, lifetime burns, items used, direct/subtree counts. 404 unless the target sits in the CALLER's 7-tier placement subtree — no balances |
| POST | /api/v1/support/search | `{email}` exact match (case-insensitive) within the caller's 7-tier subtree -> `{user_id | null}`; enumeration outside one's own org is impossible by construction |

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
