# Manus発注: アイテムアイコン35種(Item System, Decision 078)

> 作成: 2026-07-07 / 納品先: `apps/web/public/items/{key}.png`(ファイル名は下表のkeyと完全一致)
> 世界観: Manus制作のメタリックなフルカラー馬(NFTアート)と同一トーン。サイトは暗色(ほぼ黒の紺紫)+ネオンシアン/マゼンタ/ゴールドのアクセント

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

RARITY ACCENT (rim-light / glow colour per tier):
- BASIC tier: cyan neon glow (#00eaff)
- STANDARD tier: violet-blue glow (#b3c7ff)
- PREMIUM tier: rich gold glow (#f2e4bf)
- MEMORIAL tier (burn drops): deep ember-red glow (#ff5c5c), slightly
  somber and sacred mood

Same lighting, same camera angle (3/4 slightly above), same background
across the whole set — they must read as one family.
```

## 各アイテムの被写体(35枚)

### BASIC(シアンの光)
| key | 名前 | 被写体プロンプト |
|---|---|---|
| speed_feed | スピードフィード | a sleek feed bag of glowing blue-cyan energy pellets, chrome scoop, motion-streak emblem |
| power_feed | パワーフィード | a heavy feed bag of dense crimson-metal grain pellets, chrome scoop, anvil emblem |
| recovery_feed | リカバリーフィード | a soft feed bag of gentle green-glow herbal pellets, chrome scoop, heart-pulse emblem |
| sugar_cube | 角砂糖 | a single crystalline sugar cube, glass-like with inner sparkle, on a tiny chrome dish |
| mint_herb | ミントハーブ | a fresh sprig of metallic mint leaves with cool vapor rising |
| salt_lick | 岩塩ブロック | a chunky pink rock-salt block on a chrome hook, crystalline facets |
| cool_towel | クールタオル | a neatly folded icy-blue towel with frost shimmer and water droplets |
| chamomile | カモミールの束 | a bundle of chamomile flowers with metallic white petals, tied with ribbon |
| four_leaf_clover | 四つ葉のクローバー | a four-leaf clover of polished green metal, dew drop sparkling |
| iron_horseshoe | 鉄の蹄鉄 | a rugged dark-iron horseshoe, battle-worn but proud, faint orange heat at edges |
| morning_dew | 朝露の雫 | a large luminous dew drop suspended over a young leaf, dawn-light refraction |
| carrot_bundle | にんじん束 | a bundle of glossy metallic-orange carrots tied with twine |

### STANDARD(青紫の光)
| key | 名前 | 被写体プロンプト |
|---|---|---|
| lucky_charm | ラッキーチャーム | a small ornate charm amulet on a chain, horseshoe-and-star motif, gently glowing |
| double_feed | ダブルフィード | twin feed bags side by side, overflowing with radiant pellets |
| deep_rest_kit | 深休みキット | a plush stable pillow with a folded blanket and a small sleep-mask, moonlit |
| spa_treatment | スパトリートメント | a steaming wooden spa bucket with chrome fittings, towel and glowing bath salts |
| focus_bridle | 集中の頭絡 | an elegant racing bridle of dark leather and chrome, single gem on the browband |
| comeback_tonic | カムバックトニック | a glass tonic bottle with swirling rising liquid light inside, cork stopper |
| storm_cloak | ストームクローク | a dramatic rain cloak with storm-cloud sheen and tiny lightning glints |
| sunny_visor | サニーバイザー | a sleek racing visor reflecting a bright sun flare |
| endurance_wrap | 持久のラップ | professional leg wraps coiled neatly, woven metal fibre texture |
| sprint_spurs | 疾走の拍車 | a pair of aerodynamic chrome spurs with wind-streak trails |
| veteran_blanket | 古馬の毛布 | a dignified quilted horse blanket with worn gold trim and service medals |
| twin_horseshoes | 双子の蹄鉄 | two interlocked polished horseshoes forming a figure-eight |

### PREMIUM(ゴールドの光)
| key | 名前 | 被写体プロンプト |
|---|---|---|
| champion_saddle | チャンピオンの鞍 | a majestic championship saddle of gold and deep leather, laurel engraving, radiant |
| royal_feast | ロイヤルフィースト | a golden trough overflowing with luminous royal feed, crown emblem |
| miracle_water | ミラクルウォーター | a crystal flask of liquid starlight water, halo of droplets orbiting it |
| golden_charm | ゴールデンチャーム | a solid-gold charm amulet, horseshoe with a diamond star, brilliant sparkle |
| war_banner | 戦旗 | a battle standard flag on a gold pole, flowing dramatically, horse-head crest |
| phoenix_feather | 不死鳥の羽根 | a single blazing phoenix feather, ember particles rising, gold-to-crimson gradient |

### 非売品・Burnドロップ(残り火の赤い光・神聖で静かな雰囲気)
| key | 名前 | 被写体プロンプト |
|---|---|---|
| memento_horseshoe | 形見の蹄鉄 | a cherished old horseshoe on a velvet cushion, soft ember glow, one small candle beside |
| memorial_wreath | 追悼の花冠 | a memorial flower wreath of dark roses and ember petals, quiet dignity |
| legacy_mane | 遺志のたてがみ | a lock of flowing silver horse mane tied with a red ribbon, faintly luminous |
| spirit_roar | 咆哮の魂 | a spectral flame shaped like a rearing horse spirit, contained in a dark orb |
| stardust_sand | 星霜の砂 | an hourglass pouring glittering stardust sand, embers drifting around it |

## 納品仕様

- PNG・正方形・**1024×1024以上**・背景は共通の暗色(#0a0714系)ベタでOK(透過不要)
- ファイル名は `key.png`(例: `speed_feed.png`)— 上表のkeyと完全一致
- 35枚のトーン統一が最重要(照明・角度・背景を揃える)。1枚だけ浮くとカタログUIで目立ちます
