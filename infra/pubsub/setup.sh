#!/usr/bin/env bash
# Pub/Sub (08_INFRASTRUCTURE.md): async invocation with retries and a dead
# letter queue. v1.0 uses Scheduler->HTTP for the daily batch; this topic
# provides the retry/DLQ path for re-triggering the batch (admin/automation)
# without waiting for the next day. Every message carries batch_run_id /
# step_id / idempotency_key / policy versions / trace id (spec message
# contract) — handlers are idempotent so redelivery is safe.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
SA="pubsub-pusher@${PROJECT_ID}.iam.gserviceaccount.com"
TOKEN="$(gcloud secrets versions access latest --secret sevendays-internal-token --project "$PROJECT_ID")"
BATCH_URL="$(gcloud run services describe sevendays-batch-worker --project "$PROJECT_ID" --region "$REGION" --format 'value(status.url)')"

gcloud pubsub topics create sevendays-batch-trigger --project "$PROJECT_ID" || true
gcloud pubsub topics create sevendays-dead-letter  --project "$PROJECT_ID" || true

gcloud pubsub subscriptions create sevendays-batch-trigger-push \
  --project "$PROJECT_ID" \
  --topic sevendays-batch-trigger \
  --push-endpoint "${BATCH_URL}/internal/batch/start" \
  --push-auth-service-account "$SA" \
  --dead-letter-topic sevendays-dead-letter \
  --max-delivery-attempts 5 \
  --min-retry-delay 60s --max-retry-delay 600s \
  --ack-deadline 600 || true

# DLQ depth is alerted on (infra/monitoring/alerts.sh: "Pub/Sub dead letter").
echo "note: push requests carry OIDC auth; add x-internal-token via a"
echo "      no-auth wrapper is NOT provided — grant the push SA run.invoker"
echo "      and set the worker's INTERNAL_TOKEN check accordingly, or keep"
echo "      Pub/Sub for ops-triggered re-runs via 'gcloud pubsub topics publish'."
