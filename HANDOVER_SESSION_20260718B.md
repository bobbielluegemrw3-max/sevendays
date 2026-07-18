# セッション引継ぎ 2026-07-18昼(V2実装: -5 JP → -6 アイテム完了 → -7a/-7d)

> 前セッション: `HANDOVER_SESSION_20260718.md`(V2コア完了)。
> 正典の序列: `HANDOVER.md` → 本書 → **FUN改修は `FUN_V2_PLAN.md` §9 が最上位** → `docs/10_DECISION_LOG.md`。
> **Decision Logは109まで起票済み・次は110。**
> 本セッションのコミット(すべてpush済み・マイグレーション2本は本番適用済み):
> `692fccc`(-5 JP)→ `1a82ca5`(-6 カタログ起草)→ `38c43b3`(35点拡張)→ `101686a`(Decision 109+アート発注書)→
> `8b1f2db`(-6 エンジン+API)→ `b48a4b4`(-6 UI+アート組込)→ `c0e0644`(-7a)→ `4dcebd7`(-7d)→
> `a55ad94`(Decision 110 自動プール)→ `82a2d1f`(-7b LV置換=辞書Proxy)→ `f612b7b`(-7c サーバー側)
> ※マイグレーションは計3本(JP/アイテムV3/auto_pool)すべて本番適用済み

## 0. 現在地

- **-5 週次ジャックポット: 完了**。Decision 108(週=月曜MORNING〜日曜NIGHTサイクル・チケット=(effective_race_date,slot)帰属・
  原資不足=中止+`JACKPOT_BUDGET_LOW`アラート繰越なし・チケット0=不成立据え置き・除外なし)。
  PAY_MLM_REWARDS内にV2ゲート結線(週初バッチがcommit-revealシード・日曜NIGHTでreveal→決定論当選→
  `jackpotPayout`→JACKPOT_WON通知)。実効パラメータは支払い前に行へ凍結(再試行中の設定変更が結果を変えない)。
  **system_settings `jackpot` は enabled=false 既定**(有効化=残高整合後の運用判断・本番公開=弁護士ゲート)。
  admin: GET /admin/jackpot/overview + POST /admin/jackpot/config(**SUPER_ADMIN限定**)
- **-6 アイテムカタログV2: 完了**(Decision 109・オーナー承認済み)。**コード版数=item_policy_v3.0/`_V3`**
  (既存`_V2`=Decision 082版レガシーと区別)。販売30(TRAINING15/RACE15)+非売5=35点。
  **キー衝突5点リネーム**: royal_banquet / elder_blanket / farewell_wreath / testament_mane / aeon_sand。
  RACE系=**置換方式**(的中: axis:=max(axis,hit) / 外れ: axis:=min(axis,miss)・各軸±2内→±4器は構造的に溢れない・
  シムの+4〜+8/−7〜−3はスイングとして再現=テスト済み)。V2のBurnドロップ=V3セット・**Revenge Buff生成はV2で停止**。
  **V3カタログ行は active=false でシード — 現行V1ショップに出ない。リセット時に
  `update item_catalog set active = (item_class <> 'V1')`**(§7チェックリスト追加)。
  アート35点納品済み→512px WebP組込済み(原本=`seven_days_derby_items_v2_35.zip` 未コミット・消さない。
  納品は発注書v1キーのため5点は取込時リネーム)
- **-7a レース単位化 / -7b DAY→LV置換 / -7c サーバー側 / -7d 正直明記: すべて完了**(詳細=FUN_V2_PLAN §9)
- **Decision 110: auto_reserve=金額指定自動プール — 完了**
- **残り: -7c UI(ショーの新幕)のみ → テストネット試運転**

## 1. 次セッションの作業(残り = -7c UI のみ)

### -7c UI: ショーのタイムライン新幕(最後の1ピース)
- **データはAPIに揃っている**(`f612b7b`): derby statusの `jackpot`
  ({status, prize_amount, total_tickets, winners:[{name(マスク済), amount}]} —
  このバッチで解決した抽選のみ非null)と `my_events.pool`
  ({amount, horses, spent} — このレースで精算された自分のプール)
- 実装: `apps/web/lib/daily-derby.ts`(決定論タイムライン)に
  ①YOUR NEW STABLE幕(pool非null時 — 「{amount} USDTが{horses}頭になりました」・
  -3b PurchaseViewの物語文と同じ言い回し)②ジャックポット幕(jackpot非null時・
  ショー最終幕=明日の予報の後・当選者マスク名と賞金)を追加
- 視覚QA: フィクスチャ追加+ `/dev/derby-preview`(`?t=秒&paused=1`)で確認・
  モバイルはCDPエミュレーション必須(ヘッドレスは500px下限クランプ)
- ついで: LedgerView に -7a で追加済みの `slot` 列の表示ラベル(朝/夜)
- 完了後 → **テストネット試運転**(§2チェックリスト)

### ~~未解決のオーナー論点~~ → Decision 110 解決済み(同日追記)
- **auto_reserve = 金額指定の自動プール**(オーナー決定 2026-07-18)。実装済み:
  `auto_pool_amount`列(migration 20260718030000 本番適用済み)・スイープのプール分岐
  (手動プール不可侵・残高切り下げ・102未満スキップ・未設定=SINGLE温存)・
  AUTO_POOL_RESERVED通知・/marketのAUTOタイル金額セレクタ(5言語)・PGliteテスト2件

## 2. テストネットリセット時のチェックリスト(このセッションの追加分)

前セッション§7(total_value再ミント付与・activatePolicy・予報フォールバック・デプロイ禁止帯再開・JP残高整合)に加えて:
1. `update item_catalog set active = (item_class <> 'V1')` — 旧35種を棚から下げ、V3の35点を解禁
2. system_settings `jackpot` の enabled を広告費口座残高と整合させてからtrueに(§7-5と同項)
3. CSナレッジの「V2シーズン(現行未適用)」注記を削除(適用済みになるため)

## 2.5 -7bの機構メモ(重要)

- DAY→LV置換は **APP_COPY辞書Proxy** 方式: root layoutが毎リクエスト
  `isEngineV2Active()`(`apps/web/lib/engine-server.ts`・60秒キャッシュ)を
  `setLvDisplayMode` にセット → `APP_COPY[lang]` の参照が透過的にLV変換辞書へ。
  **参照側は全ページ無改修**。変換は `toLvText`(i18n-shared・数字/プレースホルダが
  続くDay/DAYトークンのみ・`play_tpl` は除外リスト)。保存済み通知payloadは
  NotificationsList の `lvMode` prop で表示時変換
- Landing/ガイドの散文(「毎晩20:00」等のV1説明)は単語置換では嘘になるため対象外 —
  **ローンチ準備のコンテンツ改修**で書き直す(リセット後のタスク)

## 3. ハマりどころ(このセッションの新規)

- **item_catalogのキーはDB主キー** — 新カタログで同名モチーフを使うときは衝突チェック必須
  (5点リネームの経緯)。アート発注書のキーは発注前にDB衝突を確認すること
- bashのヒアドキュメント+長いTS文字列は壊れる — 複雑な編集はscratchpadのpythonスクリプト経由が安定
- sharpはworkspaceの`.pnpm`に存在(`sharp@0.34.5`)— 画像変換は
  `node_modules/.pnpm/sharp@0.34.5/node_modules/sharp` を直requireで使えた
- audit_logs.reference_id は uuid型 — 文字列参照(設定キー等)は渡せない。after_hashに値ハッシュを刻む方式で回避
- post-batch等の冪等キーを(date,slot)化するときは**NIGHTを旧キーのまま**にする(進行中シーズンの
  二重送信防止)。MORNINGのみスロット修飾
- derby status のmyEvents CTEにあったアイテム結合は effective_race_date → **race_id 結合**に修正済み
  (V1でも正しい・V2で同日2レースでも安全)

## 4. オーナー待ち・不変の注意(変更なし+追加)

- オーナー待ち: ①A層実機確認 ②弁護士回答(=JP本番公開の解禁のみ)
- 未コミットのオーナー保留物: `LEGAL_REVIEW_MEMO.md`修正・`EASTER_EGG_PLAN.md`・
  `operator-rtp-sim.mjs`・`法務.txt`・portrait3枚・**`seven_days_derby_items_v2_35.zip`(アート原本)**
- リバート基点: `pre-fun-overhaul`。V2アイテムUIの実機視覚QAはテストネット試運転で
