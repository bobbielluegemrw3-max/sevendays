# Seven Days Derby Specification

This directory is the authoritative v1.0 architecture and implementation specification for Seven Days Derby.

Claude Code must implement from these documents and must not invent business rules.

## Read Order

1. `01_CONSTITUTION.md`
2. `02_BUSINESS_MODEL.md`
3. `03_GAME_DESIGN.md`
4. `04_ECONOMY_ENGINE.md`
5. `05_SETTLEMENT_ENGINE.md`
6. `06_DATABASE.md`
7. `07_API.md`
8. `08_INFRASTRUCTURE.md`
9. `09_CLAUDE_CODE_GUIDE.md`
10. `10_DECISION_LOG.md`
11. `11_GLOSSARY.md`

## Fixed Core Decisions

- Platform revenue is Day0 Mint only.
- Day0 Mint price is 100 USDT.
- P2P platform trading fee is always 0.
- Day7 Buyback is 200 USDT paid over 7 payments.
- Payment 1 begins on the day after Day7 Clear.
- Burn generates Revenge Buff and may generate MLM Reward.
- Race Engine is deterministic, versioned, replayable, auditable, and immutable.
- AI never controls race winners, race ranking, burn targets, race seeds, or ledger balances.
- AI may evaluate economy metrics and recommend Tomorrow Economy Status only.
- Ledger is the single source of truth.
- Production stack is Vercel, Supabase, Google Cloud Run, Pub/Sub, Secret Manager, and Cloud Monitoring.

## Completion Gate

v1.0 release is forbidden until all gates pass:

- Ledger Integrity PASS
- Race Replay PASS
- Burn Determinism PASS
- Assignment Determinism PASS
- Buyback Payment PASS
- Recovery Procedure PASS
- RLS Security PASS
- Forbidden API Check PASS
- Stress Test PASS
- 100,000 User Simulation PASS

