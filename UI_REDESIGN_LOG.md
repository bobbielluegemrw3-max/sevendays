# UI刷新の軌跡(2026-07-05 〜 07-06)

> Seven Days Derby のフロントエンド全面刷新の記録。馬素体の全面差し替えから、
> ログイン後全ページのリデザイン適用・100点診断までの経緯・判断・教訓を時系列で残す。
> 関連: `HANDOVER.md` / `HORSE_BASE_REBUILD_HANDOVER.md` / `HORSE_VISUAL_SYSTEM.md`(§7=描画エンジン正典)

---

## 全体サマリ

| # | フェーズ | コミット | 内容 |
|---|---------|---------|------|
| 1 | 新素体の検収と差し替え | `ffc4b22` | Manus新スタイル batch01R/02R(24体)検収 → オーナー除外選定 → 採用18体へ全差し替え+純色モード+ショーケース見た目分離 |
| 2 | /dashboard ルート化+全面改修 | `0d85e6c` | ログイン後URLを `/dashboard` に分離。結果/調教/価値/通知を実データ結線、PC 2カラム化、CSS Modules潜在バグ修正 |
| 3 | ダッシュボード 1c デザイン適用 | `d5aad94` | Claudeデザイン納品(Option 1c bento)を適用+hero.png を新素体で再生成 |
| 4 | ヘッダー統一 | `4989afc` | ログイン後ロゴをLPロックアップに統一(名前の不一致を解消)+モバイル2段ヘッダー |
| 5 | 全ページリデザイン+100点診断 | `a1b5c4f` | 10パッケージ(全ログイン後ページ+admin 5画面)適用+レスポンシブ全数監査→6件修正 |

---

## 1. 馬素体の全面差し替え(`ffc4b22`, 07-05)

- **中間検収**(batch01R=base_01〜12 / batch02R=base_13〜24): 納品QAを鵜呑みにせず独立検証
  - 全レイヤー 2048px RGBA / coat・mane_tail のグレースケール性 0.00% / 不透明率の申告値突合
  - **v1の再発チェック**: mane_tail不透明背景バグ → なし(独立着色合成で確認)
  - セーフマージン四辺40px以上(batch01Rのbase_09が2pxだったため02Rから仕様化。自動矯正機構がManus側に入った)
  - 検証資産: スクラッチパッド `batch01R/verify2.py`(汎用検収スクリプト)
- **オーナー除外選定**: `horse-bases-sheet-v3.html`(ローカル専用)で24体を提示 → **除外 02,05,13,14,18,23 → 採用18体**
- **差し替え**: 旧31体全廃 → 新18体(512px)+`bases.json`+`horse-visual.ts` の `BASES` を同一コミットで更新
- **ヒーロー**: オーナー指定で `base_24`(power_stride / V4ガンメタ)に変更
- **色生成の改良**(オーナー要望):
  - **純色モード**: 約24%の馬は全身1色(真っ赤/真っ青/真緑/真っ黄、Black/White系は真っ黒/真っ白)。名前↔色相の一致は不変
  - **pickShowcase 見た目分離**: 色相36°未満却下 / 配色ペア(主色+アクセント)重複却下 / dark・pale系は各1頭まで — 「同系色が並ぶ」事故を根絶
- **残**: batch03R(base_25〜36)は保留中。希少ポーズ(Rear/Bow/Pegasus)を含めるかは未決

## 2. /dashboard ルート化+ダッシュボード全面改修(`0d85e6c`, 07-05)

- **問題**: ログイン後もURLが `/` のまま(ルートでLanding/Dashboardを出し分け)
- **修正**: `/dashboard` 新設。`/`=常にランディング(ログイン済みは307)。ログインフロー・OAuthコールバック・ナビの着地も `/dashboard` へ
- **ダッシュボードの機能ギャップ分析**(「プレイヤーの5つの問い」): 昨夜の結果 / 今夜まで / 今日やること / 資産 / 通知 → 当時は1つしか満たしていなかった
- **実装**: 昨夜の結果セクション、調教済/未バッジ、現在価値(PRICE_TABLE_V1)、タスク帯、locked残高、通知プレビュー、決定論馬アート
- **API追加**: `GET /horses` に `dna_hash` + `trained_for_next_race`(07_API.md追記済み)
- **エンジン拡張**: `deriveHorseArt(dna_hash, name, rarity)` — 実馬の絵を実名Prefix+実レアリティで決定論導出
- **構造**: Dashboard を「取得層+View(表示層)」に分離 → フィクスチャによる視覚QAが可能に

## 3. Claudeデザイン Option 1c 適用(`d5aad94`, 07-06未明)

- 外部のClaudeデザインにGitHub URL+制約付きプロンプトで依頼 → ZIP納品(DashboardView+CSS+仕様書)
- 適用時にカスケードバグ1件修正(`.rar` の `display:inline-flex` が `.inlineRarity{display:none}` を後勝ちで打ち消し → `.hcard` で詳細度アップ)
- `hero.png` を新素体base_24(LPヒーロー配色)で再生成、旧静止画3枚(gold/chrome/onyx)削除

## 4. ヘッダー統一(`4989afc`, 07-06)

- **問題**: LPとログイン後でロゴが別物(「SEVEN DAYS / DERBY」vs「SEVEN DERBY」)
- **修正**: ログイン後ナビをLPロックアップに統一。`TopNav.tsx` に分離
- **モバイル**: 成り行き折返しだったナビを2段構成に(ロゴ+ログアウト/リンク行)。390pxで6リンクが1行に収まるよう調整、以下は横スクロールフォールバック

## 5. 全ページリデザイン+100点診断(`a1b5c4f`, 07-06)

- **納品**: 10パッケージ(01=dashboard更新 / 02=/horses / 03=/horses/[id] / 04=/races系 / 05=/wallet / 06=/purchase / 07=/notifications / 08=/buybacks系 / 09=/account / 10=/admin+4サブ)
- **適用方針**: 全page.tsxを「薄い取得層→View」に統一。既存アクション部品(TrainingForm/WithdrawForm/PurchasePanel/AccountLinking/BatchRetryButton/WithdrawalReviewActions/RecoveryActions)は**無変更で内包**
- **納品側の不具合を検収で検出・修正**: HorseDetailの `.heroDay` リテラルclass(:global漏れ)/ admin/layoutのCSS importパス / 未使用import 2件 / 01-dashboardは既知バグ再同梱のため現行優先
- **100点診断**(オーナー指示: PC/モバイル徹底チェック):
  - CDPエミュレーションで **10幅(320〜1680px)× 6ページ** の横はみ出し全数計測
  - リテラルclass vs `:global()` カバレッジの機械照合
  - 検出6件を修正: admin操作ボタン見切れ(≤390px・操作不能=最重要)/ リカバリ理由文の折返し / 厩舎過去馬320px / レース行320px / 購入価格セル320px / **ランディングの8px横ガタつき**(旧 `width:100vw` ハック→ `main:has(>.landing-bleed)` に置換、見た目不変)
  - 最終: **全60ケース ALL PASS** / lint / tsc / build(30 chunks)/ テスト10件 全PASS

---

## 視覚QAインフラ(本番404・ログイン不要)

| ルート | 内容 |
|---|---|
| `/dev/dashboard-preview` | ダッシュボード(リッチフィクスチャ) |
| `/dev/stable-preview` | 厩舎(34頭・全状態) |
| `/dev/pages-preview` | 馬詳細〜アカウントまで9ビュー一括 |
| `/dev/admin-preview` | admin全5ビュー+ナビ |
| `/dev/nav-preview` | ログイン後ヘッダー |

検証スクリプト(スクラッチパッド、セッション消滅に注意 — 必要なら再生成可能):
`audit-responsive.mjs`(多幅はみ出し監査)/ `audit-deep.mjs`(オフェンダー特定)/ `capture-full.mjs`(フルページ撮影)/ `verify2.py`(素体検収)

## 教訓(次のセッションへ)

1. **CSS Modulesは子孫セレクタ内のリテラルclassもハッシュ化する** — JSXのリテラルclassは `:global(.x)` で受ける。初版UIの大量スタイル欠落の原因。納品物にも繰り返し混入するので検収必須
2. **display切替は詳細度を1段上げる** — 同一詳細度の後続ルール(`.rar{display:inline-flex}`等)に `display:none` が潰される
3. **ヘッドレスChromeは最小ウィンドウ幅500pxにクランプ** — `--window-size=390` のスクショは「500px描画の390px切り取り」になり偽のはみ出しに見える。モバイル検証は必ずCDP `Emulation.setDeviceMetricsOverride`
4. **`width:100vw` はスクロールバー幅ぶんはみ出す** — 全幅化は `main:has(>.landing-bleed)` のようにコンテナ側を外す
5. **CDPのPage.navigateはdev再コンパイル中に失敗しても沈黙する** — 計測前に `location.pathname` の一致を確認
6. **納品物のQA数値は独立再計測する** — 素体検収もUI検収も、この方針で毎回実害バグを検出できた

## 現在地と残作業

- ログイン後全ページ+LP+adminが 1c デザイン言語で統一済み。本番=sevendaysderby.com(mainへのpushで自動デプロイ)
- **UI残**: batch03R素体(納品待ち・希少ポーズ判断)/ マケプレ実DB結線(`PRELAUNCH_COPY_RISKS.md` R2)/ ブラウザE2E
- **UI外の残**: HANDOVER.md参照(チェーンenv投入・2人目管理者・G1-G10・キーローテーション等)
