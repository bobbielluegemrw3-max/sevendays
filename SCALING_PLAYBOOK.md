# 大量アクセス対策 手順書(SCALING PLAYBOOK)

> 作成: 2026-07-12。コード側の対策(下記A)は実装済み。本書は**オーナーがダッシュボードで行うインフラ操作(B)**と、負荷の目安・監視ポイントをまとめたもの。

---

## A. 実装済みのコード対策(2026-07-12)

| # | 対策 | 効果 |
|---|---|---|
| 1 | **derby statusの共有部分をプロセス内キャッシュ(2秒TTL)** | ショー窓の最ホットパス。視聴者が何人いてもDBへは約2秒に1回。個人依存はYOUハイライト用の1クエリのみに削減(従来は毎ポーリング7〜8クエリ+未使用のpersonal計算4〜5クエリ) |
| 2 | ナビバッジを`unread-count`(COUNT 1本・部分インデックス)に | 全ページ遷移ごとの「通知50件全文取得」を撤廃 |
| 3 | `created_at::date=`の非サージャブル述語を範囲条件化+索引4本追加 | データ増でもフルスキャンしない(migration `20260712130000`・本番適用済み) |
| 4 | レース結果(最大1000行)を60秒プロセス内キャッシュ | ショー直後の集中閲覧を吸収(結果はDB制約で不変=安全) |
| 5 | WebのDBプールをenv化(`WEB_DB_POOL_MAX`・既定10) | インスタンス増強に合わせて調整可能に |

チューニング用env(Render Webサービス): `WEB_DB_POOL_MAX` / `DERBY_STATUS_CACHE_MS`(既定2000) / `RACE_RESULTS_CACHE_MS`(既定60000)

## B. オーナーのインフラ操作(推奨順)

### B-1. Render プラン増強(最優先・5分)
現在 **web / worker とも `plan: starter`(0.5CPU/512MB・単一)**。
1. Render Dashboard → `sevendays`(Web)→ Settings → Instance Type → **Standard 以上**
2. 同 → Scaling → **オートスケール ON(min 1 / max 3〜5)** ※Pro ワークスペースで利用可
3. `sevendays-worker` → **Standard**(バッチ・プッシュ配信の頭打ち防止。スケールアウトは不要 — バッチはadvisoryロックで単一実行)
4. Web の Environment に `WEB_DB_POOL_MAX=15` を追加(Standard 1台あたりの目安。max台数×この値がDB接続上限に収まること — B-3参照)
- `render.yaml` の `plan: starter` はダッシュボード変更後、次の機会に追随修正(手動作成サービスのためダッシュボード側が正)

### B-2. Cloudflare プロキシ化(CDN/WAF/レート制限・15分)
現在 DNS only(グレー雲)。
1. Cloudflare DNS → `sevendaysderby.com` / `www` の雲を**オレンジ(Proxied)**に
2. SSL/TLS → **Full (strict)**
3. Caching → Cache Rules: `/_next/static/*`, `/icons/*`, `/champions/*`, `/sounds/*`, `/horses/*`(public配下の静的) を **Cache Everything / Edge TTL 1 month**(いずれもハッシュ付き/不変アセット)
4. Security → Rate limiting rules: `/api/*` に **1IPあたり 60req/10秒** 程度(ショーの5秒ポーリング+操作で十分な余裕)
5. 確認: プッシュ通知(service worker)・Google OAuthコールバックが通ること(どちらも標準構成で問題なし)

### B-3. Supabase(DB)確認
1. Dashboard → Settings → Compute: 現行サイズを確認。**Small以上**を推奨(20時に接続とCPUが集中)
2. 接続数の算段: Webの接続合計 = `WEB_DB_POOL_MAX × インスタンス数` + worker(5)。**セッションプーラーの上限(Compute依存)以内**に収める
3. さらに伸ばす場合: Web の `DATABASE_URL` を**トランザクションプーラー(ポート6543)**へ切替可(短命クエリの多重化が効く)。**workerはセッションプーラーのまま**(advisoryロック・トランザクション制御があるため必須)

### B-4. 20時の監視(初回スパイク時に見る場所)
- Render Web: CPU/メモリ/レスポンスタイム(Metrics)
- Supabase: Database → Connections / Query performance(遅いクエリ)
- ワーカーのバッチ所要時間ログ(伸びてきたら下記Cへ)

## C. 次の段階(まだ不要・データが伸びたら)
- バッチ内部のN+1集合SQL化(既知負債: スナップショット/割当ループ。馬10万頭でバッチ所要時間が問題化)
- derby status キャッシュの多インスタンス共有(Redis等)— オートスケールでインスタンスが増えても各自2秒キャッシュで実害は小さいため当面不要
- 台帳/結果系のCDNキャッシュ(Cache-Controlヘッダ付与)

## D. フロント体感速度(2026-07-16 オーナー報告「多言語化後に少し重い」への対応記録)

### 実施済み
| 対策 | 効果 | コミット |
|---|---|---|
| 5言語辞書のクライアント混入を排除(辞書=サーバー専用、クライアントは `t` propで受領・`lib/i18n-shared.ts` 分離) | **全ページの初回JSが gzip −48KB(318→270KB・−15%)**。パース/ハイドレーションも軽量化 | `e0f3097` |

**再発防止則**: クライアントコンポーネントから `lib/i18n.ts`(APP_COPY)を import しない。
クライアント配下でレンダリングされるサーバーファイルも同罪(BuybacksView事例)。
検証法 = `next build` 後に `.next/static/chunks/*.js` を韓国語文字列(例「이용 가이드」)でgrepしてゼロ件を確認。

### 後回しにした候補(オーナー判断 2026-07-16・効果が見込める順)
1. **DBデータ取得のプロファイリング(推奨・次の一手)**
   - スケルトン表示時間の実体はサーバーのデータ取得(Render Singapore → Supabase ap-south-1、往復~50ms×クエリ数)。
   - まず主要ページ(dashboard / horses / market)の1表示あたりのクエリ本数と直列awaitの有無を実測し、`Promise.all` 化・クエリ統合・プロセス内キャッシュ(A-1/A-4と同じ手法)を該当箇所に適用する。
   - 測り方: 各pageの取得層にタイミングログを仮挿入 or Supabaseダッシュボードのquery statsで上位クエリを確認。
2. **残りのクライアントJS(gzip 270KB)の内訳精査**
   - 最大チャンク ~246KB(raw)の中身を確認し、重い依存(例: 馬アート生成・チャート類)があればページ単位の dynamic import に分割。
   - 測り方: `.next/static/chunks` をサイズ順に並べ、中身の由来を文字列で特定(本書D実施済み欄と同じ手法)。
3. **Renderコールドスタート確認**
   - starterプランはアイドル後の初回応答が遅い可能性。B-1のプラン増強で同時に解消されるため、単独では着手しない。

補足: ページ遷移ごとのスケルトンは App Router の loading.tsx 仕様(RSC取得中に表示)。
「キャッシュの時は速い」というオーナー体感は Router Cache(クライアント側の一時キャッシュ)によるもので正常。
