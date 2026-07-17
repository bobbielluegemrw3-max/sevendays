# Manus発注: アイテムアイコン35種 V2(Item Catalog V2, Decision 109)

> 作成: 2026-07-18 / 納品先: `apps/web/public/items/{key}.png`(ファイル名は下表のkeyと完全一致)
> 世界観: 前回納品(`seven_days_derby_items35.zip`)と同一トーン — メタリックなフルカラー馬(NFTアート)と同族。
> サイトは暗色(ほぼ黒の紺紫)+ネオンシアン/マゼンタ/ゴールドのアクセント
> ※旧35種とは**別の新カタログ**です。モチーフが近いもの(毛布・バイザー等)も**新規に描き起こし**てください

## 共通スタイル指定(全35枚に適用)

```
Create a game item icon in a consistent set style.

STYLE: Premium metallic object icon, matching a collection of metallic
chrome horses with iridescent full-colour reflections. Polished chrome and
coloured metal surfaces, luminous rim light, subtle neon glow. Painterly
3D-render look, high detail, jewel-like finish.

COMPOSITION: One single object, centered, floating on a very dark
navy-purple background (#0a0714, near black), soft radial glow behind the
object, slight bottom reflection. Square 1:1, object fills ~70% of frame.
No text, no letters, no watermark, no border, no human, no horse in frame.

TIER ACCENT (rim-light / glow colour per tier):
- BASIC tier: cyan neon glow (#00eaff)
- STANDARD tier: violet-blue glow (#b3c7ff)
- PREMIUM tier: rich gold glow (#f2e4bf)
- MEMORIAL tier (burn drops): deep ember-red glow (#ff5c5c), slightly
  somber and sacred mood

Same lighting, same camera angle (3/4 slightly above), same background
across the whole set — they must read as one family.
```

## 各アイテムの被写体(35枚)

### BASIC(シアンの光・15枚)

| key | 名前 | 被写体プロンプト |
|---|---|---|
| carrot_cube | にんじんキューブ | a neat stack of glowing orange carrot cubes on a small chrome dish |
| highland_hay | 高原の干し草 | a golden hay bale tied with rope, mountain-fresh glow, stray straws catching light |
| foal_milk | 若駒のミルク | a glass milk bottle with a soft pearly glow, tiny hoof-print emblem on the label area (no letters) |
| hill_manual | 坂路の心得 | an ancient training manual lying open, embossed slope diagram on the pages, gilt edges |
| pool_float | プールの浮き具 | a horse-sized swim float ring in chrome and cyan, gentle water ripples beneath |
| gate_bell | ゲートの鈴 | a polished brass starting bell with a short pull rope, faint ring-vibration shimmer |
| wood_premium | 極上ウッドチップ | a heap of premium wood chips in a chrome tray, warm resin glow |
| rain_cape | 雨のケープ | a sleek horse rain cape with beading water droplets, storm-grey sheen |
| sun_visor | 陽よけのバイザー | a sleek racing visor reflecting a bright sun flare |
| mud_shoes | 道悪蹄鉄 | a pair of deep-cleat mud horseshoes with wet earth texture |
| speed_calks | 快速カルクス | featherlight chrome racing calks with wind-streak trails |
| storm_eye | 嵐の眼 | a swirling storm vortex captured inside a glass sphere, calm glowing eye at the center |
| clear_plume | 快晴の羽根飾り | a pristine white plume ornament catching brilliant sunlight |
| deep_tread | 不良の深爪 | a horseshoe with exaggerated deep treads, flecks of dark mud |
| firm_grip | 堅良のグリップ | a horseshoe with fine grip-etched surface, dry firm-track dust drifting |

### STANDARD(青紫の光・10枚)

| key | 名前 | 被写体プロンプト |
|---|---|---|
| protein_mash | プロテインマッシュ | a chrome feed pail of rich steaming mash with a power-grain sheen |
| farrier_kit | 装蹄キット | an open farrier's toolkit — hammer, rasp and a fresh horseshoe on a dark leather roll |
| spar_guard | 併せ馬の防具 | a padded sparring headguard and chest protector set for a horse, sturdy straps |
| veteran_blanket | 古馬の毛布 | a dignified quilted horse blanket with worn gold trim and service medals |
| storm_armor | 嵐の完全装具 | full storm barding armour with cloud-dark plates and tiny lightning glints |
| solar_silks | 快晴の勝負服 | radiant racing silks shimmering with a sunburst pattern |
| mud_plates | 重馬場プレート | heavy-duty dark racing plates for deep going, mud-shedding grooves |
| glass_plates | 良馬場プレート | crystal-clear glass-like racing plates with prism reflections |
| field_kit | 野営一式 | a compact field kit — folded tarp, coiled rope, lantern and tools bundled neatly |
| steady_tack | 堅実な馬具 | a plain, honest, well-made tack set in matte leather, no ornament, quiet reliability |

### PREMIUM(ゴールドの光・5枚)

| key | 名前 | 被写体プロンプト |
|---|---|---|
| royal_feast | ロイヤルフィースト | a golden trough overflowing with luminous royal feed, crown emblem |
| masters_eye | 名伯楽の眼 | a wise brass monocle on a fine chain, engraved eye emblem, calm knowing glow |
| awakening_elixir | 覚醒のエリキシル | a tall ornate elixir bottle with swirling radiant liquid, energy wisps escaping the cork |
| synergy_incense | 好物の香 | an ornate incense burner with two intertwining smoke ribbons forming a knot of light |
| full_harness | 完全装備 | a complete premium harness-and-gear set displayed on a stand, gold fittings |

### MEMORIAL・非売品Burnドロップ(残り火の赤い光・神聖で静かな雰囲気・5枚)

| key | 名前 | 被写体プロンプト |
|---|---|---|
| keepsake_shoe | 形見の蹄鉄 | a cherished old horseshoe on a velvet cushion, soft ember glow, one small candle beside |
| memorial_wreath | 追悼の花冠 | a memorial flower wreath of dark roses and ember petals, quiet dignity |
| legacy_mane | 遺志のたてがみ | a lock of flowing silver horse mane tied with a red ribbon, faintly luminous |
| roar_soul | 咆哮の魂 | a spectral flame shaped like a rearing horse spirit, contained in a dark orb |
| stardust_sand | 星霜の砂 | an hourglass pouring glittering stardust sand, embers drifting around it |

## 納品仕様

- PNG・正方形・**1920×1920推奨(最低1024×1024)**・背景は共通の暗色(#0a0714系)ベタでOK(透過不要)
- ファイル名は `key.png`(例: `carrot_cube.png`)— 上表のkeyと完全一致
- 35枚のトーン統一が最重要(照明・角度・背景を揃える)。1枚だけ浮くとカタログUIで目立ちます
- Web用512px WebPへの変換はこちらで行います(原本マスターのみ納品でOK)
