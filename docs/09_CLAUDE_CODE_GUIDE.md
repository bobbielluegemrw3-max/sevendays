# 09 Claude Code Guide

## Role

Claude Code is the implementation engineer. It must follow this specification package exactly and must not invent business rules.

## Repository Structure

```text
apps/
  web/
  admin/

services/
  batch-worker/
  race-worker/
  burn-worker/
  assignment-worker/
  buyback-worker/
  mlm-worker/
  recovery-worker/
  liquidity-worker/
  stress-worker/
  notification-worker/

packages/
  database/
  ledger/
  domain/
  race-engine/
  economy-engine/
  settlement-engine/
  api-contracts/
  shared/

infra/
  supabase/
  cloudrun/
  pubsub/
  vercel/
  monitoring/

docs/
```

Admin app may be `apps/web/app/admin` or `apps/admin`. Service Role Key must never be exposed to browser.

## Implementation Order

1. Database schema / migrations
2. Ledger package
3. Policy tables
4. Batch framework
5. Race Engine / Replay
6. Burn / Revenge Buff / MLM
7. Buyback / Memorial NFT
8. Purchase / Assignment
9. AI Profit Taking / Economy Status
10. Admin Recovery
11. API layer
12. Frontend
13. Tests / monitoring / deployment

## Package Responsibilities

- `packages/database`: schema, migration helpers, DB client, RLS helpers.
- `packages/ledger`: double-entry ledger, balance validation, idempotency, reconciliation.
- `packages/race-engine`: race calculation, seed verification, replay, tie-breaker, snapshot validation.
- `packages/economy-engine`: economy status, liquidity policy, reserve policy, stress test helpers.
- `packages/settlement-engine`: assignment, buyback, MLM, refund, ownership finalization.
- `packages/api-contracts`: DTOs, schemas, response types, error codes, OpenAPI generation.

## Forbidden Implementations

Claude Code must not implement:

- AI-controlled race outcomes.
- Platform P2P trading fees.
- Direct balance updates.
- Manual ledger mutation.
- Manual ownership rewrite.
- Manual Buyback amount changes.
- Manual Revenge Buff use.
- Race result editing.
- Burn cancellation.
- Race seed replacement.
- Financial logic in React client components.
- Financial logic in browser runtime.
- Settlement logic in frontend state management.
- Service Role Key in client bundle.
- Wallet private keys in browser, frontend, logs, or public runtime.

## Definition of Done

A feature is Done only when:

- Unit tests pass.
- Integration tests pass.
- Ledger balance validation passes.
- Idempotency tests pass for financial operations.
- Replay tests pass for Race / Burn.
- RLS / security checks pass.
- Audit log is created for critical operations.
- Error cases are tested.
- No forbidden API exists.
- No forbidden client-side financial logic exists.

Claude Code SHALL NOT mark a feature complete unless tests prove ledger integrity, deterministic replay, idempotency, auditability, and security boundaries.

Financial features SHALL include idempotency and ledger reconciliation tests. Race and Burn features SHALL include deterministic replay tests. Forbidden APIs and forbidden client-side financial logic SHALL be checked before release.

## Required Test Categories

Ledger:

- debit total equals credit total
- no negative balances
- idempotency
- settlement clearing returns to zero
- posted ledger transactions immutable
- admin adjustment requires audit and dual approval

Race:

- same snapshot + same seed equals same result
- Race Engine v1.0 additive modifier formula
- modifier ranges are enforced
- random_modifier is deterministic from race_seed, horse_uuid, and race_engine_version
- seed_hash verification passes
- invalid seed_hash fails
- tie-breaker reproducibility
- snapshot immutability
- replay equals original result

Horse Generation:

- deterministic Horse Type generation
- deterministic Rarity generation
- Horse Type and Rarity are independent
- deterministic normal-distribution ability generation
- weighted base_ability_score
- dna_hash and dna_modifier reproducibility
- no reroll or manual edit

Training:

- one training per horse per effective race date
- training after snapshot applies only to future race
- training does not permanently increase ability
- training snapshot is used for replay
- LUCK training random_modifier range remains deterministic

Burn:

- floor rounding
- Burn Target Count is never exceeded
- bottom ranked horses selected deterministically
- tied scores resolved deterministically
- burned horses do not increment current_day
- Burn generates Revenge Buff
- Burn generates MLM when valid referrer exists

Assignment:

- Horse Queue deterministic
- Buyer Queue deterministic
- P2P first
- Day0 fallback only if policy allows
- unassigned sessions refunded
- Platform Fee always 0
- ownership transfers only after Ledger settlement

Buyback:

- total exactly 200 USDT
- exactly 7 payments
- Payment 1 starts D+1
- Payment 7 adjusts rounding
- Memorial NFT only after all payments PAID

Recovery:

- failed batch keeps Marketplace locked
- immutable steps cannot be changed
- dual approval required
- recovery logs created

Security:

- users read only own private data
- users cannot update financial tables
- Service Role Key never exposed
- Cloud Run handles financial operations

Deposit / Withdrawal:

- USDT-only v1.0
- Polygon PoS default chain
- duplicate tx_hash rejected
- deposit credit only through BLOCKCHAIN_DEPOSIT_CONFIRMATION ledger transaction
- withdrawal funds locked before broadcast
- withdrawal minimum enforced
- network fee deducted from withdrawal amount
- wallet private key never exposed
