# Cloud Run デプロイ手順(Phase 14)

実行境界(08_INFRASTRUCTURE.md): 金融・バッチ・精算・リカバリは**Cloud Runのみ**。
フロントはRender(Decision 068)、DBはSupabase。

## 構成

- 単一イメージ(リポジトリ直下 `Dockerfile`)+ `SERVICE` 環境変数で11サービスを切替
- 仕様固定の10ワーカー + `chain-worker`(入金Watcher/出金Broadcaster/NFTミント)
- 全サービス `--no-allow-unauthenticated --ingress internal`(IAM+内部イングレス)
  + アプリ層で `x-internal-token` 検査(多層防御)
- 各ワーカーは共有registryをマウントし**自分のパスのみ**許可(allowlist)

## 初回セットアップ(オーナー作業)

1. GCPプロジェクト作成+課金有効化 → `gcloud auth login` / `gcloud config set project`
2. `deploy.sh` 冒頭コメントのAPI有効化コマンドとSecret作成(6本)を実行
3. サービスアカウント `scheduler-invoker@` / `pubsub-pusher@` を作成し
   `roles/run.invoker` を付与

## デプロイ

```bash
PROJECT_ID=<project> bash infra/cloudrun/deploy.sh      # build+push+11サービス
PROJECT_ID=<project> bash infra/cloudrun/scheduler.sh   # スケジュール5本
PROJECT_ID=<project> bash infra/pubsub/setup.sh         # 再実行トピック+DLQ
PROJECT_ID=<project> NOTIFY_CHANNEL=<channel> bash infra/monitoring/alerts.sh
```

## スケジュール(scheduler.sh)

| ジョブ | cron (UTC) | 先 |
|---|---|---|
| daily-batch | `0 12 * * *`(=20:00 MYT, Decision 047) | batch-worker `/internal/batch/start` |
| recovery-timeouts | `10 * * * *` | recovery-worker `/internal/recovery/check-timeouts` |
| deposit-scan | `*/2 * * * *` | chain-worker `/jobs/deposit-scan` |
| withdrawals | `*/5 * * * *` | chain-worker `/jobs/process-withdrawals` |
| memorial-mints | `30 * * * *` | chain-worker `/jobs/memorial-mints`(コントラクト配備まではskip応答) |

race/burn/assignment/mlm等の個別ワーカーは日次バッチに含まれるため定期実行なし。
障害時のターゲット再実行用(Admin retry / Pub/Sub経由)。
