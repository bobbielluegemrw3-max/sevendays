# 馬ビジュアル生成システム 仕様書(トレイト・タクソノミー + Manusアート発注)

> このファイルは **①Manusへのアート発注仕様** と **②レンダリングエンジンの設計仕様** を兼ねる。
> 目的: 10万頭以上の新規発行馬が **全て別の見た目** になり、かつ **同じ馬は常に同じ見た目**(決定論=検証可能)になること。ブランド「Provably fair / Deterministic」と整合。
> 作成: 2026-07-05 / 記録: [[sevendays-project-state]]、コピー正直化は `PRELAUNCH_COPY_RISKS.md`

---

## 0. 大原則
- 見た目は **馬が既に持つデータから決定論的に導出**する。AI画像生成は使わない(非決定論・高コスト・Decision 046と矛盾)。
- 各馬が既に保有(`packages/race-engine/src/horse-generation.ts` / `name-generator.ts`):
  - **`dnaHash`** = `SHA-256(mint_seed + horse_uuid + user_uuid + version)` = **256bitの一意な決定論エントロピー**
  - **`horseType`**(5種)/ **`rarity`**(5段)/ **`name` = Prefix + Suffix**(固定語彙40×40)
- 画像は保存しない。**DNAからその場で描画**(マーケット/ヒーロー=クライアント描画、NFT=サーバ決定論描画)。

## 1. 入力(1頭を描くのに使う値)
| 値 | 由来 | 役割 |
|---|---|---|
| `dnaHash`(hex64) | horse-generation | 全トレイト選択の乱数源。バイトを区間に切って各特徴を決める |
| `rarity` | COMMON/UNCOMMON/RARE/EPIC/LEGENDARY | ベースの解禁・フレーム・オーラ強度 |
| `horseType` | SPRINTER/POWER/BALANCED/ENDURANCE/LUCK | 差し色・エフェクト・一部ポーズ相性 |
| `namePrefix` | NAME_PREFIXES_V1(40語) | **主パレット(色系統)** を決める=名前と絵の一致 |
| `nameSuffix` | NAME_SUFFIXES_V1(40語) | **副モチーフ(粒子/アクセント)** を決める |

`dnaHash` のバイト割当(案・エンジンで確定):
```
[0-1] base選択  [2] coat shade  [3-4] mane hue/gradient  [5] markings on/off+種類
[6] markings色  [7] eye glow色  [8-9] particle量/種類  [10] aura strength
[11] pose微調整/反転  [12+] 予備(将来トレイト)
```

---

## 2. Manusへのアート発注(★最重要:この仕様通りに納品)

### 2.1 ベース種類 = 100 (ポーズ/体型の骨格多様性)
「完成画100枚」ではなく **再配色可能な素体100種**。カテゴリ例(配分は下の解禁ルールに従う):
- **Gallop/Dash**(疾走)— 標準・最多(全レア度で使用)
- **Trot/Idle/Stand**(常歩・佇立)— 標準
- **Rear/Roar**(棹立ち・雄叫び)— やや希少
- **Bow**(お辞儀)— やや希少
- **Pegasus/Winged**(有翼)— **高レア専用**
- **Sprint-Low**(低姿勢の全力)/ **Leap**(跳躍)など
- 性別ニュアンス: **Male型 / Female型 / Neutral**(たてがみ・体格の差)

各ベースにメタ(下記 `bases.json`)で `pose` `gender` `rarity_min` `type_affinity` を必ず付与。

### 2.2 納品フォーマット(1ベースあたり)
- **キャンバス**: 2048×2048、**透過PNG**、馬の**接地ライン・中心位置を全ベースで統一**(合成時にズレない)
- **統一スタイル**: 現行のネオン・クローム質感を100種で完全統一(光源・線幅・質感)
- **レイヤー分離(必須)** — 各レイヤーを別PNG(同一キャンバス・レジスト済み)で:
  | レイヤー | 内容 | 再配色 | 納品形式 |
  |---|---|---|---|
  | `coat` | 体(胴・脚・頭) | **する** | **グレースケール/ルミナンス**(陰影保持で塗り替え可能に) |
  | `mane_tail` | たてがみ・尾 | **する** | グレースケール |
  | `markings` | 斑紋・ライン(任意) | する | グレースケール(無い馬用に空も可) |
  | `eye_glow` | 目の発光 | する | 白/グレー |
  | `accents` | 蹄・金具など固定色 | しない | フルカラー |
  | `shading` | 陰影/AO(乗算用・任意) | しない | 乗算レイヤー |
  ※代替可: 「リージョンマスク1枚」(体=赤/たてがみ=緑/斑紋=青 で塗り分けたマップ)。ただし**レイヤー分離を推奨**。
- **重要**: `coat`/`mane`は**必ずグレースケール**で。エンジンが色を乗算/着色して陰影を保つため。フルカラーだと綺麗に塗り替えできない。
- **ファイル命名**: `base_{id2桁}_{layer}.png`(例 `base_07_coat.png`)
- **メタ**: `bases.json`
  ```json
  [{ "id":"07","pose":"pegasus","gender":"male","rarity_min":"EPIC","type_affinity":["LUCK"],"notes":"翼あり" }]
  ```

### 2.3 レア度によるベース解禁(希少ポーズは高レアに)
| rarity | 使えるベース |
|---|---|
| COMMON / UNCOMMON | 標準ポーズ(Gallop/Trot/Stand/Dash 等) |
| RARE | + Rear/Roar/Bow/Leap |
| EPIC | + Winged 一部・特別ポーズ |
| LEGENDARY | **全解禁 + Pegasus等の最上位ポーズ・専用エフェクト** |
COMMONが50%なので**標準ポーズを最も多く**(例 60種)、希少ポーズを段階配分。

---

## 3. トレイト・エンジン(私が実装。dnaHash→無限の個体差)

### 3.1 主パレット = 名前(Prefix)から(=名前と絵の一致)
`namePrefix` を色系統にマップ(`dnaHash` は系統内の濃淡・バリアントを選ぶ):
| 系統 | Prefix例 |
|---|---|
| **Gold/Amber** | Golden, Solar, Grand, Noble, Royal, Sacred, Bright, Dawn, Lucky |
| **Cyan/Ice** | Azure, Blue, Sky, Ocean, Wave, Crystal, Frozen |
| **Magenta/Violet** | Cosmic, Lunar, Mystic, Phantom |
| **Crimson/Fire** | Crimson, Scarlet, Burning |
| **Emerald** | Emerald, Wild |
| **Silver/Chrome** | Silver, White |
| **Onyx/Dark** | Black, Shadow, Dark, Night, Silent, Iron |
| **Electric** | Storm, Thunder, Rapid, Rising, Wind, Desert, Falling, Brave |
→ 「Golden Comet」=金×彗星粒子、「Frozen Wolf」=氷×寒色、と**名前を見れば色が想像でき、絵と一致**。

### 3.2 副モチーフ = 名前(Suffix)から
`nameSuffix` を粒子/アクセントにマップ: Comet/Meteor/Star→星屑粒子、Flame/Burning→炎、Frost→氷結晶、Thunder/Storm→稲妻、Dragon/Falcon/Eagle/Wolf/Tiger/Lion→微細エンブレム、Wave/River→流体、等。

### 3.3 dnaHash が振る無限バリエーション
- coat の色相/明度/金属光沢の微調整、mane のネオングラデ2色、斑紋の有無・形・色、目の発光色、粒子の量/流れ、オーラの強さ、左右反転 等。
- 同一 (base, prefix, suffix) でも `dnaHash` 差で**別個体**に見える。

### 3.4 レア度・タイプの反映
- **rarity**: LEGENDARY=金フレーム+強オーラ+専用パーティクル / EPIC=マゼンタ枠 / RARE=シアン枠 …(現行カードの枠色に一致)
- **horseType**: 差し色やエフェクト(SPRINTER=速度線、POWER=重厚な粒子、LUCK=きらめき 等)

### 3.5 描画技術
- 表示: **HTML Canvas**(レイヤー着色=luminanceにcolorを乗算/スクリーン、+プロシージャルな粒子/オーラ/枠)
- NFT画像: 同ロジックをサーバ(node-canvas等)で決定論描画→PNG(or SVG)。`memorial_nfts.metadata_json.image` に反映。
- 全て `dnaHash` 決定論 → **同じ馬は常に同じ絵**(検証可能)。

---

## 4. 適用先
- **マーケットプレイスの“毎回違う馬”**: プレローンチ=ローテーションseedでサンプル馬を生成表示 / ローンチ後=**実DBの出品馬・新規発行馬**を引いて描画(架空スタッツ問題の解消と直結、`PRELAUNCH_COPY_RISKS.md` R2関連)
- **ヒーローNFTカード**: 実馬 or 日替わりseedの“今日の一頭”
- **記念NFT `image`**: その馬のDNAアート

---

## 5. ロードマップ
1. **本仕様書**(これ)— ✅
2. **エンジンPOC**: 現行アセット(または1ベース)で `dnaHash`→色/たてがみ/斑紋/レア度枠が変わる決定論描画を実演(方向性を目視確認)
3. **Manusが100ベースを §2 の仕様通りに制作**(並行)
4. トレイト・タクソノミー確定 + エンジン本実装(name→palette / suffix→motif / rarity-type)
5. マーケット結線(サンプル→実DB)+ ヒーロー結線
6. NFT画像パイプライン(サーバ決定論描画→metadata.image)

## 6. 決めたい/確認したいこと
- ベース配分(標準:希少の比率)と、Pegasus等の解禁レア度
- name→palette マッピングの最終確定(§3.1のドラフトで良いか)
- POCを **どのアセットで** 先に見せるか(現行4枚 or Manusの最初の数ベース待ち)

---

## 7. 実装済みエンジン(現行コードの正典 — 2026-07-05)

> §2〜3は当初の発注/設計ドラフト。**ここが現在デプロイされている実装の正典**。コードは
> `apps/web/lib/horse-visual.ts`(純粋な決定論導出=単一の真実源)と
> `apps/web/components/HorseArt.tsx`(クライアントCanvas描画)。
> プレローンチは毎リクエスト乱数seed、ローンチ後は実馬の `dnaHash` 由来seedを渡す。
> **同じseed→同じ全ピクセル**(検証可能)。名前(Prefix)↔色 の一致は維持。

### 7.1 毛色ロジック(coat の色使い)
1. **主色 coat** = `PREFIX_HUE[prefix]` の `[hue, sat, hiL]` を取り、`dnaHash`(rng)で hue±22° / sat±0.1 ジッター。
   - `metallicRamp(h,s,hiL)` = `[影=hsl(h, s*1.1, 0.16), ハイライト=hsl(h, s*0.98, hiL)]` の2点ランプ。luminanceで補間しメタリック陰影を作る。
   - `PREFIX_HUE` は40 Prefix を色相環全体に配置(原色も使用)。Silver/White=低彩度、Black/Shadow/Dark/Night/Iron=暗クローム(低hiL)。
1b. **純色モード pure**(オーナー要望 2026-07-05)= **約24%の馬は全身1色**。`rng()<0.24` で発動し、
   パターン=`solid`固定・`coatB=coat`・maneも同色相(明度+0.14で輪郭確保)。
   - 鮮色Prefix(sat≥0.45): 彩度を`max(0.96,sat)`へ引き上げ+ハイライト明度0.58(彩度が最大になるl≈0.5帯)→ **真っ赤/真っ青/真緑/真っ黄の原色クローム**。
   - モノクロ系Prefix(Black/White/Silver/Shadow等 sat<0.45): 彩度・明度は据え置き → **真っ黒/真っ白/銀のクローム**。
   - 色相はPrefix由来のまま(名前↔色の一致は不変。変えるのは鮮やかさのみ)。
2. **副色 coatB**(2色目)= 非pure(76%)のみ。coat から関係性を rng で選択。**地味を減らしハッキリ違う配色を多く**:
   | 分岐 | 確率 | 内容 |
   |---|---|---|
   | 同色シェード(彩度↓・明度↑) | 16% | 上品な微差(希少に留める) |
   | 広めアナログ ±46〜90° | 30% | 明確に違う近縁色 |
   | 補色 +180° | 30% | 大胆な2色 |
   | 分裂補色 +150/210° | 16% | |
   | トライアド ±120° | 8% | |
3. **空間パターン CoatPattern**(=胴体1色ベタ塗りを卒業した核心)。`pickPattern(rng)` が `dnaHash` から選ぶ。
   `HorseArt.paintCoat()` が **体のbbox内で正規化した位置 (nx: 尻→頭, ny: 背→腹)** を `regionT()` に渡し、
   0=coat / 1=coatB の重みで2ランプを補間 → その上に luminance でメタリック陰影を乗せる。
   | kind | 確率 | 塗り分け |
   |---|---|---|
   | `solid` | 12% | 単色(1種として残す) |
   | `upperLower` | 16% | 背 vs 腹(上下2色) |
   | `frontRear` | 14% | 前躯 vs 後躯 |
   | `gradient` | 16% | 斜め方向の滑らかな2色 |
   | `socks` | 12% | 下脚だけ別色(靴下) |
   | `points` | 12% | 脚+口先(鹿毛のポイント) |
   | `shoulder` | 10% | 局所パッチ(「右肩だけ」) |
   | `dapple` | 8% | メタリックな斑(値ノイズ `vnoise`) |
   - `regionT` の境界は `smoothEdge`(smoothstep)でソフト。`dapple` は整数ハッシュ `hash2`→bilinear の決定論ノイズ。
4. **たてがみ mane** = coat から補色ネオン(50%)/近縁+42°(30%)/同色(20%)を選び `tint()` で単色着色。

### 7.2 カード枠線ロジック(枠=馬の色に一致)
- 旧: 枠線/グロー = **レアリティ5色固定**(cyan/gray/green/pink/gold)→「数種類しかない」問題。
- 新: `hue = normalize(coatHue)` から **その馬の色で枠一式を生成**(色相環全体=フルスペクトラム):
  - `frameLine = hsl(H 82% 62%)` … カード枠線・ID文字色
  - `frameGlow = hsl(H 88% 55% / .5)` … 外側グロー(CSS var `--rar-line/--rar-glow` に注入)
  - `framePanel = hsl(H 72% 50% / .14)` … アート背景の放射ウォッシュ
  - `frameGrad = linear-gradient(92deg, hsl(H 80% 58%), hsl(H 85% 74%))` … 購入ボタン地(文字は `#0a0813`)
- **レアリティは枠でなくバッジ(COMMON/…/LEGENDARY のリボン `rarityRibbon/rarityInk`)で表示継続**。`rarityLine/rarityGlow/rarityPanel` はカードでは不使用に。

### 7.3 TOPマケプレの並びロジック(同系色を絶対に並べない)
- `pickShowcase(count, nextSeed)`(`horse-visual.ts`):
  1. 色相環を `360/count`° で分割し、**1バケット1頭=全頭が別の色系統**になるよう rejection sampling(guard 4000, 不足時は安全fill)。
  1b. **見た目ファミリー判定**(2026-07-05追加。バケットだけでは352°と30°など境界すり抜けが起きるため):
     - 主色相の距離 <36° の候補は却下(バケット境界の近似色対策)。
     - **配色ペア却下**: 主色相 <70° かつ アクセント色相(`accentHue`=solid時はmane、それ以外はcoatB)<50° が既採用と重なる候補は却下 → 「暖色ボディ+ティール差し色」が2頭並ぶ事故を排除。
     - **トーン上限**: `tone`(dark=ハイライト明度<0.5 / pale=彩度<0.22 / vivid)で、**dark系・pale系は各最大1頭**。紺と暗青緑のような「黒っぽい双子」を排除。
  2. hue昇順ソート後、**count と互いに素なストライド(≈count/3)** でリング walk → 隣接カードが色相環で最も離れる。
  3. 各馬は依然として自分のseedから完全導出(名前↔色の一致は不変)。
- `Landing.tsx` は `pickShowcase(8, () => (Math.random()*0xffffffff)>>>0)`。8頭=8系統が虹状に配置され、縦横どの隣も系統が大きく違う。ヒーローは固定金色 `base_24`(power_stride / V4ガンメタ。2026-07-05オーナー指定)+ `upperLower` の淡い上下2色。

### 7.4 フレーミング(サイズ統一)
- `HorseArt.bodyBBox()` = coatレイヤーのalphaから体の外接矩形。体幅を枠の94%(高さ72%上限)に正規化し中央配置 → ポーズ差でサイズがばらつかない。全馬右向き(`flip=false`)。

### 7.5 現行アセットと今後
- 素体は `apps/web/public/horses/bases/base_{NN}_{coat|mane_tail|eye_glow|accents}.png`(512px, 透過, レジスト済み)。
- Manus v2で31体納品→ **オーナー承認19体のみ採用**(除外: 05,09,11,12,13,14,18,23,24,25,26,31)。`BASES` 配列が採用マニフェスト。
- **★このベース群はクオリティ不足のため全面改修が決定**(2026-07-05)。差し替え手順は **`HORSE_BASE_REBUILD_HANDOVER.md`** を参照。エンジン(7.1〜7.4)は素体が替わっても不変。
