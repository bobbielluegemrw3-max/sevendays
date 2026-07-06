/**
 * 案A: キュレーテッドパレット方式のプロトタイプ (dev preview 専用・本番未結線)。
 *
 * 自由な HSL 乱数をやめ、人間がデザインした「カラーウェイ」(影→ハイライトの
 * 金属ランプ + たてがみ + 2色目) から dnaHash が選ぶ。乱数の自由度は
 * 「どのパレットか + 色相±4°のジッター + パターン + ベース」だけに制限する。
 *
 * 金属の鉄則: ハイライトは白寄り・低彩度 (スペキュラが金属に見える)。
 * 影は深く、その色相を最も濃く持つ。名前 Prefix はパレットファミリーを決める。
 */
import type { Rgb, CoatPattern, HorseVisual, Rarity } from '@/lib/horse-visual';

export interface Colorway {
  id: string;
  label: string; // preview 表示用
  coat: [Rgb, Rgb]; // [shadow, highlight] 設計済みランプ
  coatB?: [Rgb, Rgb]; // 2色目 (無ければ solid / 同系シェード)
  mane: [Rgb, Rgb];
  hue: number; // 枠線・ショーケース分散用の代表色相
  tone: 'dark' | 'pale' | 'vivid';
}

/* ============================== 24 カラーウェイ ============================== */
export const COLORWAYS: Colorway[] = [
  // ---- 金・暖色系 ----
  { id: 'aurum', label: '金 / オーラム', coat: [[58, 40, 10], [255, 226, 150]], mane: [[60, 50, 22], [255, 246, 214]], hue: 45, tone: 'vivid' },
  { id: 'champagne', label: 'シャンパン', coat: [[64, 52, 36], [250, 235, 205]], mane: [[70, 62, 50], [255, 250, 240]], hue: 40, tone: 'pale' },
  { id: 'amber', label: '琥珀', coat: [[52, 28, 6], [255, 190, 90]], coatB: [[40, 18, 4], [200, 130, 60]], mane: [[64, 40, 16], [255, 235, 200]], hue: 35, tone: 'vivid' },
  { id: 'copper', label: '銅 / 緑青差し', coat: [[50, 22, 10], [255, 166, 110]], coatB: [[10, 44, 40], [140, 230, 205]], mane: [[16, 52, 46], [170, 240, 220]], hue: 22, tone: 'vivid' },
  { id: 'sunset', label: '銅 × 藍', coat: [[48, 20, 12], [255, 150, 96]], coatB: [[14, 18, 48], [120, 140, 220]], mane: [[18, 22, 56], [150, 170, 240]], hue: 18, tone: 'vivid' },

  // ---- 赤系 ----
  { id: 'crimson', label: '深紅クローム', coat: [[64, 8, 16], [255, 128, 118]], mane: [[52, 50, 56], [244, 244, 250]], hue: 355, tone: 'vivid' },
  { id: 'scarlet', label: '緋 / 黒ポイント', coat: [[70, 12, 8], [255, 110, 90]], coatB: [[14, 12, 16], [90, 84, 96]], mane: [[16, 14, 18], [120, 112, 126]], hue: 8, tone: 'vivid' },
  { id: 'rose', label: 'ローズメタル', coat: [[58, 14, 34], [255, 176, 205]], mane: [[54, 52, 58], [246, 246, 252]], hue: 335, tone: 'vivid' },

  // ---- 青系 ----
  { id: 'royal', label: 'ロイヤルブルー', coat: [[12, 20, 62], [136, 182, 255]], mane: [[58, 58, 64], [250, 250, 255]], hue: 222, tone: 'vivid' },
  { id: 'sapphire', label: 'サファイア × 金', coat: [[10, 18, 56], [120, 170, 250]], coatB: [[56, 40, 12], [250, 220, 145]], mane: [[60, 46, 16], [255, 240, 200]], hue: 225, tone: 'vivid' },
  { id: 'arctic', label: '氷鋼', coat: [[24, 40, 52], [200, 240, 252]], mane: [[10, 46, 56], [160, 245, 255]], hue: 195, tone: 'pale' },
  { id: 'cyanice', label: 'シアンアイス', coat: [[8, 40, 56], [168, 240, 255]], mane: [[56, 58, 62], [250, 252, 255]], hue: 190, tone: 'vivid' },
  { id: 'ocean', label: '深海ティール', coat: [[6, 42, 46], [130, 232, 226]], mane: [[52, 56, 58], [246, 252, 252]], hue: 175, tone: 'vivid' },
  { id: 'midnight', label: '紺 × 銀腹', coat: [[10, 14, 34], [96, 120, 190]], coatB: [[40, 44, 52], [225, 232, 244]], mane: [[44, 48, 56], [235, 240, 250]], hue: 230, tone: 'dark' },

  // ---- 緑系 ----
  { id: 'emerald', label: 'エメラルド', coat: [[6, 44, 28], [125, 255, 190]], mane: [[52, 58, 54], [246, 255, 250]], hue: 150, tone: 'vivid' },
  { id: 'jade', label: '翡翠 × 金', coat: [[8, 40, 30], [120, 230, 180]], coatB: [[56, 42, 12], [250, 222, 150]], mane: [[60, 48, 18], [255, 242, 205]], hue: 158, tone: 'vivid' },
  { id: 'lime', label: 'ネオンライム', coat: [[28, 46, 6], [212, 255, 128]], mane: [[54, 58, 50], [250, 255, 244]], hue: 82, tone: 'vivid' },

  // ---- 紫系 ----
  { id: 'violet', label: '紫 × シアン', coat: [[30, 12, 58], [198, 152, 255]], mane: [[12, 48, 58], [150, 240, 255]], hue: 272, tone: 'vivid' },
  { id: 'amethyst', label: 'アメジスト × 金', coat: [[34, 12, 50], [206, 160, 250]], coatB: [[56, 42, 14], [250, 224, 152]], mane: [[60, 48, 18], [255, 242, 205]], hue: 280, tone: 'vivid' },

  // ---- 無彩色・黒系 ----
  { id: 'platinum', label: 'プラチナ', coat: [[40, 44, 52], [242, 246, 252]], mane: [[46, 50, 58], [252, 253, 255]], hue: 215, tone: 'pale' },
  { id: 'pearl', label: 'パール', coat: [[60, 58, 64], [255, 252, 246]], mane: [[62, 56, 48], [255, 248, 230]], hue: 45, tone: 'pale' },
  { id: 'onyx', label: 'オニキス × 金鬣', coat: [[10, 10, 14], [96, 100, 116]], mane: [[58, 44, 14], [255, 222, 140]], hue: 240, tone: 'dark' },
  { id: 'bloodblack', label: '黒 × 緋鬣', coat: [[12, 10, 14], [88, 90, 104]], mane: [[64, 10, 18], [255, 96, 108]], hue: 350, tone: 'dark' },
  { id: 'gunmetal', label: 'ガンメタ × 燐光', coat: [[16, 20, 24], [148, 162, 176]], mane: [[50, 12, 40], [255, 140, 220]], hue: 205, tone: 'dark' },
];

const BY_ID = new Map(COLORWAYS.map((c) => [c.id, c]));

/* ---- 名前 Prefix → パレットファミリー (名前↔色の一致は維持) ---------------- */
const PREFIX_FAMILY: Record<string, string[]> = {
  Golden: ['aurum', 'amber'], Solar: ['aurum', 'amber'], Grand: ['aurum', 'champagne'],
  Sacred: ['champagne', 'pearl'], Lucky: ['aurum', 'lime'], Bright: ['champagne', 'lime'],
  Desert: ['amber', 'copper'], Dawn: ['amber', 'rose'], Rising: ['copper', 'amber'], Burning: ['copper', 'scarlet'],
  Crimson: ['crimson', 'bloodblack'], Scarlet: ['scarlet', 'crimson'], Brave: ['scarlet', 'copper'], Falling: ['rose', 'crimson'],
  Azure: ['royal', 'sapphire'], Blue: ['royal', 'sapphire'], Sky: ['cyanice', 'arctic'], Ocean: ['ocean', 'midnight'],
  Royal: ['royal', 'sapphire'], Noble: ['midnight', 'royal'],
  Frozen: ['arctic', 'platinum'], Crystal: ['cyanice', 'pearl'], Rapid: ['cyanice', 'ocean'], Wind: ['ocean', 'arctic'],
  Emerald: ['emerald', 'jade'], Wild: ['lime', 'emerald'],
  Mystic: ['violet', 'amethyst'], Cosmic: ['violet', 'midnight'], Phantom: ['amethyst', 'gunmetal'],
  Lunar: ['violet', 'pearl'], Thunder: ['violet', 'gunmetal'],
  Silver: ['platinum', 'pearl'], White: ['pearl', 'platinum'],
  Black: ['onyx', 'bloodblack'], Shadow: ['bloodblack', 'gunmetal'], Dark: ['gunmetal', 'onyx'],
  Night: ['midnight', 'onyx'], Silent: ['gunmetal', 'platinum'], Iron: ['gunmetal', 'platinum'], Storm: ['gunmetal', 'midnight'],
};

/* ---- 派生 ------------------------------------------------------------------ */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 色相をわずかに回す (デザインを壊さない ±deg)。 */
function hueJitter(rgb: Rgb, deg: number): Rgb {
  if (deg === 0) return rgb;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const rad = (deg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sqrt(1 / 3) * Math.sin(rad);
  const m = [
    cosA + (1 - cosA) / 3, (1 - cosA) / 3 - sinA, (1 - cosA) / 3 + sinA,
    (1 - cosA) / 3 + sinA, cosA + (1 - cosA) / 3, (1 - cosA) / 3 - sinA,
    (1 - cosA) / 3 - sinA, (1 - cosA) / 3 + sinA, cosA + (1 - cosA) / 3,
  ];
  const nr = r * m[0]! + g * m[1]! + b * m[2]!;
  const ng = r * m[3]! + g * m[4]! + b * m[5]!;
  const nb = r * m[6]! + g * m[7]! + b * m[8]!;
  return [nr, ng, nb].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) as Rgb;
}
function jitterRamp(ramp: [Rgb, Rgb], deg: number): [Rgb, Rgb] {
  return [hueJitter(ramp[0], deg), hueJitter(ramp[1], deg)];
}

/** 上品なパターンだけに絞る (dapple/shoulder はプロトでは外す)。 */
function pickPatternV2(rng: () => number, hasB: boolean): CoatPattern {
  const r = rng();
  if (!hasB) return { kind: 'solid' };
  if (r < 0.3) return { kind: 'solid' };
  if (r < 0.5) return { kind: 'upperLower', edge: 0.46 + rng() * 0.1, soft: 0.14 + rng() * 0.1 };
  if (r < 0.68) return { kind: 'gradient', angle: rng() * Math.PI };
  if (r < 0.84) return { kind: 'points', edge: 0.62 + rng() * 0.1 };
  return { kind: 'socks', edge: 0.64 + rng() * 0.1 };
}

const RAR_RANK: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };

/**
 * 案A版 deriveHorseArt: dnaHash + 実名 + レア度 → 設計済みカラーウェイの HorseVisual。
 * BASES / rarityMin のプールは現行エンジンと同じルール。
 */
export function deriveHorseArtV2(
  dnaHash: string,
  name: string,
  rarity: string,
  bases: { id: string; rarityMin: Rarity }[],
): HorseVisual & { colorway: string } {
  const rng = mulberry32(fnv(dnaHash));
  const prefix = name.trim().split(/\s+/)[0] ?? '';
  const family = PREFIX_FAMILY[prefix] ?? ['platinum', 'aurum'];
  const cw = BY_ID.get(family[Math.floor(rng() * family.length)]!) ?? COLORWAYS[0]!;

  const deg = (rng() * 2 - 1) * 4; // 色相±4°だけ。彩度/明度はデザイン値のまま
  const coat = jitterRamp(cw.coat, deg);
  const coatB = cw.coatB ? jitterRamp(cw.coatB, deg) : coat;
  const mane = jitterRamp(cw.mane, deg);
  const pattern = pickPatternV2(rng, !!cw.coatB);

  const hue = ((cw.hue + deg) % 360 + 360) % 360;
  const H = Math.round(hue);
  const ri = RAR_RANK[rarity] ?? 0;
  const eligible = bases.filter((b) => (RAR_RANK[b.rarityMin] ?? 0) <= ri);
  const pool = eligible.length ? eligible : bases;
  const baseId = pool[Math.floor(rng() * pool.length)]!.id;

  return {
    coat, coatB, pattern, mane, hue,
    accentHue: hue,
    tone: cw.tone,
    frameLine: `hsl(${H} 70% 60%)`,
    frameGlow: `hsl(${H} 76% 54% / 0.45)`,
    framePanel: `hsl(${H} 60% 48% / 0.13)`,
    frameGrad: `linear-gradient(92deg, hsl(${H} 68% 56%), hsl(${H} 72% 72%))`,
    baseId,
    colorway: cw.id,
  };
}
