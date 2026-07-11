# セッション引継ぎ書(2026-07-11)

> 前セッション(LPリデザイン〜プッシュ配信基盤)の完全な引継ぎ。次のセッションはここから開始する。
> 全体の正典は `HANDOVER.md` + `docs/10_DECISION_LOG.md`(最新=Decision 084)。本書は今日の増分と現在地。

---

## 0. 現在地(2026-07-11 時点のスナップショット)

- **本番**: sevendaysderby.com(Render Web Service `sevendays`)+ ワーカー(`sevendays-worker`・非公開)+ Supabase。**両サービスともデプロイ成功済み**(最新コミット `842625c`)
- **Renderワークスペースは Pro プラン**(HobbyのビルドZ分枯渇で一度ブロック→オーナーがアップグレード済み)
- **管理者**: bobbielluegemrw3@gmail.com(Gmail=Googleログイン可)。第二管理者 kusanokiyoshi1@gmail.com
- **ゲート**: `pnpm exec turbo run build test lint typecheck` = **76タスク全緑**が正
- **運用ルール**: 実装→検証→オーナーへ報告→許可を得てからコミット→プッシュ(Render自動デプロイ5〜10分)
- settlement-engineのテストはスイート全体実行時に稀にフレークする(単体再実行で緑を確認する)

## 1. 今日やったこと(コミット順)

| コミット | 内容 |
|---|---|
| `3285100` | **LPリデザイン本番反映** — デザイナー正典ZIP(`lp_redesign/`+ `handoff-lp`)の10セクションを `Landing.tsx`/`landing.module.css` に全面移植。①HERO/②Play Game Flowは従来同値、③〜⑩新設(厩舎宣言/20:00ショー/取引/DAY7/チーム/ショーケース/台帳/最終CTA)。`LandingReveal.tsx`(IOによるスクロール出現)新設。旧COLLECTIONの架空統計削除→SHOWCASE正直ラベル |
| `0b0f4a6` | LP磨き — ⑩ゲート馬=実アートの黒シルエット+シアン縁光(案1・比較ページ `/dev/lp-gate-preview`)、モバイル修正(③厩舎レール148px横スクロール化・⑦チーム図1列)、⑧価格を実在値に(Mint 102.00手数料込+PRICE_TABLE_V1のDAY1-6・USDT併記・DAYチップ。**P2P 2%手数料は売り手側控除**なので買値はラダー値そのまま) |
| `35da97b` | モバイル最終CTA: シルエット馬が上・CTA文言が下(`order`のみ) |
| `bdf2cff` | **Decision 083: ログインGoogle一本化・/login削除** — 全CTAが`GoogleLoginButton`(公式ダーク黒)でOAuth直起動。ヒーローのボタンだけ見た目不変(変更禁止)で動作のみ差し替え。MetaMask/メール+パスワードUI撤去(バックエンドとuser_wallets・/account連携は温存=将来の記念NFT引き出し先)。未認証は`/`へ。使い方①とCS knowledge更新。AUTH_SETUP.md §0 |
| `7838a25` | メニュー+ダッシュボード整理 — HOME→**DASHBOARD**、ゲーム9リンク(英)/ユーティリティ4リンク(日・控えめ)をセパレーターで分離、**通知未読バッジ**(layoutで取得)。ダッシュボード: 設計資料の丸数字①〜⑤削除、今夜タイルに「今夜のショーを見る→」シアンCTA、タスクに「アイテムを備える」、チャンピオン報酬タイル複数件対応+CHAMPIONリンク |
| `ceab3da` | **ダッシュボード再構成+PWA** — 通知タイル廃止(ナビバッジに一本化)、厩舎=要約ストリップ(アート/名前/レアリティ/Day/調教。狭幅はレアリティ省略)、ヘッダー「馬を迎える▶」=購入セッション直接作成。PWA: manifest+アイコン4種(manusアートから生成済み `public/icons/`)+`public/sw.js`(**キャッシュ一切なし**・push受信のみ)+`PwaSetupTile`(iOS=ホーム画面追加手順/他=通知ONボタン/済=READY) |
| `842625c` | **Decision 084: プッシュ配信基盤** — 詳細は§2 |

## 2. プッシュ通知システム(Decision 084)— 仕組みの要点

- **テーブル**: `push_subscriptions`(endpoint一意・削除せずdisabled_at・fail_count8で自動無効・404/410即無効)/ `push_broadcasts`(`broadcast_key`一意=冪等クレーム・削除禁止トリガー)。マイグレーション `20260711100000_push_notifications.sql` **本番適用済み**
- **API**: `/api/v1/push/public-key` `/subscribe` `/unsubscribe`(user認証)。クライアントは`PwaSetupTile`が許可済みなら購読を自動同期
- **①レース5分前リマインド(オーナー指定)**: render-workerのスケジューラーが**19:55〜20:00 MYTの窓で毎分** `/internal/push/race-reminder` を試行 → `race-soon:{date}` クレームで**1晩1回**。文面は時刻非依存「まもなく発走 — あと5分で…」(どのタイムゾーンでも受信=5分前)。**フォールバック**: 窓を丸ごと逃した夜だけ `/internal/batch/start` が20:00に `race-start:{date}` を送る(両方送られることは構造的にない)。TTL1時間・URL /races
- **②CSメルマガ同時配信**: 既存 `/api/v1/admin/cs/broadcast`(Decision 081)に `push` フラグ。タイトル=メール件名(60字切詰)・本文は固定の日英「お知らせが届きました…」・`cs:{broadcastId}` で冪等。**TESTモードは管理者自身の購読端末のみ**(`onlyUserId`フィルター)。管理UI(サポート→一斉送信タブ)にチェックボックス+結果に「プッシュ◯件」。**独立の配信フォームは作らない**(オーナー指摘によりCSシステムへ統合)
- **VAPID鍵**: 環境変数 `VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT`。**RenderのWeb・ワーカー両方+ローカル`apps/web/.env.local`に設定済み**。未設定環境ではスキップ(無害)
- **設計原則**: 送信はベストエフォート — どんな失敗もバッチ/メルマガを絶対に落とさない。送信は`web-push`を注入可能トランスポートで包み、テストはスタブ(`test/push.test.ts`)
- **SWにキャッシュを足さないこと**(古い画面事故の防止が設計意図)

## 3. 未検証(次セッションの最初に確認したいこと)

1. **今夜19:55 MYTの初回リマインド実配信**(ワーカーのログに `[scheduler] /internal/push/race-reminder -> 200 ...` が出る。`push_broadcasts`に`race-soon:{date}`行)
2. **メルマガプッシュのTEST**: 管理画面→サポート→一斉送信→「プッシュ通知も同時に送る」→テスト送信(自分宛て)。事前にその端末で一度ダッシュボードを開き購読同期させること
3. iPhone実機でのPWAインストール→通知ON→受信の一連の流れ
4. ジッター+予報シード由来条件の実バッチ(ADR-012)は稼働開始済みのはず — 台帳の採用BURN率チップとショー最終幕の予報表示を実データで確認

## 4. 継続中のオーナー側ペンディング

- **弁護士レビュー**: `PRELAUNCH_COPY_RISKS.md` R1(投資商品に見える)/R2(7日間物語のズレ)+予報の免責文言
- **ティア/アイテム価格の再調整**: 実売データが溜まってから(シミュレーターはコミット済み `scripts/tier-sim.mjs`)
- **CHAMPION LEAGUE**: アクティブ10,000人で開幕(COMING SOON表示済み)
- **i18n**: 方針合意済み(文言安定後にADR1本で基盤固定→next-intl想定→トラフィック順に1ページずつ。ショーの実況文言が最難関。管理画面は日本語のまま)。着手はオーナー指示待ち
- **MLM改定**: 着手禁止(オーナー詳細待ち)のまま

## 5. 次の作業候補(オーナーの流れ)

オーナーは**ページ単位の監査→修正**を進めている(トップ→ログイン→ダッシュボード完了)。次は RACE / MARKET / ITEMS / TEAM / WALLET 等の指示が来る可能性が高い。監査の型:
1. 該当View/pageを読み、実装事実と表示の整合(架空値・古い文言・禁止語彙)をチェック
2. `/dev/*-preview` +puppeteerスクショ(1440/375px・横スクロール有無)で実測
3. 発見事項を表で報告→オーナーが直す範囲を決める→実装→ゲート→報告→許可→コミット

**Render Build Filters**(ビルド分節約)も提案済み・オーナー興味あり: Web=`apps/web/**`+`packages/**`、ワーカー=`services/**`+`packages/**` 変更時のみビルド、という設定値を渡す。

## 6. 環境・道具のメモ

- 開発サーバー: `localhost:3000` が既に稼働していることが多い(ポート使用中エラー=既存を使う)。CSS反映しない時はシークレットウィンドウ
- スクショQA: scratchpad `qa/` に puppeteer-core スクリプト群(`lpshot.mjs`=フルページ+横スクロール検査、`lpcrop*.mjs`=セクション切出し、`gen-icons2.mjs`=アイコン生成)。Chrome実行パス `C:/Program Files/Google/Chrome/Application/chrome.exe`
- マイグレーション適用: リポジトリ直下`.env.local`を環境変数に読み込み→`pnpm exec supabase --workdir infra db push --yes`(Docker警告は無害)
- コミット末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 語彙(ユーザー向け禁止): 賭け/ベット/オッズ/配当/ギャンブル/予想/MLM/ネットワーク報酬/コミッション/紹介報酬 → 予報/備え/チーム/サポートボーナス。BURN率のパーセント宣言もしない(台帳が証拠)
- CSS Modules: `s.in`等の予約語プロパティは `` `${s.in}` `` で包む(exactOptionalPropertyTypes対策)。新規UI文言はi18n将来対応を意識しコピーの分離がしやすい書き方で

## 7. 正典ドキュメントの所在

| 主題 | ファイル |
|---|---|
| 全体引継ぎ+Decision Log | `HANDOVER.md` / `docs/10_DECISION_LOG.md`(〜084) |
| 認証(Google一本化) | `AUTH_SETUP.md`(§0が現行) |
| LPリデザイン | `lp_redesign/LP_REDESIGN_BRIEF.md` + `lp_redesign/shots/canon_*.png` |
| ショー演出 | `DAILY_DERBY_HANDOVER.md` |
| CSシステム | `CS_SETUP.md`(メルマガ=cs_broadcasts) |
| 経済/インフラ/マーケット/アイテム/MLM | `ECONOMY_REVISION.md` / `INFRA_REVISION.md` / `MARKETPLACE_REVISION.md` / `ITEM_REVISION.md` / `MLM_REVISION.md` |
| ローンチ前コピーリスク | `PRELAUNCH_COPY_RISKS.md`(R1/R2) |
| NFTアート | `NFT_ART_HANDOVER.md` |
