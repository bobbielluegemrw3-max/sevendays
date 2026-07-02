# 11 Glossary

## Assignment

The settlement process that gives a buyer a horse through P2P inventory or Day0 Mint fallback.

## Burn

Removal of a horse after deterministic race ranking. Burn target count is calculated with `floor()`. Burn may generate Revenge Buff and MLM Reward.

## Burn Target

Economy policy parameter that controls the percentage of horses removed after race ranking. It is not a race outcome parameter.

## Day0 Mint

New horse creation by the platform at 100 USDT. This is the only platform revenue source.

## Day7 Buyback

System buyback after a horse reaches Day7 through Race Survival. Total is 200 USDT over seven payments.

## Deterministic

Same inputs always produce same outputs. Race, Burn, assignment queues, and policy decisions must be replayable and auditable.

## Economy Status

One of NORMAL, WATCH, WINTER, EMERGENCY. Determined by Economy Policy thresholds and Stability Rule.

## Ledger

Single source of truth for all balances. Uses double-entry bookkeeping only.

## Marketplace Lock

State during Daily Settlement Batch where new purchase sessions, external assignments, ownership transfers, and AI Profit Taking listings outside the locked batch are forbidden.

## Memorial NFT

NFT created only after all seven Buyback payments are PAID.

## MLM Reward

Burn Recovery Incentive paid to valid direct referrer of snapshot owner when Burn is finalized. Amount is 10 USDT in v1.0.

## P2P Fee

Platform trading fee for P2P assignment. It is always 0.

## Race Participant Snapshot

Immutable record of race inputs created at Daily Batch start. Race Replay must use snapshot, not mutable current database state.

## Race Seed

Random seed committed before race execution and revealed after race completion. v1.0 uses Server Commit-Reveal.

## Revenge Buff

Burn Recovery Mechanism applied automatically to user's next successful Assignment. It modifies final_score only.

## Settlement Clearing

Platform temporary ledger account used during settlement. It must return to zero after each successful batch.

