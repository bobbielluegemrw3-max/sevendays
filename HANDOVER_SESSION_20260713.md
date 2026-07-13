# セッション引継ぎ 2026-07-13(スパイク対策仕上げ → 管理画面刷新 → Decision 089/090)

> 前セッション: `HANDOVER_SESSION_20260712.md`(購入ファネル085-088・全ページ監査・弁護士資料)。
> 本書は 2026-07-12夜〜07-13 のセッション記録。正典の序列: `HANDOVER.md` → セッション別本書 → `docs/`+Decision Log。
> Decision Log は **090まで起票済み・次は091**。

## 1. このセッションでやったこと(コミット順・全て main へpush済み)

### インフラ/性能(c552094〜736e4ea)
- **20:00スパイク対策**(`c552094`): derby status共有部プロセスキャッシュ(`DERBY_STATUS_CACHE_MS`既定2000)・ナビバッジ`unread-count`化・非サージャブル述語の範囲化+索引4本(migration `20260712130000`適用済)・`WEB_DB_POOL_MAX`。運用手順は **`SCALING_PLAYBOOK.md`**
- **Cloudflareプロキシ化 完了**(オーナー操作・B-2): オレンジ雲+Full(Strict)+`/api/`レート制限60req/10s/IP。CDNは拡張子ベースで自動HIT確認済み。**B-1(Render starter→Standard)はリリース前にやる約束(未実施)**
- **ページ遷移高速化**(`56d853e`): 認証4クエリ→1(CTE統合)・`loading.tsx`16ルート(ブランドスケルトン`PageSkeleton`)・`staleTimes.dynamic=30`・ナビSuspense化。根治策=Supabaseムンバイ→SG移行はリリース前夜向きの大作業として保留

### レース/チャンピオン(0e5f292〜db3dcef)
- **チャンピオンヒーロー動画化**(`0e5f292`): WebGL(初回〜15秒)→**60fpsループ動画4.1MB**(`/champions/hero-loop.mp4`)。30fpsはギャロップ周期と干渉し1秒ごとにカクつく(オーナー実機指摘→60fps再録画で解決)。再生成手順はコミットメッセージ&`ChampionHero.tsx`コメント。**将来の高品質動画はmp4差替のみ**(Seedance生成は品質不足でボツ)
- **/races 本番モード固定**(`db3dcef`): `DAILY_DERBY_LIVE` env**廃止**。プロトタイプは`/dev/derby-preview`(管理者のみ)に残存し、**ADMINメニュー「デモ上映」**から到達 — 20:00を待たずに演出上映可

### 管理系(7fe1458〜ccdf067)
- **Decision 089**(`6e3c4d3`): fund-grant **≤1,000 USDTは管理者1名で即時付与**(台帳`postSingleApproverAdjustment`が上限+ロール再強制・監査必須)・超は従来の二重承認。DB制約緩和 migration `20260713010000` 適用済。原資はテストネット暫定で`PLATFORM_DEPOSIT_CLEARING`(**メインネット移行時に要復帰** — HANDOVER.mdチェックリスト記載)。憲法81行目に改定注記済み
- **管理画面 Ops Console 全面リデザイン**(`ccdf067`): 全10ビューをハンドオフ(`admin_redesign/`保存)通りに刷新 — 本物の`<table>`・状態4色ピル・絵文字廃止・720px以下はmcardカード化(横スクロールなし実測)。共有アクションボタンは/admin内だけ静音スタイルに上書き。台帳サブテーブルはモバイル横スクロール退避(意図的逸脱・仕様書§4の例外)

### PWA/スプラッシュ(1f5cb70〜f975b24) ⚠️重要な教訓
- iOS `apple-touch-startup-image` は**宣言するとiPhone 14 Pro実機で白い起動画面にリグレッション**(未宣言ならスナップショット起動で白は出ない)→ **全リバート済み(`657a32e`)。再挑戦しないこと**
- 代わりに**Webオーバーレイ方式**(`f975b24`・ゴリラ予想 dmarket/web/components/Splash.tsx の移植): `Splash.tsx`+`splash.module.css`、0.9秒+フェード0.4秒、sessionStorageでセッション1回。PWA起動でも確実に出る
- 副産物: アカウントページの連携テーブルnowrapはみ出し修正(`1f5cb70`・実測scrollWidth=375)

### レース待機パドック(2ea71c2〜7976ecc)
- 待機画面(1日の大半)を「時計だけ」→**パドック**へ: 出走馬カード常設(既存TonightEntryCards再利用)・**今夜の予報`tonight_forecast`**(APIに追加 — 従来は明日分しか取得せず日中誰にも予報が出ないバグだった)・馬ゼロは招待カード(→/market)・昨夜の自分の結果チップ・FINAL HOUR/GATES OPENING SOON段階演出。調教リマインドは`my_horses`にEXISTSで`trained_for_next_race`を同乗(往復増なし)。**背景動画はオーナー判断で撤去済み**
- /racesリロード時の素の「接続中…」→ブランドスケルトンに統一(`7976ecc`)

### MLM(5997441) — Decision 090
- **運営ルートチェーン構築(本番適用・検証済み・配置は不変)**:
  `goldbenchan+7(1段目/最上位) → +6 → +5 → +4 → +3 → +2 → goldbenchan本体(7段目) → kusanokiyoshi1(8段目) → guri.baggio(9段目)` 縦一列
- エイリアス行は**ログイン不能な構造ノード**(Googleが+Nを同一扱い)。残高は後日、管理者調整(二重承認)で本体/準備金へスイープする運用
- **無紹介登録の自動帰属**: 紹介URLなし登録→紹介者=goldbenchan本体・配置=直下に即確定(監査つき・env `DEFAULT_SPONSOR_EMAIL`で変更可・テスト環境は自動無効)→ 無帰属ユーザーのBURNボーナス7ティア分が全額運営チェーンにプール
- migration `20260713020000`(goldbenchan存在環境のみ実行・冪等)。ユーザー向け組織APIは**下位7ティアのみ・上位不可視**(既存設計の確認済み)

### その他
- `LEGAL_REVIEW_MEMO.md`(旧0バイト)に**7/13弁護士レビューの口頭質問**を記録: 厩舎ランク案A(エンゲージメント型)/案B(BURN回数連動)・見舞い引換券・景表法。**回答記入欄あり — レビュー後に記入すること**

## 2. 未検証(次セッション/オーナーが確認)

- **今夜20:00の実地確認(初の本番ライブ)**: /racesライブ演出・点呼モード(少頭数)・MY LANE・20:00自動切替。引継ぎ書の残タスク「ローンチ前1晩の実地確認」に該当
- デバッグ体験フロー: 即時fund-grant→購入予約→今夜マッチング(Day0誕生)→**明晩が初レース**(今夜は審判なし・購入マッチング演出のみ)
- 無紹介登録の自動帰属の本番動作(新規テストアカウントで)
- 待機パドックの本番表示(予報掲示板/招待カード)・スプラッシュ(全ブラウザ)・admin新デザインの実データ表示
- 19:55プッシュ/CSプッシュ/post-batchスイープ(前セッションからの持ち越し)

## 3. オーナー保留・約束事項

- **B-1: Render starter→Standard+オートスケール**は「リリース前にやる」(SCALING_PLAYBOOK.md)
- 7/13弁護士レビュー(資料`legal_review/`+口頭質問`LEGAL_REVIEW_MEMO.md`)→ 回答の記録と、厩舎ランク実装可否の確定
- メインネット移行チェックリスト(HANDOVER.md): fund-grant原資復帰ほか
- エイリアスノード残高のスイープ運用(貯まったら管理者調整)
- MLM改定(オーナー詳細待ち)は**引き続き着手禁止** — Decision 090は配置/帰属の話で報酬制度改定ではない

## 4. 次セッションの始め方

1. `HANDOVER.md` → 本書 → 必要に応じ`HANDOVER_SESSION_20260712.md`
2. ゲート: `pnpm exec turbo run build test lint typecheck`(76タスク)。報告→オーナー許可→コミット(`git commit -F file`・trailer必須)
3. 本番DB読取: node+pg(`apps/web/.env.local`のDATABASE_URL)。マイグレーション: `pnpm exec supabase --workdir infra db push`(SUPABASE_ACCESS_TOKEN/DB_PASSWORDを同一シェルで — PowerShell envは非持続)
4. ビジュアルQA: scratchpadの`qa/`にpuppeteer-core+sharp一式(Chrome=`C:/Program Files/Google/Chrome/Application/chrome.exe`)。devサーバーは3001で自前起動(ゲートと同時実行はリソース競合で固まる)
5. 落とし穴新規分: デプロイ直後にCloudflareがCSS404を数分キャッシュ→**ページ全体が無スタイルに見える**ことがある(数分後リロールで解消・慌ててリバートしない)/ supabase CLIは`--workdir infra`必須 / iOS起動画像は再挑戦禁止(上記)
