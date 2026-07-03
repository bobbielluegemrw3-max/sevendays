# Seven Days Derby — セッション引継ぎ書

> 最終更新: 2026-07-03 / 最終コミット: `2eb83e8` / テスト: **250件 全PASS**
> 新しいセッションはまずこのファイルと `IMPLEMENTATION_PLAN.md` を読むこと。
> **仕様の正は `docs/`(v1.0仕様書パッケージ)+ `docs/10_DECISION_LOG.md`(Decision 001〜059)。ビジネスルールの発明は禁止。**

---

## 1. 現在地

```
M1 基盤        ✅ Phase 0-3   (モノレポ/DB/Ledger/ポリシー)
M2 コアエンジン ✅ Phase 4-7   (バッチ骨格/レース/Burn/Buyback)
M3 経済循環    ✅ Phase 8-10  (購入・割当/経済エンジン/リカバリ)
M4 プロダクト   🔶 Phase 11 ✅ / Phase 12 コア✅(チェーン実機検証・NFTミント残)→ 13(フロントエンド)未着手
M5 リリース判定 ⬜ Phase 14   (シミュレーション/デプロイ/Completion Gates)
```

- **バックエンドのドメイン層は完成**。37ステップの日次精算バッチが本番ハンドラで完走し(`production-day.test.ts`)、**ローンチ初日(馬0頭)シナリオも検証済み**。
- APIレイヤ(`packages/api-contracts`)完成: User 17 / Admin 8 / Internal 8 エンドポイント、認証境界・冪等強制・禁止APIゲート(CI組込)。
- Phase 12コア完成(`packages/blockchain`): HD入金アドレス導出(xpubのみでプロビジョニング)・Deposit Watcher(カーソルスキャン→128確認→Ledger経由クレジット)・Withdrawal Broadcaster(**署名→永続化→送信**順序で二重送金を構造排除、E14閾値ルーティング+approve/reject実装済み)。フェイクチェーンで全クラッシュ窓をテスト済み。**残**: RPCプロバイダ選定→Amoy実機検証、Memorial NFTミント(P6待ち)、E14閾値のAdmin APIエンドポイント結線。
- 本番Supabase(project ref `bdljkptqmnewkjoqzviy`, region ap-south-1)に**マイグレーション29本適用済み・同期済み**。

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

### Phase 12: 入出金チェーン統合 — コア完了(`2eb83e8`)、残り:
- **RPCプロバイダ選定(オーナー)→ Amoy実機検証**: `createViemChainClient` / `createViemWithdrawalSigner` は署名・エンコードのユニットテストのみ。実RPC経路は未検証
- **Memorial NFTオンチェーンミント**(Polygon ERC-721、P6最終確認待ち。`memorial_nfts`のchain列は準備済み)
- **E14確定後**: 閾値を設定に投入+Admin APIエンドポイント(`approveWithdrawal`/`rejectWithdrawal`関数は実装・テスト済み。07_APIのAdmin一覧に無いためエンドポイント追加はオーナー確認後)
- 手数料は`WithdrawalPolicy.networkFee`(設定値)。金額・決定方法はオーナー未確定
- 設計メモ: 出金確定時のLedger移動は無し(FUND_LOCKで`PLATFORM_WITHDRAWAL_CLEARING`に入った資金がそのまま外界境界として残る=入金クリアリングと対称)。`WITHDRAWAL_BROADCAST`/`WITHDRAWAL_CONFIRMATION`のenum値は現状未使用

### Phase 13: フロントエンド
- `apps/web`(Next.js)+ Admin UI。APIは `api-contracts` の registry を Next route handler / Cloud Run HTTPサーバーにマウントするだけ(`registry.dispatch(client, request)`)
- 認証: Supabase Auth JWT → AuthContext組立(admin rolesは`admin_role_grants`)
- CIにバンドル検査(Service Role Key/金融ロジック不在)を追加
- E17(通知種類)未確定 → オーナーに質問

### Phase 14: 総仕上げ
- services/*(Cloud Runワーカー)の薄いHTTPラッパー化+Pub/Sub+Scheduler(20:00 MYT=12:00 UTC)+監視11種アラート
- 10万ユーザーシミュレーション(Completion Gate G10)
- **積み残しの技術負債(診断で記録済み)**: ①カバレッジ計測導入 ②スナップショット/割当ループのN+1集合SQL化(10万頭で顕在化) ③admin retryの非同期化 ④CIグリーンの確認(**ユーザーにActionsタブ確認を4回依頼済み・未回答**)
- ローンチ前: Supabaseキーローテーション(チャット経由でファイル共有したため)・チェーン最終確認(Polygon or BSC)・E18 KYC要否

### 未確定事項(オーナー確認待ち)
- E14: 大口出金のAdmin Review閾値
- E17: 通知の種類と文言
- E18: KYC/コンプライアンス要件
- P6: Memorial NFTの規格最終確認(既定: Polygon PoS / ERC-721)

## 6. 作業の進め方(確立済みの運用)

1. **フェーズ着手前**: 未確定事項があれば「GPTに聞く質問文」形式でユーザーに提示(過去形式は会話ログ/Decision Log参照)
2. **オーナー決定** → `docs/10_DECISION_LOG.md` に決定番号(次は**060**)で英語追記 + `IMPLEMENTATION_PLAN.md` 付録Eを更新
3. スキーマ変更 = 新規マイグレーション(次は **20260702200130**)→ PGliteテスト → `db push` で本番反映
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

## 8. テスト全景(250件)

| スイート | 件数 | 内容 |
|---|---|---|
| shared | 26 | Money/hash/時刻 |
| domain | 22 | v1.0定数の仕様突合 |
| database | 43 | スキーマ/トリガー/RLS(実DB) |
| ledger | 13+1 | 複式簿記+実Postgres並行二重支払い(opt-in) |
| race-engine | 35 | 生成/スコア/ランキング/リプレイ/Burn/バフ(統計検証込み) |
| economy-engine | 33 | ポリシー/メトリクス/Status遷移ウォーク/出品/ストレス |
| settlement-engine | 38 | バッチ/Burn e2e/Buyback e2e/割当e2e(クラッシュ再開込み)/リカバリ/**フルデイ/ローンチ初日** |
| api-contracts | 7 | 認証境界/冪等強制/API経由フロー/禁止APIゲート |
| blockchain | 32 | HD導出(BIP-44ベクタ)/金額変換/Watcher(冪等・クラッシュ窓)/Broadcaster(永続化先行送信・リオルグ・レビュー)/署名/鍵非露出 |
