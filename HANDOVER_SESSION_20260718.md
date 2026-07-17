# セッション引継ぎ 2026-07-17夜〜07-18(V2実装: エンジン結線→2レース→プール→調教 完了)

> 前セッション: `HANDOVER_SESSION_20260717.md`(FUN改修始動・A層本番・Decision 101-106)。
> 正典の序列: `HANDOVER.md` → 本書 → **FUN改修は `FUN_V2_PLAN.md` §9(進行状態)が最上位**。
> **Decision Logは107まで起票済み・次は108。**
> 本セッションのコミット: `cf69558`(-1b settlement結線)→`25f882d`(-2 バッチ2回制)→
> `aa15787`(-3a プールエンジン)→`9987ef7`(-4a 調教API+Decision 107)→
> `e0bc3cc`(-4b 調教UI)→`bff837b`(-3b プール購入UI)

## 0. 現在地(最重要)

- **V2エンジンコアは完成**: -1b/-2/-3a/-3b/-4a/-4b がすべて本番マイグレーション適用済み・
  コミット/push済み。**V1挙動は一切変わっていない**(全て追加のみ・slot既定NIGHT・
  session_mode既定SINGLE・V2列はnullable)
- **切替スイッチは一点**: `activatePolicy(client, 'race_engine_versions', 'race_engine_v2.0')`。
  これだけで ①スナップショット/採点/リプレイがV2式 ②workerが朝8:00 MYTバッチを起動
  ③予報チェーンが時系列化 ④買戻しバックストップ発動 ⑤プール購入API/UI解禁
  ⑥メニュー調教API/UI解禁 — がすべて連動する(DBのアクティブエンジンが唯一の真実)
- **残フェーズ**: -5 ジャックポット(106仮値・実装は解禁済み・公開のみ弁護士ゲート)/
  -6 新アイテムカタログ起草(オーナー承認物)/-7 表示のLV置換+レース単位表示
  (my-results・透明性台帳・ショー・status API・朝レースプッシュ)→ テストネット試運転

## 1. Decision 107(オーナー決定 2026-07-17/18)

**V2ロール調教は確定即最終・やり直し不可**。理由: 再ロールや組合せ試し替え(決定論シードでも
21通り確定→良い結果だけ採用)を許すと下振れリスクが偽物になり、シム(1レース1ロール前提)の
チャンピオン率・育成曲線が崩れる。V1のロール無しやり直し(A2)は不変・リセットで退役。
誤クリック対策は確認ダイアログ+公開レンジのプレビューで足りる(オーナー同意)。
**DBが強制**: V2行(menus_v2 not null)はDELETE不可(TRAINING_FINAL)・全列UPDATE不可。

## 2. 実装の要点(詳細は FUN_V2_PLAN §9 の各項)

1. **-1b**: スナップショットV2(total_value漸化=確定済みロールをソフトキャップ加算→減衰2.0、
   RESTで無効)・備え±4=WEATHER/TRACK_MODIFIER_V1の合成(発明なし)・luck_modifier列。
   `race_engine_v2.0` は**非アクティブ登録**。V1リプレイは保存バージョン分岐で構造的に不変
2. **-2**: `batch_runs`/`night_forecasts`/`training_sessions` が (date, slot) キー。
   冪等キーは `batch:{date}:{slot}:{nn}:{KEY}`。予報チェーン: V2はMORNING→同日NIGHT・
   NIGHT→翌日MORNING(V1は従来どおり翌日NIGHT)。**買戻しバックストップ(102-8)**:
   PAY_DUE_BUYBACKSの冒頭で不足分を運営準備金から `BUYBACK_RESERVE_BACKSTOP` tx補填
   (キー `buyback-backstop:{batchRunId}`・V2ロック時のみ)。workerの朝トリガーは
   アクティブエンジンv2の時のみ(5分キャッシュ)
3. **-3a/-3b**: プール購入 — 予算まるごとロック→P2P抽選順→**買えない出品は次の買い手へ
   スキップ**→ミント(102)充填→余り(<102)返金。精算キーは session×horse(SINGLEは旧キー完全温存)。
   **ミント馬は総合値40-75を常時保持**(mintTotalValueV2([mintSeed, horseId])・検証可能)。
   1ユーザー1ライブプール(部分ユニーク)・再POSTで金額変更(差額ロック/解放)。
   UI: PoolReservePanel(/marketで自動切替)・YOUR NEW STABLE物語文
4. **-4a/-4b**: メニュー調教 — POST /horses/:id/training に `menus`(1-2)。対象=朝→夜→翌朝の
   未COMPLETED最初のサイクル。ロールシード=`{horseId}:{date}:{slot}`(リトライ同一)。
   UI: TrainingFormV2(公開レンジのみ表示・2段階確定・107警告・ロール結果表示)。
   i18n: tv2_* 21キー×5言語

## 3. 次セッションの選択肢

- **-5 ジャックポット(実装解禁済み)**: チケット=training_sessions行数(週次リセット)・
  週1抽選(commit-reveal・レースと同じ機構)・原資=PLATFORM_MARKETING_BUDGET(構造上の上限)・
  当選者マスク表示・テストネット仮値: 週100 USDT×1名。**本番公開だけが弁護士ゲート**
- **-6 新アイテムカタログ起草**: TRAINING系(総合値直効き・下振れ小)とRACE系(予報70%への
  備え・+4..+8/外れ−7..−3)の2分類・旧35種は全廃(オーナー指示)。承認用ドキュメント起草から
- **-7 表示置換(最大の残り物)**: DAY→LV全面置換・my-results/台帳/ショー/statusのレース単位化・
  朝レースのプッシュ文言・「上手い人が勝つゲーム」の正直明記(オンボーディング/ガイド/CS)

## 4. ハマりどころ(このセッションの新規)

- `alter type ... add value` はDML同居不可だが**新規enum(create type)は同一ファイルで使用可**
- training/batchのユニーク制約変更時は **`on conflict` のターゲット列も全箇所追従**
  (train-allが本番回帰しかけた — テストが捕捉)
- Windowsのdevサーバーは `kill %1`/`pkill` で死なないことがある → `taskkill /PID <pid> /F`。
  ゾンビが残ると**次の `next dev` が起動拒否**+本番プーラー枠(15)を食い続ける
- turboのゲート確認は `--output-logs=errors-only`+末尾の `Tasks: N successful` を読む
  (`Select-String`はANSIカラーで取りこぼす)
- プレビューQAのスモークテスト: devサーバー起動→`curl`でHTML取得→意図した文字列をgrep→即kill
  (ブラウザ不要・クライアントコンポーネントのSSR出力も検証できる)

## 5. 不変の注意

- 未コミットのオーナー保留物: `LEGAL_REVIEW_MEMO.md`修正・`EASTER_EGG_PLAN.md`・
  `operator-rtp-sim.mjs`・`法務.txt`・portrait画像3枚
- オーナー待ち: A層実機確認/弁護士回答(ジャックポット公開ゲート)
- メインネットリセット時の既存チェックリスト(HANDOVER.md §Phase12/14)+
  「全馬にmintTotalValueV2で総合値付与」を忘れない(リセットスクリプトで)
