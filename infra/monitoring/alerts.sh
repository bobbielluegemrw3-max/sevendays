#!/usr/bin/env bash
# The 11 critical alerts (08_INFRASTRUCTURE.md "Monitoring and Alerts").
# Implemented as log-based metrics over Cloud Run logs (the engines emit
# these exact markers in error messages / step failures), plus one Pub/Sub
# DLQ depth alert and one SQL-shaped condition surfaced via the daily batch.
#
# Usage: PROJECT_ID=... NOTIFY_CHANNEL=projects/.../notificationChannels/...
#        bash infra/monitoring/alerts.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
NOTIFY_CHANNEL="${NOTIFY_CHANNEL:?create a notification channel (email) first}"

metric() { # name filter-regex description
  gcloud logging metrics create "$1" \
    --project "$PROJECT_ID" \
    --description "$3" \
    --log-filter "resource.type=\"cloud_run_revision\" AND textPayload=~\"$2\"" \
    || echo "metric $1 exists"
}

# 1  Ledger unbalanced (DB deferred trigger fires LEDGER_UNBALANCED)
metric sevendays_ledger_unbalanced        "LEDGER_UNBALANCED"                 "Ledger debit/credit mismatch"
# 2  Settlement clearing non-zero after batch (reconcile check name)
metric sevendays_clearing_nonzero         "SETTLEMENT_CLEARING_ZERO"          "Settlement clearing non-zero after batch"
# 3  Buyback payment failed
metric sevendays_buyback_failed           "BUYBACK_PAYMENT_FAILED|buyback.*FAILED" "Buyback payment failure"
# 4  Batch failed (orchestrator marks FAILED)
metric sevendays_batch_failed             "BATCH_FAILED|batch .* FAILED"      "Daily batch failed"
# 5  Marketplace locked too long (batch not completing -> lock persists)
metric sevendays_marketplace_stuck        "MARKETPLACE_LOCKED_TOO_LONG"       "Marketplace lock exceeded window"
# 6  Recovery timeout 24 hours (checkRecoveryTimeouts reports)
metric sevendays_recovery_timeout         "RECOVERY_TIMEOUT"                  "Recovery pending over 24h"
# 7  Cash coverage below threshold (economy engine)
metric sevendays_cash_coverage            "CASH_COVERAGE_BELOW|cash_coverage.*below" "Cash coverage below threshold"
# 9  Service role anomaly (auth layer marker)
metric sevendays_service_role_anomaly     "SERVICE_ROLE_ANOMALY"              "Service role usage anomaly"
# 10 Race seed verification failed
metric sevendays_seed_verification        "RACE_SEED_VERIFICATION_FAILED"     "Race seed verification failed"
# 11 Race snapshot verification failed
metric sevendays_snapshot_verification    "RACE_SNAPSHOT_VERIFICATION_FAILED" "Race snapshot verification failed"
# 12 Support bonus reserve low (Decision 074; Step 16 warns before payments would fail)
metric sevendays_support_reserve_low      "SUPPORT_RESERVE_LOW"               "Support bonus reserve below 3-night full-tier liability"

policy() { # display metric
  cat > /tmp/policy.json <<JSON
{
  "displayName": "$1",
  "combiner": "OR",
  "conditions": [{
    "displayName": "$1",
    "conditionThreshold": {
      "filter": "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/$2\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0,
      "duration": "0s",
      "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM"}]
    }
  }],
  "notificationChannels": ["${NOTIFY_CHANNEL}"]
}
JSON
  gcloud alpha monitoring policies create --project "$PROJECT_ID" --policy-from-file /tmp/policy.json || echo "policy $1 exists"
}

policy "Sevendays: Ledger unbalanced"              sevendays_ledger_unbalanced
policy "Sevendays: Clearing non-zero"              sevendays_clearing_nonzero
policy "Sevendays: Buyback payment failed"         sevendays_buyback_failed
policy "Sevendays: Batch failed"                   sevendays_batch_failed
policy "Sevendays: Marketplace locked too long"    sevendays_marketplace_stuck
policy "Sevendays: Recovery timeout 24h"           sevendays_recovery_timeout
policy "Sevendays: Cash coverage below threshold"  sevendays_cash_coverage
policy "Sevendays: Support reserve low"            sevendays_support_reserve_low
policy "Sevendays: Service role anomaly"           sevendays_service_role_anomaly
policy "Sevendays: Race seed verification failed"  sevendays_seed_verification
policy "Sevendays: Snapshot verification failed"   sevendays_snapshot_verification

# 8  Pub/Sub dead letter depth (metric exists natively)
cat > /tmp/policy.json <<JSON
{
  "displayName": "Sevendays: Pub/Sub dead letter",
  "combiner": "OR",
  "conditions": [{
    "displayName": "DLQ has messages",
    "conditionThreshold": {
      "filter": "resource.type = \"pubsub_topic\" AND resource.labels.topic_id = \"sevendays-dead-letter\" AND metric.type = \"pubsub.googleapis.com/topic/send_message_operation_count\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0,
      "duration": "0s",
      "aggregations": [{"alignmentPeriod": "300s", "perSeriesAligner": "ALIGN_SUM"}]
    }
  }],
  "notificationChannels": ["${NOTIFY_CHANNEL}"]
}
JSON
gcloud alpha monitoring policies create --project "$PROJECT_ID" --policy-from-file /tmp/policy.json || echo "policy DLQ exists"

# 12 (audit addition F-U): withdrawals stuck in BROADCAST — surfaced by the
# chain worker logging "WITHDRAWAL_BROADCAST_STUCK" when a row exceeds the
# window; wire the log metric now so the alert exists from day one.
metric sevendays_withdrawal_stuck "WITHDRAWAL_BROADCAST_STUCK" "Withdrawal stuck in BROADCAST"
policy "Sevendays: Withdrawal stuck in BROADCAST" sevendays_withdrawal_stuck
