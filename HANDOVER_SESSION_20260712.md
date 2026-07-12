# セッション引継ぎ書(2026-07-11午後〜07-12)

> 前の引継ぎは `HANDOVER_SESSION_20260711.md`(LP〜プッシュ配信)。本書はその後の増分と現在地。
> 全体の正典は `HANDOVER.md` + `docs/10_DECISION_LOG.md`(**最新 = Decision 088、次は089**)。

---

## 0. 現在地(2026-07-12 時点)

- 本番: sevendaysderby.com + sevendays-worker + Supabase。最新コミット `e5b3442` までデプロイ済み
- ゲートの正: `pnpm exec turbo run build test lint typecheck` = **76タスク全緑**(settlement-engineはスイート同時実行で稀にフレーク→単体再実行で緑確認)
- 運用ルール不変: 実装→検証→報告→**許可を得てコミット**(Render自動デプロイ5〜10分)
- オーナー実績: ローンチ日(7/4)の2頭が両方Day7走破→**チャンピオン報酬支払い進行中**(本番DBで確認済み)
- **明日(7/13)弁護士レビュー**: 資料は `legal_review/`(12枚スライドHTML+PDF)

## 1. この期間のコミット(古→新)

| コミット | 内容 |
|---|---|
| `96dbad8` | PWA導線の初心者対応(iOS3ステップチップ/Android`beforeinstallprompt`/ブロック時案内) |
| `3f1c491` | PWAアイコンを馬アート→ブランドロゴに(`?v=2`キャッシュ対策) |
| `d0f27e2` | **Decision 085 購入ファネル**: 購入は/marketのみ。SHOWCASE(実成約SOLD)→残高連動の予約パネル(最大N頭・`POST /purchase {count}`・冪等キー`{key}#i`)→待機案内+予約受付メール。指名購入なしモーダル。「購入セッション」→「購入予約」全面改称 |
| `6f27905` | **Decision 086/087**: 出品方式の必須選択(初回モーダル・`user_trade_settings`・未選択は自動出品されない)/AUTOトグル(ダッシュボード+market)/自動購入予約=バッチ後ワーカースイープ`/internal/market/post-batch`(冪等・売却メール`mail_claims`)/通知19種化(HORSE_SOLD・AUTO_LISTED・AUTO_RESERVED)/売れ残りSMART出品は毎晩自動取り下げ(価格ズレ防止)/手動出品中はMLMティア母数から除外。マイグレーション`20260711110000_trade_settings.sql`本番適用済み |
| `941c574` | 厩舎監査: `GET /horses`に`listing`+limit500、手動出品中は「出品中」セクションへ(今夜走らない明示)、**チャンピオン金枠NFTギャラリー**、BURNED分離 |
| `f3b70f8` | 馬詳細監査: `GET /horses/:id`に`listing`+`history`(全戦績)。手動出品中は調教/アイテムUI非表示+**APIガード`HORSE_MARKET_LOCKED`**。能力バー絶対スケール+日本語ラベル、cond/ftg整数表示、翌日価値表示、レアリティ凡例(`RarityLegend`・実定数)を厩舎/詳細/market3箇所に |
| `3aff16d` | **Decision 088 調教UX**: 3枚カード(相性加点+3〜5/疲労±を実定数表示・おすすめ=`recommendedTrainingV1`疲労60で回復)/一括調教`POST /horses/train-all`/「無料·1日1回」vs「任意·ショップ購入制」の区分。**完全自動調教は不採用**(相対戦で無意味化+日課の儀式を守る — 088に理由記録) |
| `51288b4` | **馬詳細v2ハンドオフ適用**(`horse_redesign/`正典): MASTHEAD/HERO ROW(アート|調教横並び)/**VALUE LADDER**/LOWER ROW/PROVENANCEの5段構成・状態別右パネル。納品からの差分は`import type { JSX } from 'react'`1行のみ(React 19対応) |
| `13737c4` | **devプレビュー13ページを本番で管理者にも公開**(`requireDevPreviewAccess`: dev常時/本番はis_adminのみ・他404)。pages-previewに馬詳細全7状態。※実ページへのサンプル馬DB投入は危険なので不採用(ACTIVEサンプルは実レースに出走・記念馬サンプルは公開殿堂に載る) |
| `c6b944d` | 調教ボタン余白(`form.stack`→div化でグローバルCSS外れが原因)+レアリティ凡例を等幅グリッドに |
| `6cfcea5` | オーナー指摘5件: SHOWCASE注記余白/アイテム条件グリッド6→4+2列(設定1〜6の残骸)/**チャンピオン演出: metallicモードで未使用のGLB11.4MBロードを丸ごとスキップ**(renderer.js・`?v=20260712a`)/招待リンク1cカード化/組織マップに`TIER_RAIL_W=112`ガター(バッジ被り解消) |
| `71b4fac` | **iOSフォーカスズーム根絶**: globals.cssに`@media(max-width:767px){input,select,textarea{font-size:16px!important}}`(全サイトの入力欄が16px未満だった) |
| `d269399` | アイテム上部の単調シアン解消: 条件の意味色(晴=金/曇=紫灰/雨=シアン/嵐=マゼンタ、馬場・コースも)。本日の条件カードは当日天候色でティント |
| `9fa3bff` | 通知/アカウント/お問い合わせ改善: 通知=ダイジェスト+日付グループ+全19種リンク+チップ+**既読API`POST /notifications/read`(開いたら自動既読・`is_broadcast`は未読数から除外)**/アカウント=記録5タイル+設定(AUTO・PWA再配置)ハブ/コンタクト=FAQ・カテゴリチップ+2カラム |
| `d6dd024` | 弁護士レビュー資料(`legal_review/slides.html`+PDF12枚・質問12問) |
| `e5b3442` | **3ページv2ハンドオフ適用**(`redesign1/`正典): AccountView v2(連携の`:global()`意匠化含む)+通知/コンタクトCSS磨き。無変更適用 |

## 2. 新しい重要システム(次セッションで知らないと危ないもの)

- **売買自動化(086)**: `user_trade_settings`(auto_list/auto_reserve/auto_reserve_max null=MAX)。Smart選定母数は`auto_list=true`のみ。auto_list OFF切替で既存SMART出品に`cancel_after_batch`。バッチ後スイープはrender-workerが当日COMPLETED確認後1回dispatch(全冪等・再実行無害)
- **通知の既読**: 個人宛のみ既読化可能。ブロードキャスト行(user_id null)は共有のため`is_broadcast`で除外(バッジ計算はlayout.tsx)
- **調教の数理**: 攻め=+8疲労/晩、回復=−4。疲労はスコア−5+コンディションを疲労値ぶん削る複利。`recommendedTrainingV1`が正典
- **devプレビュー**: 本番でも管理者ログインで閲覧可(オーナーへの案内済みURL: /dev/pages-preview, /dev/stable-preview, /dev/market-preview, /dev/dashboard-preview)
- **禁止事項の追加実装**: 出品中(手動)馬への調教/アイテムはAPIで409 `HORSE_MARKET_LOCKED`

## 3. 未検証(次セッション最初に)

1. **前回からの持ち越し**: 19:55プッシュリマインド実配信/メルマガプッシュTEST/iPhone実機PWA(アイコンはロゴ版に変更済み→再追加が必要)
2. **バッチ後スイープの実動**(7/12夜以降): ワーカーログ`[scheduler] /internal/market/post-batch -> 200`、auto_reserveユーザーの自動予約+メール、売却メール
3. **売れ残りSMART出品の自動取り下げ**(087)が夜間に効いているか(market_listingsのSMART残留がないこと)
4. 初回選択モーダル(086)が本番の既存アカウントに出て保存できるか
5. チャンピオン演出の体感速度(GLBスキップ後)— 遅ければ次の一手: スプライトpreload/three.jsセルフホスト

## 4. ペンディング(オーナー側)

- **弁護士レビュー(7/13)** → 結果次第で: 規約/特商法表記ドラフト・KYC方針・表現ガイドライン反映
- `LEGAL_REVIEW_MEMO.md`が**空ファイル**(参照されているのに0バイト)→ スライドの質問集を元に埋めるべき
- HANDOVER.md本体の「次のDecision番号」等が古い(085以降未反映)— 大改訂は次の区切りで
- MLM改定は着手禁止のまま/i18n指示待ち/CHAMPION LEAGUEは1万人で開幕

## 5. 環境・道具(追記分)

- QAスクリプト置き場はセッション毎のscratchpad(`qa/`にpuppeteer-core+sharpをnpm install して使う)。Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`
- 本番DB読み取りはnode+pg(`.env.local`のSUPABASE_DB_PASSWORD→pooler接続)。読み取り専用厳守
- PDF生成: puppeteer `page.pdf({landscape:true, format:'A4', scale:0.8})`で1スライド=1ページ
- コミットメッセージはファイル経由`git commit -F`が安全(ヒアドキュメントはBashツールで事故った実績あり)
- 正典追加: `horse_redesign/`(馬詳細v2)・`redesign1/`(アカウント/通知/コンタクトv2)・`legal_review/`(法務資料)
