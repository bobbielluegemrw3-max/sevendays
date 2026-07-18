# セッション引継ぎ 2026-07-18(3): V2実装完走 → 総合診断97点 → 総合値ティアUI+生体反応演出

> 前セッション書: `HANDOVER_SESSION_20260718B.md`(-5 JP/-6 アイテム/-7a〜d の詳細)。
> 正典の序列: `HANDOVER.md` → 本書 → **FUN改修は `FUN_V2_PLAN.md` §9 が最上位** → `docs/10_DECISION_LOG.md`。
> **Decision Logは110まで起票済み・次は111。**
> 本書が扱うコミット(すべてpush済み):
> `12f6946`(-7c UIショー新幕・**タグ`v2-build-complete`**)→ `599875b`/`aaeff29`(100点診断の修正)→
> `a55ad94`(Decision 110 自動プール※Bに追記済み)→ `ab4014e`(ティアカラー5ページ)→
> `5e58233`(HeroArtFx生体反応)→ docs

---

## 0. 現在地(最重要)

- **V2実装は-1a〜-7まで全フェーズ完走**(タグ `v2-build-complete`)。切替は
  `activatePolicy('race_engine_versions', 'race_engine_v2.0')` の一点のまま不変
- **試運転前 総合100点診断 = 97点**(§2)。ゲートすべき欠陥なし
- **オーナー承認のUI磨きを追加実装済み**(§3: 総合値ティアカラー+馬アートの生体反応演出)
- **次のアクション = テストネット試運転の開始**(オーナー号令待ち)。手順=§4

## 1. -7c UI: ショー最終幕(このセッション冒頭で完了)

- **YOUR NEW STABLE幕**: my_events.pool 非null時、YOUR RESULTS冒頭に
  「{amount} USDTが{horses}頭になりました」+使用額+余り自動返金(-3bの物語文と同一言い回し)
- **WEEKLY JACKPOT幕**: 明日の予報の後(真の最終幕)。**PAID週のみ表示**
  (中止/不成立週は幕ごと非表示=Decision 108)。当選者マスク名+賞金+
  「commit-revealで検証可能」の正直注記。既存TomorrowForecastと同じ意匠ブロック再利用
- DerbyLiveがstatusの `jackpot`/`my_events.pool` を結線。プレビューは既定でJP幕表示
  (`/dev/derby-preview?jp=0` で消す)。LedgerViewは同日2レースを夜優先で日別集約

## 2. 総合100点診断(試運転前)= **92点 → 追修正で97点**

- **発見→即修正(`599875b`)**: ①V2アイテム取消の複数行キャンセルで在庫復元が1個のみ
  (ユニット消失リスク)→全行復元 ②透明性CSVの同日2行が区別不能→slot列追加
- **追修正4件(`aaeff29`)**: ①スタックユニット掃除(post-batchスイープが「対象レース完了済みの
  PENDING使用」を自動解放・未来サイクル対象外・V1既知エッジも解消)②ナビカウントダウンの
  V2対応(朝8:00/夜20:00の近い方・layout→TopNav→DerbyCountdownにengineV2配線)
  ③透明性サマリー120行 ④自動プール通知を再実行でも常に試行(dedupe吸収=自己修復)
- **残り3点(試運転が検証手段・意図的)**: ショー新幕の実機視覚QA(−2)・
  サイクル別アーカイブUI(−1)
- 冪等性・クラッシュ窓・V1不変性・commit-reveal検証可能性・会計整合は全経路確認済み

## 3. 総合値ティアUI+生体反応演出(オーナー発案→承認→実装)

### 3.1 ティアカラー5帯(`apps/web/lib/tv-tier.ts`・純関数)
| 帯 | 名称 | 色 |
|---|---|---|
| 90–100 | GOLD | 金 #ffd97a(グロー強) |
| 80–89 | SILVER | 白銀 #d4e0f4 |
| 70–79 | BRONZE | 青銅 #d8a05a |
| 55–69 | STEEL | シアン #00eaff(ブランド色) |
| 0–54 | IRON | 灰 #97a0b8 |
**赤は不使用**(BURN専用色のため)。適用: 厩舎カード(チップ17px+金/銀/銅は枠発光 —
**枠線色は触らない**: 未調教マゼンタ等の機能色を保護、発光のみ)/ダッシュボード帯
(レアリティ枠を総合値に置換)/馬詳細ヒーロー(アートキャプションに**大型TOTAL 31px**)/
マーケット棚/レースパドック(derby status my_horses に total_value 追加)。
DAY→LVのハードコード残り(ダッシュボード帯・パドックタグ・ヒーローキャプション)もV2対応済み

### 3.2 HeroArtFx(`apps/web/components/HeroArtFx.tsx`)— 馬アートの生体反応
- **駆動**: TrainingFormV2 / ItemPrepPanelV3 が CustomEvent
  (`sdd:training-confirmed` / `sdd:item-applied`)を発火 — 親子結線なし・実ロール値のみ
- **調教確定**: 駆け出しモーション(前傾→バウンド・transform-origin蹄元)+スピードライン+
  砂埃+ティア色オーラ一閃。上振れ=ティア色粒子バースト/下振れ=沈み+一瞬暗転(正直)/
  REST=湯気。**数値ポップ**=内訳(調教/アイテム/保険/シナジー×2)→合計→
  「before → projected(次のレース後・減衰込み)」— `projectAfterRace` はエンジンと同数式・
  確定即最終なので予測も決定論=嘘なし
- **保険(masters_eye/testament_mane)発動**: 「0で受け止めた」盾キャッチ
- **TIER UP**: projectedが帯を跨ぐと2.6秒遅れでティア色リング一閃+「TIER UP — GOLD」タグ
- **アイテム**: アイコン吸い込み+シアンフラッシュ。**常駐**=装備バッジ(左上40px・
  次レースの備えの可視化)+減衰シールドの光の膜+「SHIELD ×N」チップ(右上)。
  データ源= GET /horses/:id に `race_item_v2` / `decay_shield_v2` を追加
- **視覚QA**: ヘッドレスChrome実撮影(`--virtual-time-budget`でスプラッシュ回避)で
  **被り2件を発見・修正**(装備バッジ→馬名被り/SHIELDチップ→TOTALラベル被り —
  両方とも上コーナー固定に)。QA導線: **`/dev/pages-preview?fx=up|down|rest|promo|insurance|synergy|item`**
  (自動再生・/dev/配下のみ有効)。`prefers-reduced-motion` 対応

### 3.3 触っていないもの
- 馬アート本体(deriveHorseArt/NftHorseArt)・API既存フィールド・V1シーズンの表示は不変。
  ギャロップは**スプライトではなくモーション演出**(gallopスプライトzipは未統合資産のため —
  本物のスプライト化はローンチ後の磨きに温存)

## 4. テストネット試運転の開始手順(号令が出たら)

前提: 実行前にオーナーへ「全データ消去を含む」ことを最終確認提示する。
1. 経済リセット(既存 `20260713030000_testnet_reset.sql` 系の手順)+キーローテ+fund-grant原資戻し(HANDOVER.md)
2. 全馬再ミント時に `total_value = mintTotalValueV2([mintSeed, horseId])` 付与
3. **`activatePolicy('race_engine_versions', 'race_engine_v2.0')`**(唯一のスイッチ)
4. `update item_catalog set active = (item_class <> 'V1')`(旧35種→新35種)
5. system_settings `jackpot` を広告費残高と整合させてから enabled=true
6. CSナレッジ「V2シーズン(現行未適用)」注記を削除・デプロイ禁止帯(20:00±1h)再開
7. 初回MORNINGバッチの予報行は不要(シード由来フォールバック)
8. 試運転初週: ショー新幕+生体反応演出の実機視覚QA・経済実測・-7残3点の回収

## 5. ハマりどころ(このセッションの新規)

- **ヘッドレスChromeのスクショはスプラッシュに阻まれる** → `--virtual-time-budget=15000` で先送り
  (ただしタイマー加速でアニメ中間は狙えない — 中間確認は ?fx= + 小さめbudgetで近似)
- CSS Modulesのリテラル子孫class(.tvBig内の .l/.v)は `:global()` 必須(既知の事故点・再確認)
- カードの `style` インライン指定は hover/機能色クラスを上書きする — ティアは
  **box-shadowのみ**で塗り、border色は機能(未調教マゼンタ)に譲る設計にした
- sharpは `node_modules/.pnpm/sharp@0.34.5/node_modules/sharp` 直require(前書§3再掲)

## 6. オーナー待ち・保留物(変更なし)

- 待ち: ①試運転開始の号令 ②A層実機確認 ③弁護士回答(=JP本番公開の解禁のみ)
- 未コミット保留物: `LEGAL_REVIEW_MEMO.md`修正・`EASTER_EGG_PLAN.md`・`operator-rtp-sim.mjs`・
  `法務.txt`・portrait3枚・`seven_days_derby_items_v2_35.zip`(アート原本・消さない)
- リバート基点: `pre-fun-overhaul`(全戻し)/ `v2-build-complete`(UI磨き前のV2完成点)
