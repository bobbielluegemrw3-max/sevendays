# インフラ改定記録 — Render移行(Decision 068 / 070)

> 2026-07-03〜04 / オーナー決定。本文書はいつでもオーナー・関係者に提示できる正式記録。
> 関連: Decision Log 068(フロントエンド)・070(ワーカー)/ 08_INFRASTRUCTURE.md改定済み

## 1. 何をどう変えたか

| レイヤ | 仕様書v1.0の当初計画 | **現行(改定後)** |
|---|---|---|
| フロントエンド | Vercel + Next.js | **Render Web Service** + Next.js(Decision 068) |
| ワーカー(バッチ/精算/チェーン) | Google Cloud Run ×11サービス | **Render Private Service ×1**(11ロール統合、Decision 070) |
| スケジューラー | Google Cloud Scheduler | **ワーカー内蔵**(30秒tickの自己修復型) |
| キュー | Google Pub/Sub | **なし**(全ジョブ冪等設計のため不要) |
| シークレット | Google Secret Manager | Render環境変数 |
| DB/認証 | Supabase | Supabase(変更なし) |
| ドメイン/DNS | − | sevendaysderby.com(Cloudflare DNS、www→ルート301) |

**変わっていないもの**: 実行境界の実質(金融・バッチロジックは公開URLを持たない専用ワーカーのみで実行/WebはUI+軽量APIマウントのみ)、DBが強制する全ての不変条件、バンドル検査、内部トークン+allowlistの多層防御。

## 2. 移行の理由

1. **決済の現実**: GCPの課金登録がオーナーのカードで通らず(Google Payments特有の審査)、RenderはStripe決済で問題なく通った
2. **運用の単純化**: プラットフォームがRender+Supabaseの2つに集約。11サービス+Scheduler+Pub/Subの管理が「常駐ワーカー1台」になった
3. **能力面の確認済み事実**: 本システムの重負荷は1日1回のバッチのみ(ユーザーが待つ処理ではない)。G10検証で10万ユーザー・2,500頭/日規模の日次精算が単一プロセスで完走することを実証済み。近期の規模でRenderがボトルネックになる要素はない

## 3. 現行構成(2026-07-04時点)

```
Cloudflare DNS (sevendaysderby.com)
   │
   ▼
[Render Web Service: sevendays]            ← 公開。UI+APIマウント(Starter $7)
   │  (session pooler)
   ▼
[Supabase PostgreSQL]  ←──────────┐  マイグレーション32本適用済み
   ▲                              │
   │  (session pooler)            │
[Render Private Service: sevendays-worker] ← 非公開(Starter $7)
   ├─ 内蔵スケジューラー:
   │    日次バッチ: 「20:00 MYT経過+当日のbatch_runs行なし」で発火(自己修復・FAILED自動再試行なし)
   │    リカバリ監視: 毎時 / 入金スキャン: 2分 / 出金: 5分 / NFTミント: 毎時
   └─ QuickNode RPC(Polygon)     ← CHAIN_RPC_URL等の設定時のみ有効化
```

- 固定費: Render $14/月(Web+Worker)+ Supabase(現状無料枠)+ QuickNode(検証は無料枠)
- ビルド/起動コマンドの正: **Renderダッシュボード側**(サービスは手動作成のため)。参照値は `render.yaml` に同内容を記載
- 既知の運用注意: `eth_getLogs` のレンジ上限はRPCプラン依存(`CHAIN_GETLOGS_RANGE` で調整。無料枠=5)

## 4. スケールアウト経路(将来、規模が来たら)

**GCP一式はリポジトリに完全保存済み**で、いつでも移行可能:
- `Dockerfile`(SERVICE切替の単一イメージ)/ `infra/cloudrun/deploy.sh`(11サービス+IAM+Secret Manager)/ `scheduler.sh` / `infra/pubsub/setup.sh` / `infra/monitoring/alerts.sh`(仕様の11アラート)
- 本当のスケール限界はホスティングではなく **DB(Supabaseプラン)と集合SQL化(技術負債②)**。移行判断はそちらの指標(バッチ所要時間・DB負荷)で行う

## 5. 差し戻し・変更の容易性

- ワーカーはプレーンなHTTPサーバー+冪等ジョブなので、ホスティング先の変更はエントリポイントの差し替えのみ(ドメインロジックへの影響ゼロ)
- 仕様書の該当箇所(08_INFRASTRUCTURE.md・01_CONSTITUTION.mdのスタック記述)はDecision 068/070の注記付きで改定済み。当初計画に戻す場合はDecision Logに新決定を追記して各注記を戻す
