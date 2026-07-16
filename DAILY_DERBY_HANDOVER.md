# THE DAILY DERBY ライブ演出 — 残作業引継ぎ書

> 作成: 2026-07-06 / 正典: `docs/10_DECISION_LOG.md` Decision 073 / 元ネタADR: `GPTとの会話/`(ADR-006/007/008)
> **このファイルを読めば新しいセッションでプロトタイプ→本番結線の続きから再開できる。**

---

## 0. 現在地(コミット済み・本番反映済み)

- **プロトタイプ完成**: `89149b3`(演出本体)+ `e471ea9`(/racesマウント)。sevendaysderby.com/races で稼働中
- 約100秒のライブショー: 3分前7セグカウントダウン(残り30秒で赤)→ 20:00ファンファーレ(16.8秒)+オープニング → レース実走(蹄音ループ、T+17〜30秒)→ 高速ログ濁流(BURN赤→生存緑→価値→DAY7金→P2P出品/入札/マッチング/Day0発行→MLM/Revenge Buff配布)→ TODAY RACE END → NFTアート入り個人結果
- **オーナー確定事項**: 絵文字禁止(固定幅タグ+行頭色ティック)/ 国旗・国情報なし(匿名ティッカーのみ)/ 90秒以上の構成 / ファンファーレと蹄音は実音源 / Your Resultは実馬NFTアートのフィナーレカード
- **現状はフィクスチャ駆動**(表示データは全てダミー)。/racesにはシミュレーション操作パネル付きでマウント(オーナーが反復確認するため=意図的)

## 1. 実装マップ

| ファイル | 役割 |
|---|---|
| `apps/web/lib/daily-derby.ts` | 純粋なタイムライン+決定論ログ生成(React/IOなし)。タイミング・速度・文言・色トーンの調整は全部ここ。`PRICE_TABLE_V1`から実価格を引用 |
| `apps/web/components/daily-derby/DailyDerbyStage.tsx` | ステージ本体。`secondsToStart`(負値=開始後経過秒)を与えると該当画面を描く。音声2本の再生制御もここ |
| `apps/web/components/daily-derby/SegmentClock.tsx` | 7セグSVG時計(外部フォント不要) |
| `apps/web/components/daily-derby/DailyDerbyPersonalResult.tsx` | 個人結果フィナーレ(SOLD/SURVIVED/BURNED/DAY7の4種、`NftHorseArt`使用) |
| `apps/web/components/daily-derby/DailyDerbyFailureState.tsx` | セーフモード表示(パニック文言禁止) |
| `apps/web/components/daily-derby/DerbyPreview.tsx` | シミュレーションドライバー(ジャンプ/倍速/一時停止/`?t=&paused=1&scenario=&failed=1`) |
| `apps/web/app/daily-derby.module.css` | 全スタイル |
| `apps/web/app/races/page.tsx` | **暫定**: DerbyPreviewをそのままマウント(+既存レース結果ブラウザ) |
| `apps/web/app/dev/derby-preview/page.tsx` | 視覚QA(本番404) |
| `apps/web/public/sounds/` | fanfare.mp3(16.8s)/ hoofbeats.mp3(39.6s)。**原本WAVはリポジトリ直下 `音声ファイル/`(未コミット・消さないこと)** |

## 2. 残作業(リリース前・優先順)

### ✅ R1〜R3 実装済み(2026-07-07)— 本番切替は環境変数
- **2026-07-12更新: /races は本番モード固定に変更(オーナー決定)。`DAILY_DERBY_LIVE` env は廃止**。プロトタイプ(状態ジャンプ+倍速の操作パネル)は `/dev/derby-preview` に残存 — 管理者のみ閲覧可・ADMINメニュー「デモ上映」から到達(20:00を待たずに演出を上映するため)
- (旧記載)`DAILY_DERBY_LIVE=1`(Render環境変数)で /races が実バッチ結線のライブモードに切り替わる。未設定はプロトタイプ=開発中はユーザー不在でログが流れないため意図的にOFF。
- R1: `GET /api/v1/daily-derby/status`(`endpoints/derby.ts`) — phase/サーバー時刻/実カウント/匿名ティッカー/個人結果(DAY7>SOLD>BURNED>SURVIVED・dna_hash付き)/自分の馬名
- R2: `components/daily-derby/DerbyLive.tsx` — サーバー時刻オフセット補正・ショー窓5秒/平常60秒ポーリング+タブ復帰時・途中参加は経過秒に合流・1時間以上過ぎていれば個人結果へ直行。**ログ濁流は案①(行は決定論生成・件数だけ実数・自分の馬名はハイライト)**
- R3: `components/DerbyCountdown.tsx` — 全ページヘッダーに「NEXT DERBY HH:MM:SS」(12:00 UTCからローカル計算・API不要)、ショー中は「DERBY IS LIVE」赤バナー→/races
- ライブモードの実地確認はローンチ前に1晩、envを立てて20:00の実バッチで行うこと(残テスト)

### (旧記載)R1. バッチ状態API `GET /api/v1/daily-derby/status` の新設
- 認証必須・読み取り専用・冪等性不要。**07_API.md更新+Decision Log追記の運用を忘れない**(禁止APIゲートはリテラルgrep)
- レスポンス設計案:
  - `serverTime` / `nextDerbyAt`(クライアント時計ズレ補正。20:00 MYT=12:00 UTCは `lib/race-time.ts` に既存)
  - `phase`: 当日(MYT)の `batch_runs` 行から導出 — 行なし=WAITING、RUNNING=LIVE、COMPLETED=COMPLETED、FAILED=FAILED_SAFE_MODE
  - `counts`: horses(スナップショット頭数)/ burns / listed / assignments / mints — 当日バッチに紐づく結果テーブルの集計
  - `ticker`: 匿名イベント直近N件(馬名+種別+金額のみ。通知ブロードキャスト行 `user_id null` が既存の供給源)
  - `personalResult`: 認証ユーザーの当日結果(SOLD/SURVIVED/BURNED/DAY7)。馬の `dna_hash` を含める(フィナーレのアート描画に必要)
- テスト: PGliteで `createTestDb()` → バッチ実行済みDBに対する集計検証(既存の settlement-engine e2e フィクスチャが流用できるはず)

### R2. /races の本番化(実バッチ駆動へ切替)
- DerbyPreview(操作パネル)を外し、**実時刻+APIポーリング**で駆動する本番コンポーネントに差し替え:
  - `secondsToStart` = `nextDerbyAt - serverTime` の実時間カウントダウン(ローカル時計はserverTimeオフセットで補正)
  - ポーリング: 19:55〜イベント終了は5秒間隔、それ以外は低頻度+タブ復帰時
  - **途中参加**: phase=LIVEで開いたら経過秒をバッチ開始時刻から計算して途中合流(完了済み演出は再生しない=ADR-008)
  - FAILED_SAFE_MODE は phase から直結
- **設計判断が1つ残っている**: ログ濁流の行を「実データの馬名」にするか「現行の決定論生成のまま件数だけ実数」にするか。全馬の実ログをAPIで返すのは重い(数万行)。推奨=v1.0は決定論生成のまま counts だけ実数(演出として自然、負荷ゼロ)。オーナーに確認してから実装
- 演出タイムライン(約100秒)は実バッチの完了より長い可能性がある(バッチは数分かかる)→ **演出はバッチ完了を「再生」する方式でよいか**も確認事項(20:00にバッチ開始→演出は20:00から固定100秒で流し、counts はAPI最新値を随時反映、が現実解)

### R3. ナビ共通カウントダウン(ADR-008)
- 全ページのヘッダー(`TopNav`)に「Next Daily Derby HH:MM:SS」、20:00になったら「THE DAILY DERBY IS LIVE」バナー→クリックで /races
- 既存の `components/Countdown.tsx`(HH:MM:SS)と `lib/race-time.ts` を流用可能

### R4. 音声の自動再生対策 — ✅ 対応済み(2026-07-07 `d792ef2`)
- iOS実機で「足音は鳴るがファンファーレが鳴らない」を確認(iOSの許可は音声要素ごと+ジェスチャ文脈内のみ)→ **最初のタップで両音源を無音再生→即停止するpriming**を`DailyDerbyStage`に実装済み
- 残る制約: ページを開いてから一度もタップしないユーザーには鳴らない(ブラウザ仕様上回避不可)
- 音源を差し替える場合は同名で `public/sounds/` に上書き(タイムラインの17秒はファンファーレ実尺に合わせてあるので、**尺が変わったら `OPENING_STEPS`/`RACE_RUN` を再調整**)

### R5. 仕上げ(任意/v1.1)
- WebSocket/SSE化(現行はポーリング設計。ADR-008でv1.1と明記)
- PWA・Push通知(ADR-008でv1.1と明記)
- `/races` の見出し文言・ページ構成の最終調整(現在は暫定で「プロトタイプ」注記あり)

## 2.5 初ライブ(2026-07-14・馬0頭出走の夜)で出た不具合と修正

オーナー実視聴での指摘3件(全て修正済み):

1. **20:00直後に「23:59」カウントダウンへ逆戻り**: バッチ行はワーカーの30秒tickで20:00より遅れて生まれるため、その空白では `phase=WAITING` のまま `next_derby_at` が翌日に切替わっていた。→ `DerbyLive` にグレース窓(直前20:00から10分以内のWAITINGは経過秒でオープニング続行)+ライブ開始のアンカーを「20:00ちょうど」に連続化(バッチ開始が2分超遅れた夜のみ実開始時刻アンカー)
2. **点呼に「今夜走っていない馬」**: 点呼モードが保有ACTIVE馬(=今夜ミントの明晩デビュー組)を映していた。→ 点呼は `currentDay>=1`(今夜走った馬)のみ。走った馬ゼロの夜は「今夜の出走はありません — 新しい馬◯頭は明晩デビュー」カード
3. **P2Pゼロの夜にログ濁流が満量**: 案①「行はダミー・件数だけ実数」の件数側が未結線だった。→ `logWindow(…, counts)` で各セクションの行数を実件数でキャップ(0件セクションは`─ NO EVENTS ─`)。counts に `day7`/`celebrations` を追加(status API併修)。単体テスト `apps/web/test/daily-derby.test.ts`

## 2.6 3回目ライブ(2026-07-16・15頭の静かな夜)— 審判演出の実結線

オーナー実視聴での指摘(①点呼が2周しただけで生存/BURNの審判が出ない・②ナビのLIVEが
ショー後も点きっぱなし)の調査で、**個人演出の結線が根本的に死んでいた**ことが判明:

- **旧設計の欠陥**: 審判/MY LANE/◀YOUハイライトは「濁流のフィクション行に実馬名が
  含まれるか」の名前一致で発火していた。ダミー名彙(PREFIXES×SUFFIXES)と実馬名は
  ほぼ一致しない=**本番では一度も発火しない**。さらに偶然一致すると生存馬にBURN審判
  など**誤った結果**を映す危険まであった(プレビューは一致保証つきのfixture名だったため
  発覚しなかった)
- **新設計(2026-07-16)**: status APIに `my_events`(当夜の自分の実イベント: burned/
  survived/sold/bought、my-results と同形・レースFINALIZED後に1往復のUNION ALLで取得)
  を追加。クライアントはこれを**該当セクションの時間帯にスケジュール発火**する
  (BURN=BURNセクション/生存=SURVIVORS/DAY7=DAY7/売買=P2Pターン)。BURN審判の
  使用アイテム・ドロップも実物になった(従来はfixture生成の架空ドロップだった)。
  濁流の実名突合は全廃(濁流は純粋なフィクション演出、個人ドラマは審判+MY LANE)
- **点呼も同時修正**: 対象=実イベント由来(BURNされた馬も含む — 従来はACTIVE絞りで
  BURN馬が点呼から消えていた)・1周だけ回して最後の馬で保持(ループ廃止)・審判は
  点呼スロットに同期(その馬の大写し中に審判が重なる)。スロット= 32秒/頭数を3.5〜9秒に
  クランプ
- **途中参加**: 12秒以上過ぎたイベントは再生せずMY LANEにだけ記帳
- ②はナビ `DerbyCountdown` の LIVE窓を `SHOW_TOTAL+200`→`+60` に短縮
- **教訓**: 「プレビューで動く」はフィクスチャが本番条件を再現している時だけ意味を持つ。
  本番だけで死ぬ結線(名前一致・データ到着タイミング)はプレビューに同じ制約を持ち込んで
  検証すること

## 2.7 見逃しリプレイ(2026-07-16 オーナー要望)

仕事等で20:00に見られない人が多く「ドキドキ感が伝わらない」への対応:

- **仕様**: ショー終了後〜MYT日付が変わるまでの間に /races を開いた**未視聴ユーザーに、
  当夜のショーを1回だけ自動で録画再生**する(6秒カウントダウン→ファンファーレ→通常の
  101秒フル演出。審判・MY LANEも実イベントで発火)。REPLAYバー(赤・録画明記+
  「スキップして結果へ」)とタイトルバッジREPLAYで**ライブと誤認させない**
- **「1回」の判定は端末ローカル**(localStorage `sdd_derby_replay:<MYT日付>`・過去日
  キーは書込時に掃除)。ライブ中に/racesを開いていた人は視聴済み扱い。storage不可
  (プライベートモード)は視聴済みに倒す。厳密なユーザー単位ではない(別端末では
  もう1回見られる)— 録画はボーナスなので実害なしという割り切り
- **翌日以降のリプレイは対象外**(statusが当日のcounts/条件しか持たないため)。
  必要になったら status に前夜ペイロードを足すのが次の一手
- 実装: `DerbyLive.tsx`(リプレイ時計+視聴済み判定)+ `DailyDerbyStage`(replay/
  onReplaySkipプロップ→REPLAYバー)。QA: `/dev/derby-preview?replay=1` または
  「リプレイ表示」ボタン
- 同日: ダッシュボードの結果ラベルを「昨夜の結果」→「◯月✕日の結果」に
  (`result_label_tpl`×5言語+`formatMonthDay`(i18n-shared)。ショー直後に「昨夜」は
  違和感というオーナー指摘)

## 3. ハマりどころ(このフェーズで学んだこと)

- **Next.js devは `127.0.0.1` からのアクセスをクロスオリジン扱いでブロック**し、ハイドレーションが静かに失敗する(HTMLは出るがボタン無反応・タイマー停止)。開発確認は必ず `localhost` で開く
- ログの桁揃えは `makeLine` の `padEnd` + CSS `white-space: pre` のセット。どちらか片方だけだと崩れる
- ヘッドレスChromeの視覚QA: `/dev/derby-preview?t=<残り秒(負=経過)>&paused=1&scenario=burned&failed=1` で任意の瞬間を決定論的に開ける(スクショ検証のために作った口。壊さないこと)
- ヘッドレスChromeは `--remote-debugging-port` がIPv4バインドに失敗して `[::1]` のみで待受けることがある(CDP接続先は `http://[::1]:9222`)
- 蹄音は「窓に入ったら再生・出たら停止」の状態同期方式(クロッシング検知ではない)なので、プレビューのジャンプでも正しく鳴る/止まる。ファンファーレだけは**20:00通過の瞬間のみ**鳴る(途中参加では鳴らさない=ライブの一回性)
- プレビューの模擬時計は個人結果表示の10秒後に自動で翌日待機へループする(`SHOW_TOTAL + 10`)

## 4. 確認方法

- ローカル: `pnpm --filter @sevendays/web dev` → http://localhost:3000/dev/derby-preview (または /races、要ログイン)
- 「20:00 (LIVE)」ボタン→×1のまま放置で音付き通し再生(約100秒)
- 本番: sevendaysderby.com/races(mainへのpushでRender自動デプロイ)
