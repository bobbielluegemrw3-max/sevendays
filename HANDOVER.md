# Seven Days Derby — セッション引継ぎ書

> 最終更新: 2026-07-04 / テスト: **265件 全PASS**(+実Postgres opt-in 1件)
> **経済改定v1.1適用済み(Decision 069)**: Burn10.7%系・ミント手数料2(課金102)・P2P手数料2%売り手・ミント担保ゲート。理由と実証は `ECONOMY_REVISION.md`(オーナー追認用)。旧経済は需要急停止で未払い279件/新経済は未払い0件+運営利益2%を実証
> 新しいセッションはまずこのファイルと `IMPLEMENTATION_PLAN.md` を読むこと。
> **仕様の正は `docs/`(v1.0仕様書パッケージ)+ `docs/10_DECISION_LOG.md`(Decision 001〜059)。ビジネスルールの発明は禁止。**

---

## 1. 現在地

```
M1 基盤        ✅ Phase 0-3   (モノレポ/DB/Ledger/ポリシー)
M2 コアエンジン ✅ Phase 4-7   (バッチ骨格/レース/Burn/Buyback)
M3 経済循環    ✅ Phase 8-10  (購入・割当/経済エンジン/リカバリ)
M4 プロダクト   ✅ Phase 11-13(API/入出金Amoy実機検証済み/フロント=sevendaysderby.com稼働)
M5 リリース判定 🔶 Phase 14a-c ✅(全Gates通過・**経済v1.1で再検証済み**)→ 残りはRenderワーカー作成のみ(Decision 070)
```

- **バックエンドのドメイン層は完成**。37ステップの日次精算バッチが本番ハンドラで完走し(`production-day.test.ts`)、**ローンチ初日(馬0頭)シナリオも検証済み**。
- APIレイヤ(`packages/api-contracts`)完成: User 17 / Admin 8 / Internal 8 エンドポイント、認証境界・冪等強制・禁止APIゲート(CI組込)。
- Phase 12コア完成(`packages/blockchain`): HD入金アドレス導出(xpubのみでプロビジョニング)・Deposit Watcher(カーソルスキャン→128確認→Ledger経由クレジット)・Withdrawal Broadcaster(**署名→永続化→送信**順序で二重送金を構造排除)。フェイクチェーンで全クラッシュ窓をテスト済み。
- **Decision 060-064適用済み**(オーナー回答 2026-07-03): 大口出金1,000 USDT以上は**FINANCE_ADMIN+SUPER_ADMINの2名承認**(`withdrawal_review_approvals`+Admin API 3本)/手数料=**実費ガス精算**(`gasCostToUsdtFee`、Revenue計上なし)/Polygon PoS・128確認で確定(RPCはQuickNode推奨)/Memorial NFTメタデータ11項目+**決定論的tokenId(UUID→uint256)のミントパイプライン**/出金APIは小数6桁制限。**残**: QuickNodeキー取得→Amoy実機検証(RPCクライアント・署名・ERC-721コントラクトのデプロイとViem Minter実装)。
- **Phase 12監査(85点)→ F-M〜F-R修正済み**(`1ebcb6e`): 0値Transferグリーフィング/クレジット前のレシート再検証(リオルグ)/レビュー迂回レース/承認クラッシュ自己修復/返金vs承認の二重払いガード/閾値デフォルト結線。**未対応の既知残債**: F-S(xpubフィンガープリント照合なし)・F-T(Watcher/MinterにAdvisoryロックなし=冗長実行でエラーノイズ)・F-U(スタックtx/nonce衝突の運用経路なし→Phase 14で「BROADCAST滞留」アラート必須)・同一tx複数入金の永続記録なし・token_contract表現不一致('USDT'リテラル vs アドレス)。
- 本番Supabase(project ref `bdljkptqmnewkjoqzviy`, region ap-south-1)に**マイグレーション30本適用済み・同期済み**。

## 2. 環境セットアップ(新セッションで最初にやること)

1. `pnpm install && pnpm build && pnpm test` — 全部グリーンであることを確認(Node ≥22, pnpm 10)
2. 資格情報は `E:\dev\Cusor\sevendays\.env.local`(gitignore済み)に存在:
   - `SUPABASE_ACCESS_TOKEN`(Management API / CLI用)
   - `SUPABASE_DB_PASSWORD`
   - anon/service roleキーは `セブンデイズダービーsupabase情報.txt`(gitignore済み)の8行目/12行目
3. Supabase CLIはdevDependency。**必ず `--workdir infra`** を付ける:
   ```
   Get-Content .env.local | ? { $_ -match '^[A-Z_]+=' } | % { $k,$v = $_ -split '=',2; Set-Item "env:$k" $v }
   pnpm exec supabase --workdir infra db push --yes
   ```
4. この環境には **Docker / psql が無い**。DBテストは全て **PGlite**(`packages/database` の `createTestDb()` がsupabase互換プリアンブル+全マイグレーション適用済みDBを返す)。
5. 実Postgresが必要なテスト(並行性)は **セッションプーラー** 経由:
   `postgresql://postgres.bdljkptqmnewkjoqzviy:<encoded-pw>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres` を `TEST_DATABASE_URL` に設定(パスワードはURLエンコード必須。direct接続はIPv6専用で不可)。

## 3. アーキテクチャ地図

| パッケージ | 役割 | 鍵となるエクスポート |
|---|---|---|
| `shared` | Money(float禁止/NUMERIC(20,8))・SHA-256/Commit-Reveal・MYT時刻・SqlClient型 | `Money`, `floorTimesRate`, `sha256Parts`, `verifyCommitReveal` |
| `domain` | 全enum・v1.0固定定数・37ステップ定義(リトライ可否) | `BATCH_STEPS_V1`, `PRICE_TABLE_V1`, 各種テーブル |
| `database` | マイグレーションローダー・PGliteテストハーネス | `createTestDb`, `asUser`, `expectDbError` |
| `ledger` | 複式簿記(唯一の金融実行層)。型付き資金移動のみ | `postTransaction`, `reconcile`, movements各種 |
| `race-engine` | 純関数: 馬生成・馬名・weather/track・condition/fatigue・スコア・ランキング・Burn選定・バフロール・リプレイ | `generateHorse`, `computeScore`, `rankParticipants` |
| `economy-engine` | ポリシーローダー・メトリクス・Status判定+Stability Rule・出品選定・ストレス8種 | `evaluateEconomyStatus`, `selectProfitTakingListings` |
| `settlement-engine` | バッチorchestrator・**production.ts(37ステップ結線)**・スナップショット・Burn実行・Buyback・割当・リカバリ | `runBatch`, `buildProductionHandlers`, `executeRecovery` |
| `api-contracts` | ルーター(認証/zod/冪等/エラーマップ)+全エンドポイント実装+OpenAPI | `buildApiRegistry()`, `registry.dispatch()` |
| `blockchain` | HD導出・入金Watcher・出金Broadcaster・bigint↔Money変換・viem実装(ChainClient/Signer抽象でフェイク可能) | `runDepositScan`, `processWithdrawals`, `ensureDepositAddress`, `approveWithdrawal` |

**DBが憲法を強制**: posted Ledger不変・貸借一致(遅延トリガー)・負残高禁止・Commit-RevealのSHA検証・スナップショット凍結・Burn馬復帰不可・非リトライ可能ステップ凍結(リカバリフラグ`sevendays.recovery_mode`のみ例外、結果テーブルは常時不変)・二重承認は別人2名。

## 4. 重要な設計判断(コード読解の前提)

- 乱数は全て `sha256Parts(...)`(セパレータ`|`)から導出。正規分布は**Irwin-Hall**(超越関数不使用=エンジン間ビット一致)
- レースシードは `race_seed_escrow`(RLSポリシーなし=サービス専用)に保管→Step 9でreveal
- Revenge Buff: ACTIVE→APPLIED(割当時に馬へ紐付け)→スナップショット組込で即CONSUMED(=正確に1レース、Decision 057)
- 割当は**fresh/resume統一の冪等シーケンス**(クラッシュ後の再実行で同一結果)。Day0 Mintは馬+commit+revealが単一Tx
- バッチはadvisoryロックで単一実行者保証。冪等キーは決定論的(`batch:{date}:{nn}:{KEY}`, `assign:{sessionId}` 等)
- horse_type_modifier = 0.00固定(Decision 056)。タイプの個性はweather/track相性表+トレーニングで表現
- 「AI」= Deterministic Policy Engine。**LLMは全経路で禁止**(Decision 046)

## 5. 残作業(Phase 12〜14)

### Phase 12: 入出金チェーン統合 — **Amoy実機検証まで完了**(2026-07-03)
- **実機検証PASS**(`packages/blockchain/scripts/amoy-verify.mjs`、QuickNode Amoy経由):
  - 入金: HDアドレスへ実USDT送金→Watcher検知→**128確認実測**→Ledgerクレジット250 USDT
  - 出金: ロック→署名→実ブロードキャスト→128確認→**着金39.99939900 USDT実残高照合**(手数料=実ガス×レートのパススルー動作確認)
  - NFT: 実ミント→冪等再実行→**クラッシュ窓リプレイ**(チェーン上ミント済み・DB未記録から元txで自己修復)
- コントラクト(`infra/contracts/`、solcコンパイル。Amoyデプロイ済み): TestUSDT=`0x4ceed09bd569f7b358d1d7cc20282b3a0d30f231` / SevenDaysMemorial=`0x899f6af064e449642917e24b1e307589380fa77a`。Amoy用シークレットは`.env.local`のAMOY_*
- **実運用の学び**: QuickNode無料プランは`eth_getLogs`が5ブロック上限→ChainClient/NftMinterをレンジ分割対応(`CHAIN_GETLOGS_RANGE`環境変数)。**本番プランでは要設定**
- **メインネット移行時**: 本番マスターシード/ホットウォレット新規生成(Secret Manager直入れ)・SevenDaysMemorialのPolygon PoSデプロイ(監査版/OZ移行検討)・USDT本物アドレスは`POLYGON_POS_USDT`定数に定義済み・`NATIVE_USDT_RATE`運用値
- 設計メモ: 出金確定時のLedger移動は無し(FUND_LOCKで`PLATFORM_WITHDRAWAL_CLEARING`に入った資金がそのまま外界境界として残る=入金クリアリングと対称、Decision 061でガス代もRevenue計上しない)。`WITHDRAWAL_BROADCAST`/`WITHDRAWAL_CONFIRMATION`のenum値は現状未使用

### Phase 13: フロントエンド — 初版完了(`ecff8e8`)、残り:
- **実装済み**: `apps/web`(Next.js 16 / App Router)。`app/api/[...path]/route.ts` が registry をマウント、サーバーコンポーネントは同じ`dispatchBridge`をHTTPなしで使用。認証=Supabase JWTをjoseでローカル検証→初回ログインで`users`行プロビジョニング(id=auth.uid)→`admin_role_grants`でロール解決。ユーザーUI 10画面+Admin UI 4画面。バンドル検査は`next build`に組込(`scripts/check-client-bundle.mjs`)
- **環境変数**(`apps/web/.env.example`): NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_JWT_SECRET / DATABASE_URL(セッションプーラー)
- **Decision 065-067適用済み**(オーナー回答 2026-07-03): 通知13種+日本語テンプレート(`NOTIFICATION_TEMPLATES_V1`)を全イベントサイトで発火(決定論的`dedupe_key`で冪等・最終マーカー前に通知でクラッシュ自己修復・MARKETPLACE系は`user_id null`のブロードキャスト行)/ `POST /horses/{id}/training`(1日1回・ロック中は締切・当日バッチ完了後は翌日向け)+馬詳細のトレーニングUI / Admin Recovery一覧・詳細・approve・executeエンドポイント+リカバリUI。07_API.mdもオーナー指示で更新済み
- **Phase 13監査(90点)→ F-V〜F-Z修正済み**(`d7580bd`): プール接続のロールバック保護/stale email衝突のプロビジョニング詰み/リカバリ承認スロットの同時実行ガード/非ACTIVE馬のトレーニング拒否(`HORSE_NOT_ACTIVE` 409を追加)/RSC認証のReact cache化+pool 10。**未対応LOW**: トレーニングのOPEN確認→insert間のTOCTOU微小窓/サインアップのメール確認UX/`read_at`更新APIなし(07_API未定義)/admin layoutの二重プローブ/recovery execute・batch retryのVercel同期実行(タイムアウトリスク→Phase 14でCloud Run側へ、既存負債③と同族)
- **ホスティングはRenderに変更(Decision 068)**: リポジトリ直下の `render.yaml`(Blueprint、Singaporeリージョン・`/healthz`ヘルスチェック・ビルドにバンドル検査組込)。必要な環境変数4つは `apps/web/.env.example`。`next start` 実起動+healthz応答はローカル検証済み。デプロイはRenderダッシュボードでリポジトリ接続→Blueprint適用→環境変数投入
- **デプロイ済み**: **https://sevendaysderby.com**(www→ルートに301。Cloudflare DNS、CNAME 2本・DNS onlyモード)。Render Web Service `sevendays`(内部URL sevendays-l151.onrender.com)。手動作成のためビルド/起動コマンドは**ダッシュボード側が正**: `npm install -g pnpm@10.18.1 && pnpm install --frozen-lockfile && pnpm exec turbo run build --filter=@sevendays/web` / `cd apps/web && pnpm exec next start`。Auto-Deploy=mainへのpush
- **本番動作確認済み**(2026-07-03): サインアップ→ログイン→ダッシュボード表示まで実機確認。**トークンはES256署名(Supabase新JWT Signing Keys)**のためJWKS検証を実装済み(HS256レガシーもフォールバック対応。`6ebbab9`)。オーナーアカウント(bobbielluegemrw3@gmail.com / e54dd629-…)にFINANCE_ADMIN+SUPER_ADMIN付与済み
- **残**: 2人目の管理者アカウント(二重承認は別人2名がDB強制のため1人では完結不可)/ブラウザE2E/Marketplaceリアルタイム反映

### Phase 14: 総仕上げ — 14a/b完了(`89dc025`)
- **Decision 070(2026-07-04)**: ワーカーはGCPではなく**Render Private Service**に配備。`services/render-worker`=11ロール統合+**内蔵スケジューラー**(30秒tick・日次バッチは「20:00 MYT以降+当日行なし」で自己修復発火・FAILEDは自動再試行しない・チェーンループはCHAIN_RPC_URL設定時のみ)。`render.yaml`にpserv定義済み。GCP一式(infra/cloudrun等)はスケールアウト用に残置
- **実装済み**: `createWorkerServer`(内部トークン+ワーカー別allowlist+internal認証dispatch、HTTP実テスト)/仕様10ワーカー+`chain-worker`(watcher/broadcaster/mintジョブ)/単一Dockerfile(`SERVICE`切替)/`infra/cloudrun`(deploy.sh・scheduler.sh 5ジョブ・README)/`infra/pubsub`(再実行+DLQ)/`infra/monitoring`(11アラート+F-U滞留アラート)。`batch/start`と`check-timeouts`はbatch_date省略可(=MYT今日)
- **残(14c)**: 10万ユーザーシミュレーション(Completion Gate G10)+G1-G10チェックリスト実行
- **残(実デプロイ)**: オーナーのGCPプロジェクト作成→`infra/cloudrun/README.md`の手順(Secret 6本、SA 2本、スクリプト4本)。QuickNodeキーが揃えばchain-workerも同時に本稼働
- **積み残しの技術負債(診断で記録済み)**: ①カバレッジ計測導入 ②スナップショット/割当ループのN+1集合SQL化(10万頭で顕在化) ③admin retryの非同期化 ④CIグリーンの確認(**ユーザーにActionsタブ確認を4回依頼済み・未回答**)
- ローンチ前: Supabaseキーローテーション(チャット経由でファイル共有したため)・チェーン最終確認(Polygon or BSC)・E18 KYC要否

### 未確定事項(オーナー確認待ち)
- E14: 大口出金のAdmin Review閾値
- E17: 通知の種類と文言
- E18: KYC/コンプライアンス要件
- P6: Memorial NFTの規格最終確認(既定: Polygon PoS / ERC-721)

## 6. 作業の進め方(確立済みの運用)

1. **フェーズ着手前**: 未確定事項があれば「GPTに聞く質問文」形式でユーザーに提示(過去形式は会話ログ/Decision Log参照)
2. **オーナー決定** → `docs/10_DECISION_LOG.md` に決定番号(次は**071**)で英語追記 + `IMPLEMENTATION_PLAN.md` 付録Eを更新
3. スキーマ変更 = 新規マイグレーション(次は **20260702200133**)→ PGliteテスト → `db push` で本番反映
4. フェーズ完了ごと: 全チェック(`pnpm build/test/lint/typecheck` + `check:forbidden-apis`)→ コミット(末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)→ push
5. フェーズごとに「100点診断」を求められる文化。**クラッシュ窓・冪等性・並行性・初日/空データのエッジ**を重点監査すると過去の指摘パターンと一致する

## 7. ハマりどころ(既知)

- PowerShellは呼び出し間で**環境変数が消える** → 毎回 `.env.local` を読み直す
- `supabase login` は非TTYで失敗 → `SUPABASE_ACCESS_TOKEN` 環境変数を使う
- `exactOptionalPropertyTypes: true` — optionalフィールドに`undefined`を明示代入するとビルドエラー(条件付きspreadで回避)
- ESLintは型認識ルール有効。テストの`async`スタブは`**/test/**`で`require-await`無効化済み
- turboの`globalDependencies`にマイグレーション登録済み(キャッシュ正しさ)
- PGliteは**単一接続** — 並行性テストは実Postgres(opt-in `TEST_DATABASE_URL`)、advisoryロックの多セッション動作もPGliteでは検証不可
- 遅延制約トリガーのエラーは**COMMIT時**に発火 — `manageTransaction: false`で外部管理する場合は呼び出し側でエラーマップが必要(実例: `sessions.ts`)
- 禁止APIチェッカーはリテラルgrep — テストで禁止パスを使う場合は動的組み立て(`['','api',...].join('/')`)

## 8. テスト全景(265件全PASS+opt-in 1件。数字は `turbo run test --force` の実測)

| スイート | 件数 | 内容 |
|---|---|---|
| shared | 26 | Money/hash/時刻 |
| domain | 26 | v1.0定数の仕様突合+**通知テンプレート(Decision 065)** |
| database | 43 | スキーマ/トリガー/RLS(実DB) |
| ledger | 14+1 | 複式簿記+実Postgres並行二重支払い(opt-in skip) |
| race-engine | 33 | 生成/スコア/ランキング/リプレイ/Burn/バフ(統計検証込み) |
| economy-engine | 22 | ポリシー/メトリクス/Status遷移ウォーク/出品/ストレス |
| settlement-engine | 35 | バッチ/Burn e2e/Buyback e2e/割当e2e(クラッシュ再開込み)/リカバリ/**フルデイ/ローンチ初日** |
| api-contracts | 14 | 認証境界/冪等強制/API経由フロー/禁止APIゲート/2名承認・6桁制限/トレーニング/リカバリAPI/**ワーカーHTTPサーバー** |
| blockchain | 44 | HD導出(BIP-44ベクタ)/金額変換+実費手数料/Watcher(冪等・クラッシュ窓・**0値/リオルグ/REVERT**)/Broadcaster(永続化先行送信・リオルグ・2名承認・**自己修復・二重払いガード**)/NFTミント(決定論tokenId・クラッシュ再開)/署名/鍵非露出 |
| web | 8 | JWT検証/初回プロビジョニング(**email衝突耐性**)/ロール解決/出金フロー(ブリッジ経由)/admin境界/internal到達不能 |
