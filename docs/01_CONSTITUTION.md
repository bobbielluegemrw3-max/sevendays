# 01 Constitution

## Purpose

Seven Days Derby is a Web3 horse racing and high-liquidity P2P asset game. It is not designed to maximize player losses. The core objective is long-term community growth through deterministic races, transparent settlement, strict ledger integrity, and controlled liquidity.

## Immutable Principles

1. Player First.
2. Community First.
3. Liquidity before short-term platform profit.
4. Platform revenue comes only from Day0 Mint.
5. Day0 Mint price is 100 USDT.
6. P2P platform fee is always 0.
7. Day7 Buyback total is fixed at 200 USDT in v1.0.
8. Race Engine is deterministic, versioned, replayable, auditable, and immutable.
9. AI never changes race outcomes, race scores, rankings, seeds, burn targets, ledger balances, buyback amount, or P2P fee.
10. Ledger is the single source of truth.

## AI Boundary

AI may calculate metrics and recommend:

- Tomorrow Economy Status.
- Liquidity Policy Version recommendation.
- Reserve Policy recommendation.
- Buff Policy recommendation.
- Forecasts and stress test interpretation.

AI must not decide:

- Race winners.
- Race rankings.
- Burn rate or Burn Target Count.
- Burned horses.
- Race seed.
- Ownership transfer.
- Ledger mutation.
- P2P assignment order.
- Individual AI Profit Taking horses.
- Reserve allocation ratios.

## Immutable Burn Rules

Burn Target is an economic policy parameter, not a race outcome parameter. It controls only the percentage of horses removed after deterministic race ranking has been finalized. It never influences race calculations or determines race winners.

Burn Target Count is:

```text
floor(Eligible Horses * Burn Target Rate)
```

If Burn Target Count is calculated as a non-integer value, the result SHALL always be rounded down using `floor()`. The system must never burn more horses than the configured Burn Target. This rule is immutable and exists to preserve Player First.

## Immutable Tie and Seed Rules

When multiple horses have identical `final_score`, ranking SHALL be resolved using deterministic tie-breaker only.

No AI, administrator, or manual intervention is permitted for tie resolution.

Race seed generation SHALL use Server Commit-Reveal in v1.0. A race SHALL NOT start unless `seed_hash` has already been committed. The revealed `race_seed` MUST satisfy:

```text
SHA-256(race_seed) == seed_hash
```

Each race SHALL have exactly one independent `race_seed` and one `seed_hash`. A race seed SHALL NOT be reused across multiple races.

## Marketplace and Recovery Rules

During Daily Race Batch, Marketplace SHALL enter `MARKET_LOCKED`.

If a Daily Settlement Batch fails, Marketplace SHALL remain locked until Admin Recovery Procedure completes. Recovery requires dual approval. Race results, Burn results, committed seeds, participant snapshots, and posted ledger transactions remain immutable.

## Ledger Rules

Ledger SHALL be the single source of truth.

Every balance change SHALL be recorded through double-entry bookkeeping. Direct balance updates are forbidden. Posted ledger transactions are immutable. Every financial transaction SHALL include an idempotency key. Settlement Clearing account SHALL return to zero after every successful batch.

Admin adjustments require audit records and dual approval.

## Deposit and Withdrawal Rules

All deposits and withdrawals SHALL be represented in Ledger.

Blockchain `tx_hash` SHALL be unique per chain.

User balances SHALL NOT be updated directly from blockchain watcher without Ledger transaction.

Withdrawal funds SHALL be locked through Ledger before blockchain broadcast.

Wallet private keys SHALL never be exposed to browser, frontend, logs, or public runtime.

## Forbidden Interpretations

Claude Code must not interpret this project as:

- An AI-controlled race system.
- A hidden manipulation engine.
- A platform-fee P2P marketplace.
- A manual ledger platform.
- A system where support/admin can rewrite financial outcomes.
