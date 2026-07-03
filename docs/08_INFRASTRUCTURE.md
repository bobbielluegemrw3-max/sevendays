# 08 Infrastructure

## Production Stack

Frontend:

- Render (Decision 068; originally Vercel)
- Next.js

Database/Auth/Storage:

- Supabase

Workers:

- Render private service (Decision 070; consolidated worker with an
  in-process scheduler). Google Cloud Run remains the documented
  scale-out option (infra/cloudrun).

Queue:

- None in v1.0 (Decision 070: idempotent jobs + in-process scheduler).
  Google Pub/Sub applies to the Cloud Run scale-out option.

Secrets:

- Render environment variables (Decision 070); Google Secret Manager in
  the Cloud Run scale-out option

Monitoring:

- Render logs + health checks (Decision 070); Google Cloud
  Logging/Monitoring with the 11 alert policies (infra/monitoring) in the
  Cloud Run scale-out option

## Execution Boundary

The private worker service SHALL execute all financial, batch, settlement, and recovery logic (Render pserv per Decision 070; Cloud Run in the scale-out option).

Render SHALL serve frontend and lightweight server-side APIs only (Decision 068).

Supabase PostgreSQL SHALL be the only writable database.

Worker communication is in-process in v1.0 (Decision 070); Google Pub/Sub applies to the Cloud Run scale-out option.

Service Role Key SHALL never be exposed to browser, frontend, client bundle, client-side runtime, or public logs.

Wallet private keys SHALL be stored only in Google Secret Manager or secure signer infrastructure. They must never be exposed to browser, frontend, logs, or public runtime.

## Render Responsibilities (Decision 068)

- User UI
- Admin UI
- Lightweight API gateway
- Server-side auth checks
- Read-oriented APIs

Render must not run financial batch logic.

## Cloud Run Responsibilities

- Daily Settlement Batch
- Race Engine execution
- Burn execution
- Ledger Settlement
- Assignment
- Buyback Payment
- MLM Payment
- Recovery Procedure
- Liquidity Report
- Stress Test
- Economy Status Evaluation
- Notification worker
- Blockchain deposit watcher
- Withdrawal broadcaster

## Services

```text
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
```

## Pub/Sub

Pub/Sub is used for step queues, retries, and dead-letter handling.

Every financial worker message must carry:

- batch_run_id
- step_id
- idempotency_key
- policy version references
- trace id

## Secrets

Stored in Google Secret Manager:

- Supabase service role
- JWT secret
- wallet secret
- RPC keys
- encryption keys
- signer credentials

## Monitoring and Alerts

Critical alerts:

- Ledger unbalanced
- Settlement clearing non-zero after batch
- Buyback payment failed
- Batch failed
- Marketplace locked too long
- Recovery timeout 24 hours
- Cash coverage below threshold
- Pub/Sub dead letter
- Service role anomaly
- Race seed verification failed
- Race snapshot verification failed
