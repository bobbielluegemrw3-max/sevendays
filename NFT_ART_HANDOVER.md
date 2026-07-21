# 馬NFTアート「3アーキタイプ方式」引継ぎ書

> 作成: 2026-07-06 / 前史: `UI_REDESIGN_LOG.md`(UI刷新の軌跡)・`HORSE_VISUAL_SYSTEM.md §7.0`(実装正典)
> **このファイルを読めば新しいセッションで続きから再開できる。**

---

## 0. 結論(現在の正典)

- 旧「18素体×グレースケール手続き着色」は**品質不足でオーナーが不採用**。ポーズ量産・batch03Rも**中止**
  (`HORSE_BASE_REBUILD_HANDOVER.md` は役目終了)。
- 現行: **3アーキタイプ方式** — Manusフルカラー原画3枚(V2金×黒 / V3虹色クローム / V4黒メカ)を
  レイヤー分離し、エンジンは**承認済み576ルック**(アーキ3×ボディ12×たてがみ16)から dnaHash で選ぶだけ。
  色は一切「生成」しない。オーナーはシートA/B(ダウンロードフォルダに `sheet_A_body.png` / `sheet_B_mane.png`)で**全承認済み**。

## 1. 実装内容(**コミット済み `7aa5c81`・本番反映済み** 2026-07-06)

> 当初「未コミット」だったが、オーナー指示でコミット&プッシュ完了。以下は実装の一覧:

| ファイル | 内容 |
|---|---|
| `apps/web/lib/nft-visual.ts` | 新規。`deriveNftLook(dnaHash, name)` / `pickNftShowcase` / `BODY_DEGS`(12角度) / `MANE_VARIANTS`(回転12+単色金/銀白/緋/緑) / `PREFIX_TARGET`(名前↔たてがみ色。White/Silver=銀白) / `ARCH_BIAS`(Golden系→v2, Black系→v4) |
| `apps/web/components/NftHorseArt.tsx` | 新規。レイヤー4枚を**真HSV**で変換合成(coat=bodyDeg回転 / mane=バリアント / accents金・eye固定)。CSS filter近似は不可(シート検収と一致させるため) |
| `apps/web/public/horses/nft/` | 新規。`{v2,v3,v4}_{coat,mane_tail,accents,eye_glow}.png` 768px×12枚(計2.3MB) |
| `apps/web/components/Landing.tsx` | マケプレ8枚を `pickNftShowcase`+`NftHorseArt` に結線(枠色=たてがみ色相連動)。ヒーローは `/horses/manus/v2.png` 原画のまま |
| `apps/web/components/DashboardView.tsx` / `StableBrowser.tsx` / `HorseDetailView.tsx` | 実馬アートを `deriveNftLook(dna_hash, name)`+`NftHorseArt` に切替(旧 `deriveHorseArt`+`HorseArt` から) |
| `HORSE_VISUAL_SYSTEM.md` | §7.0 に新方式を正典として追記(旧方式は記録として残置) |

検証済み: lint / tsc / 本番build(bundle check 31 chunks)/ webテスト10件 / マケプレ8枚別ルック描画 /
厩舎34頭の名前↔色動作(White Mirage=銀白鬣・Black Tempest=闇色等)をスクショ確認。



## 2. アセットの所在(重要 — スクラッチパッドはセッション消滅)

- **2048px原本(レイヤー12枚+メタ+QA)**: リポジトリ直下 `nft_v2v3v4_layers.zip`(Manus納品ZIP・検収合格)
  - 検収結果: 排他分離(重複0px)・再合成で原画とピクセル一致(数学的保証)・レイヤー純度スモークテスト合格
- **フラット原画(1024px)**: `apps/web/public/horses/manus/{v2,v3,v4}.png`(コミット済み。ヒーローで使用中)
- **フラット原画(1920px)**: `C:\Users\USER\Downloads\nft_{v2,v3,v4}_transparent.png`
- **承認シート**: `C:\Users\USER\Downloads\sheet_A_body.png` / `sheet_B_mane.png`(全承認済みの記録)

## 3. 旧方式の残置物(壊さないこと・掃除は任意)

- `lib/horse-visual.ts` — **名前/レア度/価格/バッジ導出(`pickShowcase`/`deriveHorse`)は現役**
  (ランディングのカード文言はこれ)。旧見た目系(`deriveHorseArt`/`BASES`/パターン)は未使用化したが削除していない
- `components/HorseArt.tsx`・`public/horses/bases/`(18素体)・`bases_v3/`(24体退避・gitignore)・
  `lib/horse-palettes.ts`+`/dev/palette-preview`(案Aプロト・不採用) — 未使用。掃除するならオーナー確認後に別コミットで
- `/dev/*-preview` ページ群(本番404)は視覚QA資産として維持

## 4. 次のタスク(優先順)

1. **本番確認**(sevendaysderby.com — 7aa5c81反映後のマケプレ/厩舎/馬詳細)
2. **Manusへ連絡**: batch03R中止の正式連絡(発注文はチャット履歴にあり。未送なら「3アーキタイプ方式に確定、追加ポーズ不要」と伝える)
3. **NFTメタデータ画像**(ローンチ後フェーズ): サーバ側で同じ合成(nft-visual + node-canvas等)→ `metadata.image`。
   真HSV実装をサーバへ移植するだけ(クライアントと同一結果になることをテスト)
4. **レア度演出**(任意): LEGENDARY等に「細部差分版」をManus追加発注(§7.0参照)
5. **調整口**: ルックの追加/削除は `nft-visual.ts` の `BODY_DEGS`/`MANE_VARIANTS` を編集(シート番号と対応:
   B01..B12=0..330°、M01..M12=回転、M13=金mono47/M14=desat/M15=緋mono350/M16=緑mono140)

## 5. ハマりどころ(このフェーズで学んだこと)

- **グレースケール+着色は原画の色構造(イリデッセンス)を破壊する**。フルカラー原画の色相回転/写像は保存する — これが方式転換の核心
- モバイル検証はCDP `Emulation.setDeviceMetricsOverride` 必須(headless Chromeは最小幅500pxクランプ)
- マケプレのカード: **アートをカード幅いっぱいにするのはオーナーNG**(過去2回却下)。モバイルは2列×3行6枚・
  アートは余白を持って収まる(現在: art高さ PC200px/モバイル136px)
- dev server: 既存プロセスが :3000 に居ることがある(重複起動は3001に逃げて自滅)。実行前に `curl localhost:3000` 確認
- 検収は毎回独立再計測(Manus/Claudeデザイン納品とも、毎回実バグを検出してきた)
