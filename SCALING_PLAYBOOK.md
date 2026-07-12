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
