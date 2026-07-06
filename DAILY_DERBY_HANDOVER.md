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

### R1. バッチ状態API `GET /api/v1/daily-derby/status` の新設
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

### R4. 音声の自動再生対策
- ブラウザはユーザー操作前の音声自動再生をブロックすることがある。実運用では**ページ内の任意の最初のクリックで無音再生→アンロック**する priming を入れる(現プロトタイプは操作パネルのクリックが実質primingになっている)
- 音源を差し替える場合は同名で `public/sounds/` に上書き(タイムラインの17秒はファンファーレ実尺に合わせてあるので、**尺が変わったら `OPENING_STEPS`/`RACE_RUN` を再調整**)

### R5. 仕上げ(任意/v1.1)
- WebSocket/SSE化(現行はポーリング設計。ADR-008でv1.1と明記)
- PWA・Push通知(ADR-008でv1.1と明記)
- `/races` の見出し文言・ページ構成の最終調整(現在は暫定で「プロトタイプ」注記あり)

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
