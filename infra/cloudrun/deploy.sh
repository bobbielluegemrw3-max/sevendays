#!/usr/bin/env bash
# Cloud Run deployment (08_INFRASTRUCTURE.md). Run once per release.
#
# Prerequisites (one-time, by the owner):
#   gcloud auth login
#   gcloud config set project "$PROJECT_ID"
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
#     artifactregistry.googleapis.com secretmanager.googleapis.com \
#     cloudscheduler.googleapis.com pubsub.googleapis.com
#   # Secrets (create once; values via `gcloud secrets versions add`):
#   #   sevendays-database-url        session-pooler URI
#   #   sevendays-internal-token      random shared token (openssl rand -hex 32)
#   #   sevendays-chain-rpc-url       QuickNode HTTPS endpoint
#   #   sevendays-deposit-xpub        HD account xpub (m/44'/60'/0')
#   #   sevendays-hot-wallet-key      hot wallet private key hex
#   #   sevendays-native-usdt-rate    POL/USDT ops rate (e.g. "0.40")
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}" # same region family as Supabase ap-south-1
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/sevendays/workers:$(git rev-parse --short HEAD)"

# Spec services (08_INFRASTRUCTURE.md) + chain-worker (deposit watcher /
# withdrawal broadcaster / memorial mint).
SERVICES=(
  batch-worker race-worker burn-worker assignment-worker buyback-worker
  mlm-worker recovery-worker liquidity-worker stress-worker
  notification-worker chain-worker
)

echo "== build & push ${IMAGE}"
gcloud builds submit --project "$PROJECT_ID" --tag "$IMAGE" .

for SERVICE in "${SERVICES[@]}"; do
  echo "== deploy ${SERVICE}"
  EXTRA_SECRETS=""
  if [[ "$SERVICE" == "chain-worker" ]]; then
    EXTRA_SECRETS=",CHAIN_RPC_URL=sevendays-chain-rpc-url:latest"
    EXTRA_SECRETS+=",DEPOSIT_ACCOUNT_XPUB=sevendays-deposit-xpub:latest"
    EXTRA_SECRETS+=",HOT_WALLET_PRIVATE_KEY=sevendays-hot-wallet-key:latest"
    EXTRA_SECRETS+=",NATIVE_USDT_RATE=sevendays-native-usdt-rate:latest"
  fi
  gcloud run deploy "sevendays-${SERVICE}" \
    --project "$PROJECT_ID" --region "$REGION" \
    --image "$IMAGE" \
    --set-env-vars "SERVICE=${SERVICE}" \
    --set-secrets "DATABASE_URL=sevendays-database-url:latest,INTERNAL_TOKEN=sevendays-internal-token:latest${EXTRA_SECRETS}" \
    --no-allow-unauthenticated \
    --ingress internal \
    --min-instances 0 --max-instances 1 \
    --memory 512Mi --timeout 900
done

echo "done. Next: infra/cloudrun/scheduler.sh, infra/pubsub/setup.sh, infra/monitoring/alerts.sh"
