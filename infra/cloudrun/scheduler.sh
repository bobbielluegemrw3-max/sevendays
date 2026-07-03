#!/usr/bin/env bash
# Cloud Scheduler jobs (08_INFRASTRUCTURE.md; batch at 20:00 MYT = 12:00 UTC,
# Decision 047). Scheduler calls Cloud Run over OIDC; the x-internal-token
# header is defense in depth. Omitted batch_date = today in MYT.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SA="scheduler-invoker@${PROJECT_ID}.iam.gserviceaccount.com"
TOKEN="$(gcloud secrets versions access latest --secret sevendays-internal-token --project "$PROJECT_ID")"

url() { gcloud run services describe "sevendays-$1" --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)'; }

job() { # name schedule service path
  local NAME="$1" CRON="$2" SERVICE="$3" URLPATH="$4"
  gcloud scheduler jobs create http "$NAME" \
    --project "$PROJECT_ID" --location "$REGION" \
    --schedule "$CRON" --time-zone "Etc/UTC" \
    --uri "$(url "$SERVICE")$URLPATH" \
    --http-method POST \
    --headers "x-internal-token=${TOKEN},content-type=application/json" \
    --message-body '{}' \
    --oidc-service-account-email "$SA" \
    --attempt-deadline 1800s || echo "job $NAME exists — update manually if changed"
}

# Daily Settlement Batch: 20:00 MYT == 12:00 UTC (Decision 047).
job sevendays-daily-batch        "0 12 * * *"   batch-worker    /internal/batch/start
# Recovery timeout check (24h rule) — hourly.
job sevendays-recovery-timeouts  "10 * * * *"   recovery-worker /internal/recovery/check-timeouts
# Chain loops (idempotent; safe at any cadence).
job sevendays-deposit-scan       "*/2 * * * *"  chain-worker    /jobs/deposit-scan
job sevendays-withdrawals        "*/5 * * * *"  chain-worker    /jobs/process-withdrawals
job sevendays-memorial-mints     "30 * * * *"   chain-worker    /jobs/memorial-mints
