# Seven Days Derby v1.0 実装計画書(マスタープラン)

> 本計画書は `docs/` 配下の仕様書パッケージ(v1.0)を唯一の正とし、`09_CLAUDE_CODE_GUIDE.md` の実装順序に完全準拠する。
> ビジネスルールの発明・変更は一切行わない。仕様と実装が矛盾した場合は常に仕様書が勝つ。

---

## 0. 全体像

### 0.1 プロジェクトゴール

Web3競馬 × 高流動性P2Pアセットゲーム「Seven Days Derby」v1.0 を、以下の完成ゲート(Completion Gate)を全て PASS した状態でリリース可能にする。

| # | ゲート | 検証内容 |
|---|---|---|
| G1 | Ledger Integrity PASS | 複式簿記の貸借一致・残高不変条件 |
| G2 | Race Replay PASS | 同一スナップショット+シードで同一結果 |
| G3 | Burn Determinism PASS | Burn選定の決定論・floor丸め・上限厳守 |
| G4 | Assignment Determinism PASS | 馬キュー/買い手キューの決定論的割当 |
| G5 | Buyback Payment PASS | 200 USDT / 7回払い / D+1開始 / 端数調整 |
| G6 | Recovery Procedure PASS | 障害時のリカバリ手順・二重承認 |
| G7 | RLS Security PASS | Row Level Security 境界 |
| G8 | Forbidden API Check PASS | 禁止APIの不存在確認 |
| G9 | Stress Test PASS | 8種の日次ストレステスト |
| G10 | 100,000 User Simulation PASS | 10万ユーザー経済シミュレーション |

### 0.2 技術スタック(固定・変更禁止)

| レイヤ | 技術 |
|---|---|
| フロントエンド | Vercel + Next.js |
| DB / Auth / Storage | Supabase (PostgreSQL) |
| 金融・バッチ実行 | Google Cloud Run(全ワーカー) |
| キュー | Google Pub/Sub |
| シークレット | Google Secret Manager |
| 監視 | Google Cloud Logging / Monitoring |
| 入出金 | USDT のみ / Polygon PoS(確認数128ブロック) |

### 0.3 実行境界(絶対規則)

- **Cloud Run**: 全ての金融・バッチ・精算・リカバリロジックを実行する唯一の場所
- **Vercel**: UI と軽量な読み取り系API・認証チェックのみ。金融バッチロジック禁止
- **Ledger**: 唯一の真実。残高直接更新は全面禁止(複式簿記のみ)
- **AI**: レース結果・ランキング・Burn対象・シード・Ledgerを一切決定しない(推奨のみ)
- Service Role Key / ウォレット秘密鍵はブラウザ・フロント・ログ・公開ランタイムに露出禁止

### 0.4 リポジトリ構成(仕様固定)

```text
apps/
  web/            # ユーザーUI(Next.js / Vercel)
  admin/          # 管理UI(apps/web/app/admin でも可)

services/
  batch-worker/       # 日次精算バッチのオーケストレータ
  race-worker/        # レースエンジン実行
  burn-worker/        # Burn実行
  assignment-worker/  # 割当実行
  buyback-worker/     # Buyback支払い
  mlm-worker/         # MLM報酬支払い
  recovery-worker/    # リカバリ手続き
  liquidity-worker/   # 流動性レポート
  stress-worker/      # ストレステスト
  notification-worker/# 通知

packages/
  database/           # スキーマ・マイグレーション・DBクライアント・RLSヘルパー
  ledger/             # 複式簿記・残高検証・冪等性・照合
  domain/             # ドメイン型・定数・ポリシー型
  race-engine/        # レース計算・シード検証・リプレイ・タイブレーク
  economy-engine/     # 経済ステータス・流動性/準備金ポリシー・ストレステスト
  settlement-engine/  # 割当・Buyback・MLM・返金・所有権確定
  api-contracts/      # DTO・スキーマ・エラーコード・OpenAPI生成
  shared/             # 共通ユーティリティ

infra/
  supabase/  cloudrun/  pubsub/  vercel/  monitoring/

docs/                 # 仕様書(変更禁止・参照のみ)
```

---

## フェーズ一覧(依存順)

```text
Phase 0  プロジェクト基盤(モノレポ・CI・環境)
Phase 1  データベーススキーマ / マイグレーション
Phase 2  Ledgerパッケージ(複式簿記コア)
Phase 3  ポリシーテーブルとポリシーローダー
Phase 4  バッチフレームワーク(37ステップの骨格)
Phase 5  Race Engine / Horse Generation / Replay
Phase 6  Burn / Revenge Buff / MLM
Phase 7  Buyback / Memorial NFT
Phase 8  Purchase / Assignment(精算エンジン)
Phase 9  AI Profit Taking / Economy Status(経済エンジン)
Phase 10 Admin Recovery(リカバリ手続き)
Phase 11 APIレイヤ(User / Admin / Internal)
Phase 12 入出金(ブロックチェーンWatcher / Broadcaster)
Phase 13 フロントエンド(User UI / Admin UI)
Phase 14 テスト総仕上げ / 監視 / デプロイ / 完成ゲート
```

> Phase 12(入出金)は仕様上 Phase 11 の API と密結合のため独立フェーズとして明示した。それ以外は `09_CLAUDE_CODE_GUIDE.md` の実装順序 1〜13 と一対一対応する。

---

## Phase 0: プロジェクト基盤

**目的**: モノレポの骨格・ツールチェーン・CI・ローカル開発環境を確立する。

### ステップ

1. **モノレポ初期化**
   - pnpm workspaces + Turborepo でモノレポを構成
   - TypeScript(strict)、ESLint、Prettier を全パッケージ共通設定で導入
   - `apps/` `services/` `packages/` `infra/` のディレクトリ骨格を仕様どおり作成
2. **共通パッケージの雛形**
   - `packages/shared`: 金額計算ユーティリティ(NUMERIC(20,8) 相当の decimal 演算 — `decimal.js` 等。浮動小数点で金額を扱うことを禁止)、SHA-256 ヘルパー、UUID、UTC時刻ヘルパー
   - `packages/domain`: enum定義(HorseType, Rarity, EconomyStatus, MarketplaceState, 各status)、ドメイン型
3. **Supabase ローカル環境**
   - Supabase CLI 導入、`supabase init`、ローカルDB起動
   - `セブンデイズダービーsupabase情報.txt` の接続情報を環境変数化(`.env.local`、gitignore済みを確認)
4. **CI パイプライン(GitHub Actions)**
   - lint / typecheck / unit test / build を PR ごとに実行
   - 後続フェーズで「禁止APIチェック」「クライアント金融ロジックチェック」を追加する足場を用意
5. **テスト基盤**
   - Vitest(unit / integration)、テスト用DBコンテナのセットアップ

### 完了条件

- [ ] `pnpm install && pnpm build && pnpm test` が全パッケージで成功
- [ ] Supabase ローカル環境が起動し、マイグレーションが空実行できる
- [ ] CI がグリーン

---

## Phase 1: データベーススキーマ / マイグレーション

**目的**: `06_DATABASE.md` の全テーブルをマイグレーションとして実装する。**マイグレーション順序は仕様固定(1〜20)**。

### ステップ(仕様のMigration Order準拠)

1. **enums** — horse_type, rarity, economy_status, marketplace_state, 各テーブルの status, transaction_type, account_type, direction(DEBIT/CREDIT), training_type, buff_rarity 等
2. **users** — id, email, status(ACTIVE/SUSPENDED/BANNED/DELETED), direct_referrer_user_id, created_at。**登録/紐付け時の紹介循環検出**をDB関数またはアプリ層で実装
3. **ledger** — `ledger_accounts`(10種のaccount_type)、`ledger_transactions`(idempotency_key unique・posted後immutable)、`ledger_entries`(貸借一致制約)
4. **blockchain deposit / withdrawal** — `blockchain_deposits`(unique(chain_id, tx_hash))、`blockchain_withdrawals`(tx_hash unique per chain・放送前Ledgerロック必須)
5. **horse** — `horses`(生成フィールドはcreate後immutable、Day7/burnedはP2P復帰不可のCHECK/トリガー)
6. **race** — `races`、`randomness_commits`(unique(reference_type, reference_id)・reveal検証)
7. **burn** — `race_results`、`horse_burns`
8. **training** — `training_sessions`(unique(horse_id, effective_race_date)・snapshot_included_at後の編集禁止)
9. **revenge_buff** — `revenge_buffs`(ユーザーごと active/pending/applied は1件のみ — partial unique index)
10. **purchase / market** — `purchase_sessions`、`market_listings`
11. **assignment** — `ownership_assignments`
12. **buyback** — `buyback_schedules`(1馬1スケジュール・total=200・count=7)、`buyback_schedule_payments`(unique(schedule_id, payment_number))
13. **nft** — `memorial_nfts`(1馬1NFT)
14. **policy** — `liquidity_policies`、`economy_status_evaluations`、`reserve_policies`、`buff_policies`、`price_tables`、`assignment_algorithm_versions`、`race_engine_versions`(全てバージョン管理・activate後immutable)
15. **batch** — `batch_runs`、`batch_steps`(status, retry count, idempotency key, error code, timestamps)
16. **recovery** — `recovery_snapshots`、`recovery_logs`(二重承認カラム approved_by_1 / approved_by_2)
17. **audit** — `audit_logs`(immutable・before_hash/after_hash)
18. **indexes** — user_id, horse_id, race_id, batch_run_id, status, created_at, idempotency_key, reference_type+reference_id
19. **RLS** — ユーザー向けテーブル: 自分の行のみ読取可・金融/システム行の更新不可。Cloud Run/Adminはservice roleのみ
20. **seed data** — v1.0 初期ポリシー投入:
    - price_table v1.0(Day0=100.00 … Day6=177.16, Day7 Buyback=200.00)
    - reserve_policy v1.0(Buyback 93.60 / MLM 5.40 / Operating 0.70 / Emergency 0.30)
    - liquidity_policy v1.0(Burn Target: NORMAL 10.0% / WATCH 10.4% / WINTER 10.8% / EMERGENCY 11.2%、listing_target_rate: 30/25/15/0%、owner_listing_limit=1→緩和2、allow_day0_mint、daily_day0_mint_limit)
    - buff_policy v1.0(N 30% +4 / R 50% +7 / SR 20% +10)
    - economy_policy v1.0(閾値・stability rule: confirmation_days=2, emergency_immediate, lock_days=3)
    - race_engine_version v1.0 / assignment_algorithm_version v1.0 / horse_generation_version v1.0
    - プラットフォームLedger口座の開設(10種)

### 実装上の強制事項

- 金額は全て `NUMERIC(20,8)`、時刻は全てUTC、PKは全てUUID
- 金融テーブルは posted 後 UPDATE/DELETE をトリガーで拒否(immutability をDBレベルで強制)
- `packages/database` に型安全DBクライアント・マイグレーションヘルパー・RLSテストヘルパーを実装

### テスト

- [ ] 全マイグレーションが順序どおり適用・ロールバックできる
- [ ] immutabilityトリガーのテスト(posted ledger行のUPDATEが失敗する等)
- [ ] unique制約テスト(tx_hash、idempotency_key、(horse_id, effective_race_date) 等)
- [ ] RLSテスト: ユーザーAがユーザーBの行を読めない/金融テーブルを更新できない

---

## Phase 2: Ledgerパッケージ(複式簿記コア)

**目的**: 「Ledger is the single source of truth」を実装する。**このパッケージ以外から残高を変更する経路を作らない。**

### ステップ

1. **口座モデル** — 10種のaccount_type(USER_AVAILABLE, USER_LOCKED, PLATFORM_MINT_REVENUE, PLATFORM_BUYBACK_RESERVE, PLATFORM_MLM_RESERVE, PLATFORM_OPERATING_RESERVE, PLATFORM_EMERGENCY_RESERVE, PLATFORM_SETTLEMENT_CLEARING, PLATFORM_DEPOSIT_CLEARING, PLATFORM_WITHDRAWAL_CLEARING)の開設・取得API
2. **トランザクション投稿API** — `postTransaction({ type, idempotencyKey, referenceType, referenceId, entries[] })`
   - 貸借一致検証(debit合計 == credit合計、不一致は `LEDGER_UNBALANCED`)
   - 冪等性: 同一idempotency_keyの再投稿は既存結果を返す(二重計上ゼロ)
   - 残高不足検証(負残高の禁止)
   - DBトランザクション内でアトミックに entries を書き込み、posted は immutable
3. **残高照会API** — entriesの集計による残高導出(キャッシュはあくまで導出値。真実はentries)
4. **トランザクション型の定義** — RESERVE_ALLOCATION, BLOCKCHAIN_DEPOSIT_CONFIRMATION, 購入ロック/返金/割当精算/Buyback支払/MLM支払/出金ロック 等、仕様に登場する全型
5. **照合(Reconciliation)API** — バッチ後検証: 全posted取引の貸借一致、SETTLEMENT_CLEARING残高==0、口座残高非負
6. **管理者調整** — audit記録+二重承認を強制するAPIのみ許可(直接調整は不可能な設計)

### テスト(仕様の必須カテゴリ)

- [ ] debit合計 == credit合計
- [ ] 負残高が発生しない
- [ ] 冪等性(同一キー再実行で残高が変わらない)
- [ ] Settlement Clearingがバッチ後ゼロに戻る
- [ ] posted済み取引のimmutability
- [ ] 管理者調整はaudit+二重承認必須

---

## Phase 3: ポリシーテーブルとポリシーローダー

**目的**: 全ての可変パラメータを「バージョン管理された不変ポリシー」として提供する。

### ステップ

1. `packages/economy-engine` にポリシーローダーを実装(active版の解決・バージョン指定ロード)
2. ポリシー活性化フロー: 新バージョン作成 → activate → 旧版は参照専用(activate後は一切変更不可)
3. price_table参照API: `getPrice(day)` — P2P割当価格は常に `price_table[current_day]`
4. Reserve Allocation計算(reserve_policy駆動): 100.00 → 93.60 / 5.40 / 0.70 / 0.30(合計検証付き)
5. バッチが「その日のポリシーバージョン一式」をロックする仕組み(Batch Step 3で使用)

### テスト

- [ ] activate後のポリシー変更が拒否される
- [ ] Reserve配分の合計が常にMint額と一致
- [ ] バージョン指定ロードの再現性

---

## Phase 4: バッチフレームワーク

**目的**: `05_SETTLEMENT_ENGINE.md` の**37ステップの日次精算バッチ**を、ステップ単位で冪等・再試行可能・監査可能に実行する骨格を作る。

### ステップ

1. **batch_runs / batch_steps 管理** — バッチ生成、ステップ登録(37ステップ定義)、状態遷移(PENDING → RUNNING → COMPLETED / FAILED / PARTIAL_FAILED)
   - **バッチ基準時刻は 20:00 MYT(UTC+8)**。`batch_date` はMYT基準で定義(決定047)
   - **レース編成(Step 5)**: 1日1レース・全ACTIVE馬参加。大規模化(例: 100万頭)時は内部的に複数レースへ自動分割するが、論理的には1レース(単一のグローバルランキング)として扱う(決定038)。分割はパフォーマンスシャーディングのみで、final_score計算とランキングの決定論に影響しない設計にする
2. **ステップ実行エンジン** — 各ステップは `{ batch_run_id, step_id, idempotency_key, policy versions, trace_id }` を持つメッセージで駆動。冪等(同一ステップ再実行で二重効果ゼロ)
3. **Pub/Sub 統合** — ステップキュー・リトライ・デッドレター。ローカルはエミュレータ
4. **Marketplaceロック制御** — Step 2で `MARKET_LOCKED`、Step 36で再開。**バッチ失敗時はロック維持**(Recovery完了まで)
5. **リトライ可否のポリシー実装** — 再試行可: MLM/Buyback/Refund/通知/レポート/ストレステスト/Tomorrow Policy/Audit Snapshot。再試行不可: レースエンジン(入力変更)/ランキング/Burn選定/シード差替/スナップショット差替/posted Ledger変更/所有権書換
6. **Audit Snapshot生成**(Step 35)と**バッチ完了判定**(Step 37)
7. **`services/batch-worker`** — Cloud Runサービスとしてオーケストレーションを実装(この時点ではステップ本体はスタブ)

### 37ステップ定義(仕様固定・順序変更禁止)

```text
01 Start Batch                        20 Process due Buyback Payments
02 Lock Marketplace                   21 Run AI Profit Taking Selection
03 Lock Policy Versions               22 Create Market Listings
04 Lock eligible purchase sessions    23 Build Horse Queue
05 Create races                       24 Build Buyer Queue
06 Generate race_seed / commit hash   25 Execute Assignment
07 Create Participant Snapshots       26 Reserve Allocation (Day0 Mint)
08 Run Race Engine                    27 Refund unassigned sessions
09 Reveal race_seed                   28 Finalize ownership transfers
10 Verify race replay inputs          29 Ledger Reconciliation
11 Finalize race rankings             30 Create Memorial NFTs
12 Calculate Burn Target Count        31 Create Liquidity Report
13 Select Burn Targets                32 Run Stress Tests
14 Execute Burns                      33 Calculate Tomorrow Economy Status
15 Generate/Refresh Revenge Buffs     34 Save Tomorrow Policy
16 Calculate and Pay MLM Rewards      35 Create Audit Snapshot
17 Increment current_day (survivors)  36 Reopen Marketplace
18 Process Day7 Clear                 37 Complete Batch
19 Create Buyback Schedules
```

### テスト

- [ ] ステップ冪等性(同一ステップ2回実行で副作用1回)
- [ ] 失敗時にMarketplaceがロックされたままになる
- [ ] リトライ禁止ステップの再実行が拒否される
- [ ] デッドレター発生時のアラートフック

---

## Phase 5: Race Engine / Horse Generation / Replay

**目的**: 決定論・バージョン管理・リプレイ・監査可能・不変の中核エンジンを実装する(`packages/race-engine`)。

### 5A. Horse Generation v1.0

1. **Commit-Reveal**: `mint_seed → mint_seed_hash → 生成 → reveal`
2. **決定論的生成**(全て `mint_seed + horse_uuid + horse_generation_version` から導出):
   - Horse Type: 5種 各20%
   - Rarity: COMMON 50 / UNCOMMON 25 / RARE 15 / EPIC 8 / LEGENDARY 2%(Typeと独立ドロー)
   - 能力5種(speed/power/stamina/recovery/luck): `SHA-256(mint_seed + horse_uuid + ability_name + version)` → 決定論的正規分布(mean 75, sd 10)→ clamp [50,100]
   - base_ability_score = speed×0.25 + power×0.25 + stamina×0.20 + recovery×0.15 + luck×0.15
   - dna_hash = SHA-256(mint_seed + horse_uuid + user_uuid + version)、dna_modifier ∈ [-2.00, +2.00]
3. リロール・手動修正の経路を作らない(生成レコードimmutable)
4. **馬名ジェネレータ(決定050)**: AIではなく決定論的Generator。`Bloodline + Prefix + Suffix`(例: Royal Thunder / Black Wind / Golden Storm)を mint_seed から決定論的に導出。画像はv1.0スコープ外(将来 Stable Diffusion / Flux)

### 5B. Race Engine v1.0

1. **入力**: 不変Participant Snapshot のみ(現在のDB状態を読まない)
2. **final_score 加算式**(固定):
   ```text
   final_score = base_ability_score + horse_type_modifier + rarity_modifier
               + dna_modifier + training_modifier + weather_modifier
               + track_modifier + condition_modifier + fatigue_modifier
               + revenge_buff_modifier + random_modifier
   ```
3. **modifier範囲の強制**(仕様の表どおり: rarity +0/+1/+2/+3/+4、buff +4/+7/+10、random ±3.00 等)。範囲逸脱は即エラー
4. **random_modifier**: `deterministic_random(race_seed, horse_uuid, race_engine_version)`。LUCK型+有効LUCKトレーニング時のみ範囲が -2.00/+4.00 に変化(決定論維持)
5. **ランキング**: `final_score DESC → tiebreak_score DESC → horse_uuid ASC`。tiebreak = `normalize(SHA-256(race_seed + horse_uuid + race_engine_version))`
6. **Server Commit-Reveal**: seed_hash未コミットのレースは開始不可。reveal後 `SHA-256(race_seed) == seed_hash` 検証。1レース1シード・再利用禁止
7. **Weather / Track の決定論的導出(決定039)**: 天候・馬場はコミット済み `race_seed` から SHA-256 で決定論的に導出(Commit-Reveal)。Weather ∈ {SUNNY, RAIN, CLOUDY, STORM}、Track Conditionも同一メカニズム。AI・管理者・手動入力は禁止。サーバーはシードを保持しているためスナップショット作成時(Step 7)に導出可能で、reveal後に第三者が検証可能
8. **Condition / Fatigue の日次漸化式(決定040)**:
   ```text
   condition_today = condition_yesterday + training_effect - fatigue
   fatigue_today   = fatigue_yesterday + training_cost - recovery
   ```
   結果は仕様のmodifier範囲にclamp(condition -3.00〜+3.00、fatigue -5.00〜0.00)。training_cost・recovery・初期値等の数値パラメータはポリシーバージョンで管理
9. **Replay API**: `replayRace(race_id)` — snapshot + revealed seed から全結果(weather/track含む)を再計算し原本と一致検証

### 5C. Daily Training v1.0

1. training_sessions 登録(SPEED/POWER/RECOVERY、1馬1レース日1件)
2. スナップショット前のみ有効。後着はfuture raceへ
3. modifier規則(SPRINTER×SPEED=+5他、仕様表どおり)をsnapshot作成時に計算し `training_snapshot_json` へ固定
4. リプレイはsnapshotのみ参照(可変テーブル参照禁止)

### 5D. Participant Snapshot

- Step 7 で全参加馬の不変スナップショット生成(仕様の全フィールド+snapshot_hash)
- 作成後の所有権・トレーニング・バフ変更はそのレースに影響しない

### テスト(仕様必須)

- [ ] 同一snapshot+seed → 同一final_score・ランキング・Burn結果(リプレイ一致)
- [ ] 加算式・全modifier範囲の強制
- [ ] random_modifierの決定論
- [ ] seed_hash検証成功/改竄失敗
- [ ] タイブレーク再現性・snapshot不変性
- [ ] Horse Generation: 型/レア度の独立決定論・正規分布能力・加重スコア・DNA再現性・リロール不可
- [ ] Training: 1馬1日1件・snapshot後は将来レースのみ・能力恒久増加なし・LUCK範囲変化の決定論

---

## Phase 6: Burn / Revenge Buff / MLM

**目的**: Burnの決定論と、Burn回復インセンティブ2種を実装する。

### ステップ

1. **Burn Target Count** = `floor(Eligible Horses × Burn Target Rate)`(rateはEconomy Status→Liquidity Policyで固定値)。**floorは不変規則・上限厳守**
2. **Burn選定**: 確定ランキングの下位 `Burn Target Count` 頭のみ。同点による追加Burn禁止
3. **Burn実行**: horse status変更(P2P復帰不可)、`horse_burns` 記録、current_dayは増えない
4. **Revenge Buff生成/リフレッシュ**(Step 15):
   - 帰属: `owner_user_id_at_snapshot`
   - レア度ロール: `SHA-256(race_seed + horse_uuid + owner_user_id_at_snapshot + burn_event_id + buff_policy_version)` → N 30% / R 50% / SR 20%
   - 1ユーザー1バフ(既存あればリフレッシュ・重複なし)。売買・譲渡・手動使用不可。無期限
   - 次回の成功したAssignmentに自動適用(P2P・Day0 fallback両方)、失敗/返金では消費しない
5. **MLM Reward**(Step 16): snapshot所有者の有効な直接紹介者に 10 USDT(Level 1のみ)。PLATFORM_MLM_RESERVE からLedger支払い。紹介者不在なら支払いなし
   - **「有効な直接紹介者」の定義(決定041)**: status = ACTIVE のみ有効。BANNED / SUSPENDED / DELETED / 自己紹介 / 紹介ループは無効(支払いなし)

### テスト(仕様必須)

- [ ] floor丸め・Burn Target Count超過ゼロ
- [ ] 下位決定論選定・同点の決定論解決
- [ ] Burn馬のcurrent_day非増加
- [ ] Buff生成・リフレッシュ(重複なし)・自動適用・失敗時非消費
- [ ] MLM: 有効紹介者存在時のみ・10 USDT・Ledger経由・冪等

---

## Phase 7: Buyback / Memorial NFT

**目的**: Day7クリア馬への 200 USDT / 7回払い Buyback と Memorial NFT を実装する。

### ステップ

1. **Day7 Clear処理**(Step 18): レース生存でcurrent_day=7到達 → status=`DAY7_CLEARED`、P2P循環から除外、再割当不可
2. **Buybackスケジュール生成**(Step 19): total=200 / count=7 / **支払いは毎日、D+1〜D+7(決定042)**。当日バッチで生成されたスケジュールの初回支払いは翌バッチから
3. **支払い計算**: Payment 1〜6 = 28.57142857、Payment 7 = 200 − (28.57142857×6) = 28.57142858(端数調整で合計ちょうど200)
4. **支払い実行**(Step 20): 期日到来分を PLATFORM_BUYBACK_RESERVE → USER_AVAILABLE でLedger支払い(冪等)
5. **Memorial NFT**(Step 30): 7回全てPAID後のみ生成。1馬1NFT。メモリアル馬はP2P復帰永久不可
   - **オンチェーン発行(決定049)**: DBレコードのみは却下。永久記念としてチェーン上にミント。チェーン/規格はPolygon PoS / ERC-721を既定とし、Phase 7着手前にオーナー最終確認。ミント用の署名鍵はSecret Manager管理・Cloud Run内でのみ使用

### テスト(仕様必須)

- [ ] 合計ちょうど200 USDT・ちょうど7回
- [ ] Payment 1 は D+1 開始(当日バッチでは支払われない)
- [ ] Payment 7 の端数調整
- [ ] 全支払いPAID後のみMemorial NFT
- [ ] 支払い冪等性・Reserve残高不足時の挙動(EMERGENCY連動)

---

## Phase 8: Purchase / Assignment(精算エンジン)

**目的**: 購入セッション・決定論的割当・所有権移転を実装する(`packages/settlement-engine`)。

### ステップ

1. **Purchase Session(即時資金ロック)**:
   - Marketplace OPEN検証 → 残高検証 → ロック額 = Day6価格 177.16 USDT → USER_AVAILABLE→USER_LOCKED(Ledger) → `PENDING_ASSIGNMENT`
   - キャンセル: バッチロック前のみ。ロック解除もLedger経由
   - **同時セッション上限(決定051)**: 1ユーザー最大10件(最大ロック 1,771.60 USDT)。超過時はエラー
   - **ライフサイクル/EXPIRED(決定043)**: Marketplace Lock前はキャンセル可 → バッチ投入 → 未割当なら返金して**バッチ完了時にEXPIRED**。セッションはバッチをまたいで持ち越さない
2. **馬キュー**(Step 23): `listed_at ASC → current_day DESC → market_tiebreak DESC → horse_uuid ASC`
   - tiebreak = `SHA-256(batch_id + market_pool_id + horse_uuid + assignment_algorithm_version)`
3. **買い手キュー**(Step 24): `created_at ASC → purchase_tiebreak DESC → session_uuid ASC`
   - tiebreak = `SHA-256(batch_id + purchase_session_uuid + assignment_algorithm_version)`
4. **割当実行**(Step 25): 1対1順次割当。**優先順位: ①P2P(Day1-6) ②Day0 Mintフォールバック(ポリシー許可時のみ) ③返金**。VIP/紹介/残高/AI/管理者の優遇は一切禁止
5. **割当精算**: 買い手LOCKED減 → 売り手AVAILABLE増(**手数料0**)、差額返金(`locked − assigned_price`)、所有権はLedger精算完了後のみ移転
6. **Day0 Mintフォールバック**: Mint実行(Horse Generation呼出し・100 USDT)→ 即時Reserve Allocation(Step 26)
7. **未割当返金**(Step 27): LOCKED→AVAILABLEをLedgerで返金
8. **所有権確定**(Step 28)と **Ledger照合**(Step 29): SETTLEMENT_CLEARING == 0 検証

### テスト(仕様必須)

- [ ] 馬キュー・買い手キューの決定論(同一入力→同一順序)
- [ ] P2P最優先・Day0はポリシー許可時のみ
- [ ] 未割当セッションの全額返金
- [ ] Platform Fee 常に0(買い手支払額 == 売り手受取額)
- [ ] 所有権移転はLedger精算後のみ
- [ ] Reserve Allocation(93.60/5.40/0.70/0.30)の正確性
- [ ] current_dayが割当/購入/移転で増えないこと

---

## Phase 9: AI Profit Taking / Economy Status(経済エンジン)

**目的**: `packages/economy-engine` — ポリシー駆動の自動出品と経済ステータス評価を実装する。**AIは推奨のみ、決定はポリシー閾値。**

> **「AI」の定義(決定046)**: 本システムのAIは **Deterministic Policy Engine(決定論的な通常アルゴリズム)** である。LLM(ChatGPT / Claude / Gemini 等の生成モデル)は本番の意思決定経路で全面禁止。

### ステップ

1. **Economy Statusメトリクス計算** — 全メトリクスを決定論的数式として economy_policy_version に定義(決定044):
   ```text
   p2p_match_rate  = Assigned P2P件数 / P2P Listing件数
   rebuy_rate      = Burn後24h以内に再購入したBurn被害オーナー数 / Burn被害オーナー数
   gmv_change_rate = (本日GMV - 昨日GMV) / 昨日GMV
   ```
   残り(cash_coverage_ratio / buyback_liability_ratio / forecasted_cash_coverage)は同形式で数式化しPhase 9着手前にオーナー承認を得る
2. **ステータス判定**(決定論的閾値・v1.0値):
   - 複数一致時は重い方優先(EMERGENCY > WINTER > WATCH > NORMAL)
   - **Stability Rule**: 遷移には2日連続充足が必要。EMERGENCYへの昇格のみ即時。EMERGENCY最低ロック3日。回復は段階的(EMERGENCY→WINTER→WATCH→NORMAL)、直接回復禁止
3. **AI Profit Taking Selection**(Step 21):
   - 対象数 = `floor(eligible × listing_target_rate)`(NORMAL 30% / WATCH 25% / WINTER 15% / EMERGENCY 0%)
   - ソート: `current_day DESC → last_listed_at ASC NULLS FIRST → listing_tiebreak DESC → horse_uuid ASC`
   - tiebreak = `SHA-256(batch_id + horse_uuid + liquidity_policy_version + assignment_algorithm_version)`
   - Owner Listing Limit: 1頭/オーナー → 不足時のみ決定論的緩和パス1回で最大2頭。Pass 3禁止
   - **出品のみ・所有権移転なし**(移転はAssignment精算後)
4. **流動性レポート**(Step 31)と**ストレステスト8種**(Step 32) — 各シナリオは決定論的パラメータで定義(決定045):
   ```text
   Winter 30       : Mint需要 -30%
   Winter 90       : Mint需要 -90%
   Mass Withdrawal : 全ウォレット残高の20%が出金
   ```
   残り(Base / High Survival / Low Burn / P2P Freeze / Buff Overpower)は同形式でパラメータ化しPhase 9着手前にオーナー承認を得る
5. **Tomorrow Economy Status / Tomorrow Policy保存**(Step 33-34): Policy Engineの推奨値はあくまで記録。最終確定は閾値ルール

### テスト

- [ ] 閾値判定の決定論・重い方優先
- [ ] Stability Rule(2日確認・EMERGENCY即時・段階回復・3日ロック)
- [ ] 出品選定の決定論・floor・オーナー上限と緩和1回のみ
- [ ] Burn Target RateがStatusに正しく連動(10.0/10.4/10.8/11.2%)

---

## Phase 10: Admin Recovery

**目的**: バッチ失敗時の安全なリカバリ手続きを実装する(`services/recovery-worker`)。

### ステップ

1. **失敗検知とロック維持**: FAILED / PARTIAL_FAILED → Marketplaceロック継続・アラート発火
2. **二重承認フロー**: FINANCE_ADMIN + SUPER_ADMIN の両承認が揃うまでリカバリ開始不可
3. **Recovery Snapshot**: リカバリ前に状態スナップショット保存(before_snapshot_hash)
4. **Recovery Log**: 誰が・いつ・理由・承認・ステップ・結果を全記録
5. **Recovery Mode制御**: 発動中はCloud Run以外の書込み無効。Admin UIは承認済みリカバリ操作以外読取専用
6. **リトライ制御**: 許可リスト(MLM/Buyback/Refund/通知/レポート/StressTest/TomorrowPolicy/AuditSnapshot)のみ再実行可。禁止リスト(レース再計算・ランキング・Burn・シード・スナップショット・posted Ledger・所有権)は技術的に不可能な設計にする
7. **24時間タイムアウト**: 未完了ならEMERGENCYモード移行+クリティカルアラート

### テスト(仕様必須)

- [ ] 失敗バッチでMarketplaceロック継続
- [ ] 不変ステップの変更不可
- [ ] 二重承認なしでリカバリ不可(単独承認で開始しない)
- [ ] リカバリログの完全記録
- [ ] 24時間タイムアウト→EMERGENCY

---

## Phase 11: APIレイヤ

**目的**: `07_API.md` の全エンドポイントを `/api/v1/` として実装。`packages/api-contracts` にDTO・バリデーション・エラーコード・OpenAPIを整備する。

### ステップ

1. **api-contracts**: 全DTO / zodスキーマ / エラーコード(MARKETPLACE_LOCKED 等12種)/ OpenAPI生成
2. **User API(JWT認証)**: 
   - `GET /me`, `GET /wallet`, `GET /wallet/history`
   - `POST /wallet/deposit`(入金指示の発行), `POST /wallet/withdraw`(Idempotency-Key必須・最低10 USDT・Ledgerロック後放送)
   - `GET /horses`, `GET /horses/{id}`
   - `POST /purchase`(OPEN検証・残高検証・Idempotency-Key・即時ロック), `POST /purchase/{id}/cancel`(バッチロック前のみ), `GET /purchase/{id}`
   - `GET /assignments`, `GET /races`, `GET /races/{id}`, `GET /races/{id}/results`, `GET /races/{id}/replay`
   - `GET /revenge-buffs/current`, `GET /buybacks`, `GET /buybacks/{id}`, `GET /notifications`
3. **Admin API(JWT+ロール検証)**: dashboard / batches / batches/{id}/retry / recovery/{id}/approve / audit / liquidity/reports / stress-tests / policies
4. **Internal API(Cloud Runサービス認証のみ・外部アクセス遮断)**: /internal/batch/start, /internal/race/run, /internal/burn/run, /internal/assignment/run, /internal/buyback/pay, /internal/mlm/pay, /internal/recovery/run, /internal/stress/run, /internal/liquidity/report
5. **冪等性ミドルウェア**: Purchase / Deposit / Withdrawal / Retry / Recovery / 全金融内部操作に Idempotency-Key を強制(キーの保管期間・再送時のレスポンス再生方針を定義)
6. **禁止APIチェックの自動化**: 禁止エンドポイント(POST /race/change, /burn/cancel, /ledger/update, /buyback/change, /revenge-buff/use, /ownership/change, /market/force-sell, /admin/race/recalculate, /admin/seed/change 等)がルーティングに存在しないことをCIで機械検証
7. **管理者ロール管理**: FINANCE_ADMIN / SUPER_ADMIN 等のロール保存(admin_roles テーブルまたはJWTクレーム)・付与/剥奪フロー(付与自体も監査ログ+承認対象)・二重承認は**異なる2名**であることの強制
8. **通知ワーカー(`services/notification-worker`)**: バッチイベント(割当結果・Burn・Buyback支払・Revenge Buff付与等)からの通知生成、`GET /notifications` 用の通知テーブル、Pub/Sub駆動・再試行可(仕様の再試行許可リスト準拠)。「Ledger First / Ownership Second / **Notification Last**」の順序を厳守
9. **API防御層**: レート制限・リクエストサイズ制限・入力バリデーション(zod)の全エンドポイント適用

### テスト

- [ ] 全エンドポイントの正常系/異常系(エラーコード一致)
- [ ] 認証境界(User/Admin/Internal)の侵害不可
- [ ] 冪等性(同一キー再送で二重効果なし)
- [ ] 禁止APIチェックがCIでPASS

---

## Phase 12: 入出金(ブロックチェーン統合)

**目的**: USDT(Polygon PoS)の入出金を、Ledgerを唯一の残高変更経路として実装する。

### ステップ

1. **入金アドレス: HDウォレット方式(決定048)**: ユーザーごとにHD導出の個別入金アドレスを割当(共有アドレスは却下)。導出パス管理・アドレス→ユーザーのマッピングテーブル・マスターシードはSecret Managerのみ
2. **Deposit Watcher**(Cloud Runワーカー): Polygon PoS のUSDT入金検知(全ユーザー個別アドレスの監視)→ 128ブロック確認 → `blockchain_deposits` 記録 → `BLOCKCHAIN_DEPOSIT_CONFIRMATION` Ledger取引でUSER_AVAILABLEへ入金。**Watcherから直接残高更新は禁止**
3. **重複防止**: unique(chain_id, tx_hash)。重複tx_hashは拒否
4. **Withdrawal Broadcaster**: 出金リクエスト(最低10 USDT・Idempotency-Key)→ **Ledgerで資金ロック → その後にブロードキャスト** → 確認後確定。ネットワーク手数料は出金額から控除。高額出金はAdmin Review
5. **鍵管理**: ウォレット秘密鍵・HDマスターシードは Google Secret Manager のみ。署名はCloud Run内。ログ・フロント露出ゼロ
6. **チェーン設定の抽象化**: v1.0はPolygon固定だが、ローンチ前にBSCへ切替可能な設定構造にする(マルチチェーン同時対応はスコープ外)

### テスト(仕様必須)

- [ ] USDTのみ・Polygon PoSデフォルト
- [ ] 重複tx_hash拒否
- [ ] 入金はBLOCKCHAIN_DEPOSIT_CONFIRMATION経由のみ
- [ ] 出金は放送前ロック必須・最低額強制・手数料控除
- [ ] 秘密鍵非露出(コード・ログ静的検査)

---

## Phase 13: フロントエンド

**目的**: `apps/web`(ユーザー)と Admin UI を実装する。**金融ロジック・精算ロジック・Service Role Keyのクライアント側存在は絶対禁止。**

### 13A. ユーザーUI(apps/web)

1. 認証(Supabase Auth連携・JWT)
2. ダッシュボード: 残高・保有馬・アクティブなRevenge Buff
3. ウォレット: 入金指示表示・出金申請・履歴
4. 購入フロー: 購入セッション作成(価格テーブル表示・ロック額説明)・キャンセル・割当結果
5. 馬詳細: 能力・型・レア度・DNA・current_day・戦績
6. トレーニング: 1日1回の選択UI(スナップショット締切の明示)
7. レース: 当日レース・結果・ランキング・**リプレイ検証ビュー**(seed_hash/seed検証の可視化)
8. Buyback: スケジュール・支払い進捗・Memorial NFT表示
9. 通知センター、紹介(リファラル)管理

### 13B. Admin UI

1. ダッシュボード(経済メトリクス・Economy Status・アラート)
2. バッチ監視: 37ステップの進行状況・失敗ステップ・リトライ操作(許可リストのみ)
3. リカバリ: 二重承認フロー画面・Recovery Log閲覧
4. 監査ログ・流動性レポート・ストレステスト結果・ポリシー閲覧(閲覧のみ。編集は新バージョン作成フローのみ)

### 実装上の強制事項

- 全ての金融操作はAPI経由(クライアントに計算・精算ロジックなし)
- Service Role Keyのバンドル混入をCIで静的検査
- Marketplace状態(OPEN/LOCKED)のリアルタイム反映

### テスト

- [ ] E2E: 購入→割当→レース→Burn/生存→Buybackの主要ユーザーフロー
- [ ] クライアントバンドル検査(Service Role Key・金融ロジック不在)
- [ ] Admin権限境界のE2E

---

## Phase 14: テスト総仕上げ / 監視 / デプロイ / 完成ゲート

**目的**: 全Completion Gateを検証し、本番デプロイ可能な状態にする。

### 14A. インフラ本配備

1. **Supabase本番**: マイグレーション適用・RLS有効・接続情報はSecret Manager
2. **Cloud Run**: 全10ワーカーのデプロイ(`infra/cloudrun/`)・サービス間認証・最小権限SA
3. **Pub/Sub**: トピック/サブスクリプション/DLQ構成(`infra/pubsub/`)
4. **Vercel**: apps/webのデプロイ・環境変数(公開可能なもののみ)
5. **Cloud Scheduler**: 20:00 **MYT(UTC+8)** Daily Race Batch起動(決定047)
6. **監視**(`infra/monitoring/`): クリティカルアラート11種(Ledger不均衡 / Clearing非ゼロ / Buyback失敗 / バッチ失敗 / ロック長期化 / Recovery 24hタイムアウト / cash coverage低下 / DLQ / service role異常 / seed検証失敗 / snapshot検証失敗)

### 14B. 100,000ユーザーシミュレーション

1. シミュレータ実装: 10万ユーザー・多日程の購入/割当/レース/Burn/Buyback/入出金を仮想実行
2. 検証項目: Ledger整合(毎日Clearing==0)・Day7到達率〜46.8%目標との乖離監視・Reserve充足・RTP〜98.92%・処理性能(20:00バッチが運用時間内に完了)
3. ストレスシナリオ8種を通しで実行

### 14C. 完成ゲート判定(全PASS必須)

| ゲート | 検証方法 |
|---|---|
| G1 Ledger Integrity | 全テストスイート+シミュレーション期間中の毎日照合 |
| G2 Race Replay | 全レースのreplay==original自動検証 |
| G3 Burn Determinism | floor・上限・下位選定・同点解決の網羅テスト |
| G4 Assignment Determinism | 同一入力での完全順序一致テスト |
| G5 Buyback Payment | 200/7回/D+1/端数のプロパティテスト |
| G6 Recovery Procedure | 障害注入テスト(各ステップ失敗→リカバリ→整合確認) |
| G7 RLS Security | RLS侵害試行テストスイート |
| G8 Forbidden API Check | CIの機械検証+ルーティング監査 |
| G9 Stress Test | 8シナリオ全PASS |
| G10 100,000 User Simulation | 14Bの全検証項目PASS |

### 14D. リリース準備

- [ ] 運用Runbook(バッチ失敗時・リカバリ手順・アラート対応)
- [ ] チェーン最終決定の確認(Polygon PoS or BSC — オーナー判断、ローンチ前のみ変更可)
- [ ] 本番シークレット全件の Secret Manager 移行確認・ローテーション手順の整備
- [ ] 最終セキュリティレビュー(鍵露出・Service Role・RLS)

### 14E. 運用基盤(仕様外だが金融システムとして必須)

- [ ] **ステージング環境**: 本番同構成(Supabase別プロジェクト・Cloud Run別プロジェクト)でのフルバッチ通し検証
- [ ] **DBバックアップ / PITR**: Supabase Point-in-Time Recovery 有効化・復旧演習(Ledger復旧手順のRunbook化)
- [ ] **障害演習**: Cloud Runダウン・Pub/Sub遅延・Supabase接続断の各シナリオでバッチが安全に停止しリカバリ可能なこと

---

## 付録A: 各フェーズ共通の Definition of Done(仕様準拠)

各機能は以下を全て満たすまで「完了」としない:

1. ユニットテストPASS
2. 統合テストPASS
3. Ledger残高検証PASS
4. 金融操作の冪等性テストPASS
5. Race/BurnのリプレイテストPASS
6. RLS/セキュリティチェックPASS
7. クリティカル操作の監査ログ生成
8. エラーケーステスト済み
9. 禁止APIの不存在
10. クライアント側金融ロジックの不存在

## 付録B: 実装してはならないもの(常時チェックリスト)

- AI制御のレース結果 / P2Pプラットフォーム手数料 / 残高直接更新
- 手動Ledger変更 / 手動所有権書換 / Buyback額変更 / Revenge Buff手動使用
- レース結果編集 / Burnキャンセル / シード差替
- Reactクライアントコンポーネント内の金融ロジック / フロントの精算ロジック
- クライアントバンドル内のService Role Key / 秘密鍵の露出

## 付録C: フェーズ依存関係図

```text
Phase 0 ──> Phase 1 ──> Phase 2 ──> Phase 3 ──> Phase 4 ──┬──> Phase 5 ──> Phase 6 ──> Phase 7
                                                          │
                                                          └──> Phase 8 <── Phase 5(Horse Generation)
Phase 6,7,8 ──> Phase 9 ──> Phase 10 ──> Phase 11 ──> Phase 12 ──> Phase 13 ──> Phase 14
```

- Phase 5〜8 は Phase 4 のバッチ骨格の上にステップ実装として載る
- Phase 8 の Day0 Mint フォールバックは Phase 5 の Horse Generation に依存
- Phase 11 は全ドメインパッケージ完成後に薄いAPI層として実装
- Phase 13 は Phase 11 のAPI契約(api-contracts)に依存

## 付録D: マイルストーン目安

| マイルストーン | 内容 | 完了フェーズ |
|---|---|---|
| M1 基盤完成 | モノレポ・DB・Ledger・ポリシー | Phase 0-3 |
| M2 コアエンジン完成 | バッチ骨格・レース・Burn・Buyback | Phase 4-7 |
| M3 経済循環完成 | 購入・割当・経済エンジン・リカバリ | Phase 8-10 |
| M4 プロダクト完成 | API・入出金・フロントエンド | Phase 11-13 |
| M5 リリース判定 | 全Completion Gate PASS | Phase 14 |

## 付録E: 仕様未確定事項の管理台帳

仕様書は「ビジネスルールの発明」を禁止している。未確定事項は該当フェーズ着手前に確認し、決定は `10_DECISION_LOG.md` への追記(オーナー承認)をもって確定とする。

### E-1. 確定済み(2026-07-02 オーナー決定 → Decision 038-051)

| # | 事項 | 決定内容 | Decision |
|---|---|---|---|
| E1 | バッチのタイムゾーン | **20:00 MYT(UTC+8)**。batch_dateもMYT基準 | 047 |
| E2 | レース編成 | **1日1レース・全ACTIVE馬参加**。大規模時は内部分割するが論理的には1レース(単一グローバルランキング) | 038 |
| E3 | weather / track | **race_seedからSHA-256で決定論的導出(Commit-Reveal)**。Weather = SUNNY/RAIN/CLOUDY/STORM。Trackも同一方式。AI禁止 | 039 |
| E4/E5 | condition / fatigue | **日次漸化式**: condition = 前日condition + training − fatigue / fatigue = 前日fatigue + training cost − recovery。仕様範囲にclamp | 040 |
| E6 | 有効な直接紹介者 | **ACTIVEのみ有効**。BANNED/SUSPENDED/DELETED/自己紹介/ループは無効 | 041 |
| E7 | Buyback間隔 | **毎日、D+1〜D+7** | 042 |
| E8 | Memorial NFT | **オンチェーン発行**(永久記念)。DBのみ却下 | 049 |
| E9 | PURCHASE_EXPIRED | Lock前キャンセル可 → バッチ → 未割当は返金 → **バッチ完了でEXPIRED**。持ち越しなし | 043 |
| E10 | 同時購入セッション | **最大10件/ユーザー**(最大ロック1,771.60 USDT) | 051 |
| E11 | 経済メトリクス | **全て決定論的数式で定義**(p2p_match_rate / rebuy_rate / gmv_change_rate は数式確定済み) | 044 |
| E12 | ストレステスト | **全て決定論的パラメータで定義**(Winter30 = Mint−30% / Winter90 = Mint−90% / Mass Withdrawal = 残高20%出金 確定済み) | 045 |
| E13 | AIの実装形態 | **LLM全面禁止。AI = Deterministic Policy Engine(通常の決定論的アルゴリズム)** | 046 |
| E15 | 入金アドレス | **HDウォレット(ユーザー個別アドレス)**。共有アドレス却下 | 048 |
| E16 | 馬名 | **決定論的Name Generator: Bloodline + Prefix + Suffix**(例: Royal Thunder)。画像はv1.0スコープ外(将来SD/Flux) | 050 |

### E-2. 確定済み事項の残パラメータ(実装時にドラフト提出 → オーナー承認)

| # | 残パラメータ | 状態 |
|---|---|---|
| P1 | Weather/Track出現確率・相性表 | ✅ **確定(Decision 053)**: SUNNY40/CLOUDY30/RAIN20/STORM10、GOOD40/FAST25/SOFT25/HEAVY10、タイプ別相性表 |
| P2 | condition/fatigue 数値パラメータ | ✅ **確定(Decision 054)**: 初期80/0、cost 8/8/3、回復5(+7)、race+5、modifier変換表 |
| P3 | 馬名語彙リスト | ✅ **確定(Decision 055)**: Prefix40語+Suffix40語、重複はローマ数字付与 |
| P4 | 残り経済メトリクス数式 | ✅ **確定(Decision 058)**: 30日窓・Liquid Reserves定義・予測は7日平均Mint数の決定論計算 |
| P5 | 残りストレスシナリオ | ✅ **確定(Decision 059)**: 全8種の入力・30日ホライズン・合格基準・Status連動 |
| P6 | Memorial NFTのチェーン・規格の最終確認 | ✅ **確定(Decision 063)**: Polygon PoS / ERC-721、Buyback7回完了後にMint、メタデータ11項目、転送可(ゲーム復帰なし) |
| P7 | LUCKトレーニングの定義 | ✅ **確定(Decision 052)**: (a) LUCK型が任意のトレーニング実施でrandom範囲 -2.00/+4.00 |
| P8 | horse_type_modifier の算出方法 | ✅ **確定(Decision 056)**: v1.0では0.00固定(相性表で表現済み・二重計上回避) |

### E-3. 未確定(オーナー判断待ち)

| # | 未確定事項 | 詳細 | ブロックするフェーズ |
|---|---|---|---|
| E14 | 大口出金のAdmin Review閾値 | ✅ **確定(Decision 060)**: 1,000 USDT以上・FINANCE_ADMIN+SUPER_ADMINの2名承認(Recovery同等) | 確定済み |
| E17 | 通知の種類と文言 | どのイベントで何を通知するか。フロントUX copyはOpen Item扱い | Phase 11, 13 |
| E18 | KYC / コンプライアンス要件 | 対象国(マレーシア)の規制対応が必要かはオーナー判断 | ローンチ前 |

追加確定(2026-07-03): 出金手数料=実費ガス精算・Revenue計上禁止(**Decision 061**)/ Polygon PoS・128確認で確定、RPCはQuickNode推奨(**Decision 062**)/ 出金APIは小数6桁制限(**Decision 064**)

> **運用ルール**: 未確定事項に到達したら実装を止めて確認する。仮実装が必要な場合は必ず「ポリシーバージョン/設定値」として外出しし、後から仕様確定値に差し替え可能な構造にする。
