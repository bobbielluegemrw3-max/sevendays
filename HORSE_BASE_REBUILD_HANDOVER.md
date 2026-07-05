# 馬ベースアート 全面改修 引継ぎ書

> 作成: 2026-07-05 / 親仕様: `HORSE_VISUAL_SYSTEM.md`(特に **§7 実装済みエンジン**)/ 記録: [[sevendays-horse-visual-system]]
> **目的**: Manus納品の現行素体(v2・31体→採用19体)は**クオリティが低すぎる**ため、Manusに**新バージョンの馬型を全面的に作り直させ**、現行ベースを全廃して差し替える。
> **新しいセッションはこのファイルを読めば続きから再開できる。**

---

## 0. 大前提(これは変えない)

- **描画エンジンは素体に非依存**。`apps/web/lib/horse-visual.ts`(決定論導出)と `apps/web/components/HorseArt.tsx`(Canvas描画)は、
  素体が替わっても**そのまま動く**。色使い/2色パターン/枠線/並び替えロジックは `HORSE_VISUAL_SYSTEM.md §7` が正典。
- 替わるのは **(a) 画像アセット `apps/web/public/horses/bases/`** と **(b) 採用マニフェスト `BASES`(horse-visual.ts内)** の2つだけ。
- **同じ馬は常に同じ見た目**(dnaHash決定論)/ **名前(Prefix)↔色の一致** は不変。AI画像生成は使わない。

## 1. 現在地(2026-07-05 時点)

- **エンジンは完成・稼働中**。今セッションで以下を実装済み(§7参照):
  - 胴体の**空間2色パターン**(upperLower/frontRear/gradient/socks/points/shoulder/dapple/solid)
  - 2色目のコントラスト強化(補色/分裂補色/トライアド多め)
  - **枠線=馬の毛色**(フルスペクトラム)/レアリティはバッジ表示
  - **TOPマケプレ=同系色が並ばない** `pickShowcase()`(全頭別系統・色相環最遠配置)
  - ⚠️ **これらの変更はまだ未コミット**(作業ツリーにある)。ベース差し替えと一緒に、または先にコミットしてよいか要確認。
- **現行アセット**: `apps/web/public/horses/bases/base_{NN}_{coat|mane_tail|eye_glow|accents}.png`(512px, 透過, レジスト済み)。
  - Manus v2で **31体納品**、うち `BASES` は**採用19体**(除外: 05,09,11,12,13,14,18,23,24,25,26,31)。
  - **この31体すべてを非採用**にして新版へ置換するのが本タスク。
- ベースライン: git tag `landing-baseline-v1`(TOPデザインの基準)。

## 2. Manusへの再発注(納品仕様)

**`HORSE_VISUAL_SYSTEM.md §2.2` の納品フォーマットを厳守**させる。要点の再掲+過去の失敗の教訓:

- **キャンバス 2048×2048 透過PNG**、**全ベースで接地ライン・中心を統一**(合成でズレない)。
- **レイヤー分離必須**・各レイヤー別PNG(同一キャンバス・レジスト済み):
  `coat`(体) / `mane_tail`(たてがみ・尾) / `eye_glow`(目発光) / `accents`(蹄・金具=固定色フルカラー)。任意で `markings` `shading`。
- **`coat` と `mane_tail` は必ずグレースケール/ルミナンス**(エンジンが着色し陰影を保つ)。フルカラー納品は塗り替え不可でNG。
- **命名**: `base_{id2桁}_{layer}.png`(例 `base_07_coat.png`)。メタ `bases.json`(id/pose/gender/rarity_min/type_affinity)。
- **★過去のバグ(必ず検証)**: v1の `mane_tail` に**不透明の暗い背景**が乗っており、独立合成で体を覆った。
  → 納品後に**独立レイヤー着色テスト**(体=金・たてがみ=シアン等、別色で合成)して、背景の不透明ピクセルが無いこと(不透明率≈数%以下)を確認する。Python(numpy+PIL)での検証実績あり。
- **品質**: 現行のネオン・クローム質感を全種で完全統一(光源・線幅・質感)。今回はこの質感/造形自体の底上げが目的。
- (任意提案)「右肩だけ」等を**解剖学的に正確**に塗りたいなら、**部位リージョンマスク1枚**(体の部分を色分けしたマップ)を追加納品させると、`regionT` を実マスク参照に拡張して肩・脚・首へピタリ合わせられる。無くても手続き的パターンで動く。

## 3. 差し替え手順(オーナー指定の5ステップ)

### ① Manusが新バージョンの馬型を納品
- 受領物(2048px 4レイヤー×N体 + bases.json)を**まず一時領域**に置く(スクラッチパッド or `apps/web/public/horses/bases_v3/` 等、現行を壊さない)。
- **独立レイヤー着色テスト**(§2の教訓)を実行し、`mane_tail` 背景不透明バグが無いことを確認。NGなら差し戻し。
- Web用に **2048→512px にダウンスケール**(現行と同様)。バッチ変換スクリプトはスクラッチパッドの過去資産を流用可。

### ② 全納品をローカルサーバーで一覧できるページを作る(オーナー確認用)
- **既存の `apps/web/public/horse-bases-sheet.html` を流用/複製**(gitignore済み・ローカル専用・`http://localhost:3000/horse-bases-sheet.html` で閲覧)。
  - このHTMLは全ベースを**実カードと同じフレーミング(体を大きく)** で描画し、色は判断用に**金で統一**、左上に**baseID番号**を大表示する自己完結ページ。
  - 中の `BASES` 配列を**新納品の全IDに差し替える**だけで一覧になる。新版を別ディレクトリに置いた場合は画像パス(`/horses/bases/…`)も合わせる。
- dev serverは `pnpm --filter web dev`(:3000)。オーナーが番号で除外を指定できる状態にする。
- スクショ確認する場合の**注意**: 非エミュレーションのheadlessスクショは実寸を誤認させる。モバイル検証はCDP `Emulation.setDeviceMetricsOverride`、ギャラリー拡大確認はCDP page target(`/json`)+ `Page.captureScreenshot`(browser targetでは Runtime/Page 不可)。過去のCDPスクリプトはスクラッチパッドにあり。

### ③ 除外馬をオーナーが選ぶ
- オーナーが「ダメな番号」を口頭指定(前回例: 「05 09 11 …」)。採用IDリストを確定。

### ④ 現行の馬画像ベースを全て非採用にする
- `apps/web/public/horses/bases/` の**現行 base_*.png(31体×4=124枚 + bases.json)を全削除**(または退避)。
- `horse-visual.ts` の `BASES` 配列を空にする/コメントアウト(この時点でTOPは描画不可になるので④⑤は連続で行う)。

### ⑤ 新バージョンの型に差し替える
- 新512px素体を `apps/web/public/horses/bases/` に配置(命名 `base_{NN}_{layer}.png` を踏襲)。`bases.json` も更新。
- `horse-visual.ts` の `BASES` を**採用IDのみ**で再構築。希少ポーズには `rarityMin`(COMMON<UNCOMMON<RARE<EPIC<LEGENDARY)を設定(§2.3 解禁ルール)。
- ヒーローは現状 `base_01` を金色固定使用(`Landing.tsx` の `HERO_*`)。新版でヒーロー相当の型IDが変わるなら差し替える。
- **検証**: `pnpm --filter web lint` / `pnpm --filter web build`(「Client bundle check passed」を確認)→ TOPをスクショで目視(色の多様性・枠線一致・同系色非隣接)。
- **重要な運用ルール**: 素体アセットは**エンジンコードと同一コミット**で入れる(バラで入れると本番描画が壊れる)。コミットはオーナーが指示したときのみ。

## 4. 関連ファイル早見

| 対象 | パス |
|---|---|
| 決定論エンジン(色/パターン/枠/並び) | `apps/web/lib/horse-visual.ts` |
| Canvas描画(paintCoat/tint/bbox/framing) | `apps/web/components/HorseArt.tsx` |
| TOP(ヒーロー+マケプレ結線) | `apps/web/components/Landing.tsx` / `components/landing.module.css` |
| 素体アセット(差し替え対象) | `apps/web/public/horses/bases/base_*.png` |
| 全ベース一覧(ローカル確認・gitignore) | `apps/web/public/horse-bases-sheet.html` |
| 仕様/設計の正典 | `HORSE_VISUAL_SYSTEM.md`(§7=実装正典) |
| ローンチ前コピーの正直化リスク | `PRELAUNCH_COPY_RISKS.md`(R2=架空スタッツ、実DB結線で解消) |

## 5. 未確定/確認したいこと
- 今セッションのエンジン変更(色2色パターン/枠線/pickShowcase)を**今コミットしてよいか**、ベース差し替えまで待つか。
- 新版の**ベース総数**と、希少ポーズ(Rear/Bow/Pegasus等)を今回入れるか(§2.3の解禁配分)。
- 「右肩だけ」等の精密塗りのために**部位マスク**をManusに追加発注するか(§2 任意提案)。
- ローンチ後の**実DB結線**(マケプレ=実出品馬、NFT=サーバ決定論描画→metadata.image)は本改修後のフェーズ。
