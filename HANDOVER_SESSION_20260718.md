# セッション引継ぎ 2026-07-17夜〜07-18(V2実装: エンジン結線→2レース→プール→調教 完了)

> 前セッション: `HANDOVER_SESSION_20260717.md`(FUN改修始動・A層本番・Decision 101-106)。
> 正典の序列: `HANDOVER.md` → 本書 → **FUN改修は `FUN_V2_PLAN.md` §9(進行状態)が最上位** →
> `docs/10_DECISION_LOG.md`。**Decision Logは107まで起票済み・次は108。**
> 本セッションのコミット(すべてpush済み・マイグレーションは本番適用済み):
> `cf69558`(-1b settlement結線)→ `25f882d`(-2 バッチ2回制)→ `aa15787`(-3a プールエンジン)→
> `9987ef7`(-4a 調教API+Decision 107)→ `e0bc3cc`(-4b 調教UI)→ `bff837b`(-3b プール購入UI)→
> `6e239a0`(本書)

---

## 0. 現在地(最重要)

- **V2エンジンコアは完成**。-1b / -2 / -3a / -3b / -4a / -4b が本番DBに同居済みで、
  **V1(現行シーズン)の挙動は1ビットも変わっていない**:
  - 新列はすべて nullable または既定値つき(`slot` 既定 `'NIGHT'`・`session_mode` 既定 `'SINGLE'`)
  - `race_engine_v2.0` は race_engine_versions に**非アクティブ登録**(activated_at null)。
    バッチのポリシーロックは v1.1 を掴み続ける
- **V2への切替は一点**:
  ```ts
  await activatePolicy(client, 'race_engine_versions', 'race_engine_v2.0');
  ```
  これだけで以下が全て連動する(各所が「アクティブエンジンがv2か」をDBで判定するため):
  1. スナップショット/採点/リプレイ検証がV2式(総合値+備え±4+運±3)
  2. render-worker が朝8:00 MYT(00:00 UTC)の MORNING バッチを起動(5分キャッシュ)
  3. 予報チェーンが時系列化(MORNING→同日NIGHT・NIGHT→翌日MORNING)
  4. PAY_DUE_BUYBACKS 冒頭の買戻し準備金バックストップ(102-8)が発動
  5. POST /api/v1/purchase の `amount`(プール購入)受付+/marketのUI切替
  6. POST /horses/:id/training の `menus`(V2調教)受付+馬詳細のUI切替
  - **戻し**も同じ機構(v1.1を再activate)— ただし試運転開始後の混在は非推奨
- **残フェーズ**: §6参照(-5 ジャックポット → -6 新アイテムカタログ起草 → -7 表示置換 → 試運転)

## 1. Decision 107(オーナー決定 2026-07-17/18・起票済み)

**V2のロール付き調教は「最初の確定が最終」— やり直し不可。**
- 経緯: Decision 104の「redo until snapshot」はロール導入後の再ロール搾取
  (悪くても組合せ21通りを確定→最良だけ採用)を許してしまい、下振れリスクが偽物になる。
  シム(§5.5.1)は1レース1ロール前提 → (b)確定即最終 をオーナーが選択
- 実装: DBガード2段 — `guard_training_delete` は menus_v2 not null の行を
  `TRAINING_FINAL` で拒否、`guard_training_update` は全列(slot/V2列含む)を凍結。
  APIは既存行があれば `TRAINING_ALREADY_EXISTS`(409)
- V1のロール無しやり直し(A2・delete+insert)は不変。リセットでV1ごと退役

## 2. スキーマ変更(migrations 4本・すべて本番適用済み)

| ファイル | 内容 |
|---|---|
| `20260717030000_v2_engine.sql` | `horses.total_value`(0-100・nullable)/ training_sessions V2列(`menus_v2 text[]`(1-2・check)・`per_menu_v2 jsonb`・`synergy_v2`・`delta_v2`・`rests_decay_v2`+V1/V2排他check)/ スナップショットに `total_value`・`condition_prep_modifier`(±4)=**入力凍結**、`luck_modifier`(−3..+4)=スコア列。ガード再作成時に既存の隙間(`item_snapshot_json` 凍結漏れ)も封鎖 / `race_engine_v2.0` 非アクティブ登録 |
| `20260717040000_v2_two_races.sql` | `race_slot` enum(MORNING/NIGHT)/ `batch_runs`・`night_forecasts` に slot(既定NIGHT)+ユニークを (date, slot) へ / `BUYBACK_RESERVE_BACKSTOP` tx type |
| `20260717050000_v2_pool_purchase.sql` | `purchase_session_mode` enum(SINGLE/POOL)/ プール予算≥102 check / 1ユーザー1ライブプール(部分ユニーク `uq_purchase_pool_live`)/ ownership_assignments のユニークを `(purchase_session_id, horse_id)` へ(**旧 `uq_assignment_session` は削除** — SINGLEの1:1はアプリのload-before-insertが担保) |
| `20260717060000_v2_training_slot.sql` | training_sessions に slot(既定NIGHT)+ユニーク `uq_training_horse_race_slot (horse, date, slot)` / Decision 107のDELETE禁止ガード / updateガードにslot・V2列追補 |

**注意**: ユニーク制約を変えたら `on conflict (...)` のターゲット列を**全箇所**追従すること
(train-all が本番回帰しかけ、テストが捕捉した — `(horse_id, effective_race_date, slot)`)。

## 3. エンジン/バッチ結線(packages)

### -1b: settlement結線(`cf69558`)
- `packages/domain/src/v2.ts`: `RACE_ENGINE_V2_VERSION='race_engine_v2.0'`・`isRaceEngineV2()`・
  `raceSlotStartUtcV2()`・`POOL_PACKAGES_V2`・`POOL_PURCHASE_MIN_USDT='102'`(後続フェーズで追加分含む)
- `settlement-engine/src/race/snapshots.ts`: `createParticipantSnapshots` 内部で
  `isRaceEngineV2(version)` 分岐 → `createParticipantSnapshotsV2`。
  **漸化 = `applyTotalValueGainV2(tv, delta)` → `applyDecayV2(・, restsDecay)`**(シムと同順・
  ゲイン先→減衰後)。備え±4 = `weatherModifier + trackModifier`(V1公開適性表の合成・発明なし)。
  condition/fatigue は前進させない。buff/itemはV2式に存在しない(101のスコア式は閉じている)。
  total_value が NULL の馬は `V2_TOTAL_VALUE_MISSING` で停止(壊れたシーズン状態)
- `race/scores.ts`: `runRaceScoresV2` — `computeScoreV2` で luck_modifier+final_score のみ書く
- `batch/production.ts`: `verifyReplayInputsV2` — 凍結入力から再計算・環境照合・ランキング健全性。
  **production.ts のステップ配線自体は無変更**(過去レースは保存済みバージョンで常に当時の経路=憲法)

### -2: バッチ2回制(`25f882d`)
- `batch/create.ts`: `createBatchRun(client, date, slot='NIGHT')`。
  冪等キー形式変更: **`batch:{date}:{slot}:{nn}:{KEY}`**(既存run再開は (run,step_number) conflictで安全)
- `batch/orchestrator.ts`: `runBatch({batchDate, slot?})`・advisory lockは `date:slot`・
  `StepContext.slot`/`BatchResult.slot`
- 予報チェーン(CREATE_RACES内): ロック済みエンジンで分岐 — v1=翌日NIGHT(従来どおり)/
  v2=MORNING→(同日,NIGHT)・NIGHT→(翌日,MORNING)。REVEALとリプレイ検証の予報結合もslot対応
- **買戻しバックストップ(102-8)**: `buyback/payments.ts` — `processDueBuybackPayments` に
  `backstop: {batchRunId} | null`。不足分ちょうどを `buybackReserveBackstop`
  (`ledger/src/movements.ts`・OPERATING→BUYBACK・キー `buyback-backstop:{batchRunId}`)で補填。
  production.ts が `isRaceEngineV2(ロック済みバージョン)` の時だけ渡す
- `services/render-worker/src/index.ts`: `isV2EngineActive()`(5分キャッシュ)→
  MORNING/NIGHTの2トリガー。`/internal/batch/start` は `slot` 入力(省略=NIGHT)。
  朝レースのプッシュ通知は**未実装**(-7で文言/キー設計 — 夜のみ既存フォールバック維持)
- 表示読みの暫定固定: `derby.ts` 予報読みと `market/post-batch.ts` は `slot='NIGHT'` 固定
  (V2のレース単位化は-7/-3後続で)

### -3a: プール購入エンジン(`aa15787`)
- `assignment/sessions.ts`: `createOrUpdatePoolSession({userId, amount, idempotencyKey})` —
  全額ロック。**ライブプールがあれば金額変更**(差額のみ `pslock:{key}`/`psunlock:{key}`)。
  下限102(`POOL_BUDGET_INVALID`)。キャンセルは既存 `cancelPurchaseSession` がモード不問で機能
- `assignment/execute.ts`: プール分岐 —
  1. 抽選順(不変・Decision 100)の先頭から**予算内の出品を取得**。
     **最初に買えない出品で停止=その出品は次の買い手へ**(チャンスを失わない)
  2. 残予算をミント(102)で充填(`dailyDay0MintLimit`・カバレッジゲートは従来どおり効く)。
     ミントuuid = `uuidFromParts('mint', batchRunId, '{sessionId}:{seq}')`(再開で同一)
  3. 精算は assignment 単位で冪等(キー **`assign:{sessionId}:{horseId}`**)。
     **SINGLE経路は旧キー(`assign:{sessionId}`)含め完全温存**(進行中シーズン互換)
  4. `finishPoolSession`: 余り返金(`assignrefund:{sessionId}`)+ASSIGNEDマーカー
- **ミント馬は総合値40-75を常時保持**: `mintTotalValueV2([mintSeed, horseId])` を
  `mintHorseAtomically` で無条件書き込み(V1では未使用列・commit-revealから誰でも再計算可能)。
  **リセットスクリプトで既存全馬への付与を忘れない**(§7)

### -4a: 調教API(`9987ef7`)
- `POST /api/v1/horses/:id/training` に `menus`(1-2・同一2回可)。
  ゲート: アクティブエンジンv2でなければ `TRAINING_V2_NOT_AVAILABLE`(409)
- 対象サイクル = `[(今日,MORNING),(今日,NIGHT),(明日,MORNING)]` の順で
  **バッチ未COMPLETEDの最初**。スナップショット凍結済みなら409
- ロールシード = **`{horseId}:{date}:{slot}`**(ノンス無し=決定論。リトライは同一結果。
  やり直し不可なので確定前プローブは存在しない)。`resolveTrainingRollV2` で確定時ロール →
  結果(perMenu/synergy/delta/restsDecay)をV2列に保存し即レスポンス

## 4. UI(apps/web)

- **TrainingFormV2**(`components/TrainingFormV2.tsx`): 6メニュー×公開レンジ
  (TRAINING_MENUS_V2実定数のみ)・2つまで(同一×2はカード2度タップ・チップで個別解除)・
  RESTは減衰無効の説明・**2段階確定で「やり直しはできません」警告(107)**・
  確定後はロール内訳表示で固定。`GET /horses/:id` が返す `engine_v2`/`training_v2`
  (次サイクルの確定済みロール)で `HorseDetailView` が自動切替
- **PoolReservePanel**(`components/PoolReservePanel.tsx`): パッケージバッジ+自由入力
  (下限102・残高超は/wallet導線)・確認ダイアログ・**ライブプールがあれば金額変更モード**。
  `/market` は `GET /api/v1/purchase` の `engine_v2` で切替(V1のReservePanelは不変)。
  同APIに `session_mode`/`horse_count` を追加し、PurchaseViewの物語文をプール対応
  (「YOUR NEW STABLE — 1000 USDTが8頭になりました」— ショー内演出は-7)
- i18n: `lib/i18n.ts` に `horse.tv2_*` 21キー×5言語(ja/en/zh/ko/ms)。
  market系は元々未翻訳(既存宿題)なのでプールUIは日本語直書きで一貫
- 視覚QA: `/dev/pages-preview` に V2調教3種(選択中/確定済み/REST)+プール3種
  (新規/変更モード/物語文)。**スモークテスト手順**: devサーバー起動→
  `curl http://localhost:PORT/dev/pages-preview` → 意図した文字列をgrep → **即kill**(§8)

## 5. テスト(全19タスクgreen・このセッションで+24件)

| ファイル | 検証内容 |
|---|---|
| `settlement-engine/test/v2-engine.test.ts` | 漸化(通常/ソフトキャップ跨ぎ84→84.5/REST/調教なし)・冪等再実行で二重前進なし・LUCK運レンジ・備え=適性表合成・リプレイ検証・total_value欠落拒否・調教不変ガード・v2.0非アクティブ登録 |
| `settlement-engine/test/v2-two-races.test.ts` | (date,slot)共存+スロット付き冪等キー・両slotスケルトン完走・予報チェーン(V1/V2)・バックストップ(不足分ちょうど補填・支払い完了・再実行冪等・充足時no-op) |
| `settlement-engine/test/v2-pool-purchase.test.ts` | プール作成/差額変更/キャンセル・500予算割当(420.26使用+79.74返金)・スキップ規則+ミント充填(抽選順非依存のアサーション)・ミント馬の総合値・準備金配分・reconcile |
| `api-contracts/test/v2-training.test.ts` | v2ゲート・確定時ロールの決定論(再計算一致)・確定即最終(409+DB DELETE拒否)・朝バッチ完了後はNIGHT標的・メニュー検証・V1やり直し不変 |

## 6. 残フェーズ(次セッションはここから)

### -5 ジャックポット(Decision 106・実装は解禁済み)
- **公開のみ弁護士ゲート**(105恒久指示: 開発は止めない)。テストネット試運転には載せる
- 仕様: チケット=調教確定数(`training_sessions` の user_id 行数・**週次リセット** →
  週の起点定義が要る: MYT月曜0時など。台帳化するなら新テーブル)。
  週1回・夜ショー最終幕で発表・commit-reveal(レースと同じ `randomness_commits` 機構・
  reference_type='JACKPOT' 等)・原資=`PLATFORM_MARKETING_BUDGET`(**残高が構造上の上限**・
  払い出しmovementは新txタイプ)・当選者マスク表示・仮値: 週100 USDT×1名(実行時設定可能に)
- 実装場所の想定: settlement-engine に週次ステップ or workerジョブ+admin API+ショー最終幕
  (ショーは-7と共同)。**Decision 108として抽選詳細(週起点・繰越規則)を起票してから**

### -6 新アイテムカタログ起草(オーナー承認物・コード前にドキュメント)
- TRAINING系(総合値直効き・レンジ大きめ・下振れ小/なし)と
  RACE系(予報70%への備え・的中+4..+8相当/外れ−7..−3)の2分類。旧35種全廃(オーナー指示)
- 成果物: `ITEM_CATALOG_V2.md`(仮)— 品目・価格・効果レンジ・発動条件・アート発注リスト。
  RACE系の効果は `condition_prep_modifier`(±4の器)への合流として設計(-1bで器は用意済み)

### -7 表示置換+レース単位化(最大の残り)
- DAY→LV全面置換(「LV.1〜7」・価格表はLV0..6読み替え)・my-results/透明性台帳/
  ショー/status APIのレース単位化(`batch_runs.slot` 結合)・derby.ts/post-batch.tsの
  NIGHT固定解除・朝レースのプッシュ文言/キー・ショーの「YOUR NEW STABLE」幕・
  ジャックポット幕・「上手い人が勝つゲーム」の正直明記(オンボーディング/ガイド/CSナレッジ=R1)
- その後: **テストネット試運転開始 = activatePolicy + 夜時刻はそのまま + リセット**(§7)

## 7. テストネットリセット時のチェックリスト(V2追加分)

既存(HANDOVER.md §Phase12/14: 経済リセット・キーローテ・fund-grant原資戻し)に加えて:
1. 全馬リセット後の再ミントで `total_value = mintTotalValueV2([mintSeed, horseId])` を付与
2. `activatePolicy('race_engine_versions', 'race_engine_v2.0')`(切替はこの一点)
3. 初回MORNINGバッチの予報行は無くてよい(レースシード由来フォールバックが効く)
4. デプロイ禁止帯(20:00 MYT±1h)は試運転シーズン開始で**再開**(現在は3名デバッグ中で停止)
5. Decision 106の仮値(週100 USDT×1名)を広告費口座残高と整合させてからJP幕を有効化

## 8. ハマりどころ(このセッションの新規)

- `alter type ... add value` はDML同居不可だが、**新規enum(create type)は同一マイグレーション
  ファイル内で列定義に使える**(race_slot/purchase_session_modeで実証)
- ユニーク制約変更 → `on conflict` ターゲット全箇所追従(§2注意)
- **Windowsのdevサーバーゾンビ**: `kill %1`/`pkill` は効かないことがある。
  `taskkill /PID <pid> /F`。ゾンビが残ると次の `next dev` が**起動拒否**
  (「Another next dev server is already running」)+本番プーラー枠(15)を占有し続ける
- turboゲートの合否確認は `--output-logs=errors-only` で `Tasks: N successful` を読む。
  PowerShellの `Select-String` はANSIカラーで取りこぼす(bash+grep -a か tail が確実)
- git pushが稀に403(credential一時失効?)→ 単純リトライで通る
- PGliteはテスト順で残高が汚れる → プラットフォーム勘定は差分アサーション(既知・再確認)

## 9. オーナー待ち・不変の注意

- オーナー待ち: ①A層の実機確認 ②弁護士回答(=ジャックポット**本番公開**の解禁のみ)
- 未コミットのオーナー保留物(触らない): `LEGAL_REVIEW_MEMO.md`修正・`EASTER_EGG_PLAN.md`・
  `packages/settlement-engine/scripts/operator-rtp-sim.mjs`・`法務.txt`・portrait画像3枚
- 弁護士対応は人間同士・Claudeは起草不要・開発は止めない(105恒久指示)
- リバート基点: タグ `pre-fun-overhaul`(全戻し)。フェーズ完了ごとにタグの慣習
  (今セッションはコミット単位で細かく刻んだためタグ未追加 — 必要なら `v2-core-done` を切る)
