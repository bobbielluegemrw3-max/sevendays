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
