# 見えるマーケットプレイス+手動出品 v1 仕様書(Decision 076)

> 作成: 2026-07-07(オーナーとの議論で確定)/ 元ネタ: `gptとの会話/ADR_MLM_and_Smart_Marketplace_v1.md`(Smart/Manual Marketplace部)+ADR-010
> 狙い: **R1(投資商品に見える=ユーザー無裁量)対策の本丸**。見えないバッチ市場を「見える市場」にし、売り手に裁量(手動出品)を与える。経済の決定論(価格ラダー・割当ルール)は一切変えない
> ステータス: 設計確定(Decision 076記録済み)→ 実装フェーズP-1〜P-4

---

## 0. 一言まとめ

買い予約(既存の購入セッション)を**見える化**し、新ページ「マーケットプレイス」に ①買い予約 ②今夜の需要件数 ③出品中の馬の棚 ④直近の成約フィード ⑤自分の出品管理 を集約。**手動出品**を新設: 保有馬を当日ラダー価格で出品でき(自由価格なし)、出品中は**レース不参加(Market Lock)**・day/価値凍結。マッチングは Smart と**同じ一本のキュー(古い順・Decision 012不変)**で20:00バッチが解消する。

## 1. 買い手側(既存機能の可視化 — 仕組みは不変)

- 買い予約 = 既存 `POST /api/v1/purchase`(即時資金ロック・最大10件・バッチ前キャンセル可・未割当は返金EXPIRED)。**Decision 010/043/051 は不変**
- 新規に見せるもの:
  - **今夜の買い予約 総件数**(匿名・全体数のみ)
  - **直近の成約フィード**(馬名・価格・匿名ID。Daily Derbyティッカーと同じ表示規範=ウォレット/実名なし)
  - 自分の予約一覧+キャンセル(既存 /purchase の機能を新ページへ統合)

## 2. 手動出品(新設)

| 項目 | 決定 |
|---|---|
| 出品できる馬 | 自分のACTIVE馬・Day1〜6(Day0は一度も走っていないため不可・DB制約とも一致) |
| 価格 | **当日ラダー価格固定**(PRICE_TABLE_V1)。自由価格はv1.0では不採用(裁定・価格操作・洗い売買の口を作らない) |
| 見え方 | 出品した瞬間から棚に表示(馬アート・名前・Day・価格) |
| **Market Lock** | 出品中はレース不参加(スナップショット除外)。current_day・価値は凍結。「出品したままDay7チャンピオンを狙う」二重取りを構造排除(ADRどおり) |
| マッチング | Smartと**同一キュー**: `listed_at ASC → current_day DESC → tiebreak`(Decision 012そのまま)。人為的な優先も後回しもしない |
| 取り下げ | 申請→**翌バッチから反映**(今夜のマッチング対象には残る。売れたら売却が優先)。出品操作は**馬ごとに1日1回** |
| 決済 | Smartと同一: 20:00バッチで成約・売り手に入金・手数料2%売り手負担(Decision 069) |
| Smartとの関係 | Smart(自動出品)はデフォルトのまま不変。Smart出品中の馬は従来どおり出走する。手動との違いは「ユーザーが選ぶ+レース免除」だけ |

- 駐車(毎日出品でBurn回避)は可能だが、day凍結=価値も報酬経路も凍結するため経済的利得なし。Day7到達率をむしろ下げる方向で準備金には安全側

## 3. 実装フェーズ

| フェーズ | 内容 |
|---|---|
| P-1 DB | `market_listings` に `source ('SMART'/'MANUAL')`・`cancel_after_batch` 追加、`batch_run_id` をMANUALでnull許容に。`horses.last_manual_market_action_date`(1日1回制御)。マイグレーション+PGliteテスト |
| P-2 エンジン | ①スナップショット作成でMANUAL出品中(LISTED)の馬を除外 ②バッチ完了処理で `cancel_after_batch` の出品をCANCELLED化 ③手動出品のtiebreakは決定論(sha256系)で付与。キュー・割当・精算は不変 |
| P-3 API | `POST /market/list`・`POST /market/unlist`・`GET /market/place`(棚+需要件数+直近成約+自分の出品)。07_API.md更新。エラー: NOT_HORSE_OWNER / HORSE_NOT_ACTIVE / MARKET_ALREADY_LISTED / MARKET_ACTION_LIMIT / MARKET_DAY_RANGE / MARKETPLACE_LOCKED |
| P-4 UI | `/market` ページ新設(ナビ MARKET)。/purchase の予約UIを統合し /purchase は /market へリダイレクト。/dev/market-preview |

## 4. 確定済みの周辺ルール

- 需要の可視化は「件数+直近の成約履歴」まで(個別の買い注文は非公開)
- 禁止API(`/market/force-sell` 等)はそのまま。手動出品APIは強制売却・価格設定の口を持たない
- Smart出品中の馬のBurn時の既存挙動(出走・delist処理)は変更しない
