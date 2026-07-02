# 08 Infrastructure

## Production Stack

Frontend:

- Vercel
- Next.js

Database/Auth/Storage:

- Supabase

Workers:

- Google Cloud Run

Queue:

- Google Pub/Sub

Secrets:

- Google Secret Manager

Monitoring:

- Google Cloud Logging
- Google Cloud Monitoring

## Execution Boundary

Cloud Run SHALL execute all financial, batch, settlement, and recovery logic.

Vercel SHALL serve frontend and lightweight server-side APIs only.

Supabase PostgreSQL SHALL be the only writable database.

Google Pub/Sub SHALL be the queue and worker communication mechanism.

Service Role Key SHALL never be exposed to browser, frontend, client bundle, client-side runtime, or public logs.

Wallet private keys SHALL be stored only in Google Secret Manager or secure signer infrastructure. They must never be exposed to browser, frontend, logs, or public runtime.

## Vercel Responsibilities

- User UI
- Admin UI
- Lightweight API gateway
- Server-side auth checks
- Read-oriented APIs

Vercel must not run financial batch logic.

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
