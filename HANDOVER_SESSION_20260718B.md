# セッション引継ぎ 2026-07-18昼(V2実装: -5 JP → -6 アイテム完了 → -7a/-7d)

> 前セッション: `HANDOVER_SESSION_20260718.md`(V2コア完了)。
> 正典の序列: `HANDOVER.md` → 本書 → **FUN改修は `FUN_V2_PLAN.md` §9 が最上位** → `docs/10_DECISION_LOG.md`。
> **Decision Logは109まで起票済み・次は110。**
> 本セッションのコミット(すべてpush済み・マイグレーション2本は本番適用済み):
> `692fccc`(-5 JP)→ `1a82ca5`(-6 カタログ起草)→ `38c43b3`(35点拡張)→ `101686a`(Decision 109+アート発注書)→
> `8b1f2db`(-6 エンジン+API)→ `b48a4b4`(-6 UI+アート組込)→ `c0e0644`(-7a)→ `4dcebd7`(-7d)

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
- **-7a レース単位化: 完了** / **-7d 正直明記: 完了**(詳細=FUN_V2_PLAN §9)
- **残り: -7b(DAY→LV置換)と -7c(ショー新幕)→ テストネット試運転**

## 1. 次セッションの作業(-7b/-7c)

### -7b DAY→LV全面置換
- **LV = current_day(0〜6)表示・LV7走破=チャンピオン**(価格表LV0..6読み替え。
  カタログV3のLV制限もcurrent_day基準で実装済み=この定義が既成事実)
- 規模: i18n約69行(5言語)+15コンポーネント約40箇所。engine_v2フラグは厩舎(stable-shared)/
  馬詳細/棚(/market)に配線済み — 他ページはページ側でエンジン判定の配線が要る
- 注意: 通知テンプレート「Day {current_day}」・ショーログ「DAY7 — CLEARED」・LedgerViewの
  slot表示(APIは-7aでslot返却済み)も対象

### -7c ショー新幕+朝プッシュ
- YOUR NEW STABLE幕(プール購入披露 — PurchaseViewの物語文は-3bで実装済み・ショー内演出が未)
- ジャックポット幕(日曜夜のみ・当選者マスク表示。データ源=jackpot_draws/jackpot_winners。
  ユーザー向け取得APIは未実装 — status API拡張が自然)
- 朝レースのプッシュ文言/キー: `/internal/batch/start` は slot=NIGHT のみフォールバック送信中
  (`race-start:{date}`)。朝用キーは `race-start:{date}:MORNING` 等の別キー設計で二重送信を防ぐ
- ✎ ショーのタイムライン(`apps/web/lib/daily-derby.ts`)は決定論生成 — 新幕はフィクスチャ+
  /dev/derby-preview で視覚QA(CDPエミュレーション)

### 未解決のオーナー論点(Decision 110候補)
- **auto_reserve のプール型再定義**(Decision 103のTBD)。現状はV2でもSINGLE予約(177.16ロック)として
  機能する(経路温存)ため、試運転はこのままで開始可能

## 2. テストネットリセット時のチェックリスト(このセッションの追加分)

前セッション§7(total_value再ミント付与・activatePolicy・予報フォールバック・デプロイ禁止帯再開・JP残高整合)に加えて:
1. `update item_catalog set active = (item_class <> 'V1')` — 旧35種を棚から下げ、V3の35点を解禁
2. system_settings `jackpot` の enabled を広告費口座残高と整合させてからtrueに(§7-5と同項)
3. CSナレッジの「V2シーズン(現行未適用)」注記を削除(適用済みになるため)

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

- オーナー待ち: ①A層実機確認 ②弁護士回答(=JP本番公開の解禁のみ) ③auto_reserveプール型(110候補)
- 未コミットのオーナー保留物: `LEGAL_REVIEW_MEMO.md`修正・`EASTER_EGG_PLAN.md`・
  `operator-rtp-sim.mjs`・`法務.txt`・portrait3枚・**`seven_days_derby_items_v2_35.zip`(アート原本)**
- リバート基点: `pre-fun-overhaul`。V2アイテムUIの実機視覚QAはテストネット試運転で
