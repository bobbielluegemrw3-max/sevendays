/**
 * NFTルック導出 — 3アーキタイプ方式 (2026-07-06 オーナー決定)。
 *
 * 馬の見た目 = アーキタイプ(3) × ボディ配色(12) × たてがみ(16)。
 * 全バリエーションはオーナーがシートA/Bで承認済み(全576ルック)。エンジンは
 * 色を「作らず」、承認済みリストから dnaHash で決定論的に「選ぶ」だけ。
 * 描画は NftHorseArt (Manusフルカラーレイヤー + 真HSVの色相変換)。
 * ポーズ量産(旧18素体)方式はこの方式に置き換えられた。
 */

export type Arch = 'v2' | 'v3' | 'v4';
export type ManeVariant =
  | { kind: 'rot'; deg: number } // 原画の2色構造を保った回転 (M01-M12)
  | { kind: 'mono'; hue: number } // 単色圧縮 (M13 金 / M15 緋 / M16 緑)
  | { kind: 'desat' }; // 銀白 (M14)

export interface NftLook {
  arch: Arch;
  bodyDeg: number; // coat の色相回転 (シートA承認 12角度)
  mane: ManeVariant;
  hue: number; // カード枠・ショーケース分散用の代表色相 (たてがみ主体)
  tone: 'dark' | 'vivid';
  frameLine: string;
  frameGlow: string;
  framePanel: string;
  frameGrad: string;
}

/** シートA承認: 全12角度 (B01=0° 原画 … B12=330°)。 */
export const BODY_DEGS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as const;

/** シートB承認: 回転12 + 単色4 (M13金/M14銀白/M15緋/M16緑)。 */
export const MANE_VARIANTS: ManeVariant[] = [
  ...BODY_DEGS.map((deg): ManeVariant => ({ kind: 'rot', deg })),
  { kind: 'mono', hue: 47 },
  { kind: 'desat' },
  { kind: 'mono', hue: 350 },
  { kind: 'mono', hue: 140 },
];

/** 原画たてがみの代表色相 (シアン≈190°)。回転時の枠色算出に使う。 */
const MANE_BASE_HUE = 205;

/** 名前 Prefix → 好みの色相ターゲット (名前↔色の一致)。horse-visual の
 *  PREFIX_HUE と同じ配置。たてがみをこの色相に最も近い承認バリアントへ寄せる。 */
const PREFIX_TARGET: Record<string, number> = {
  Crimson: 352, Scarlet: 6, Burning: 18, Brave: 2, Rising: 28, Dawn: 40, Desert: 34,
  Solar: 44, Golden: 47, Grand: 48, Sacred: 50, Bright: 54, Lucky: 64,
  Wild: 96, Emerald: 150, Wind: 168, Rapid: 182, Frozen: 188, Crystal: 192, Ocean: 198,
  Sky: 206, Azure: 214, Blue: 224, Noble: 228, Royal: 238, Lunar: 252, Thunder: 260,
  Cosmic: 280, Phantom: 288, Mystic: 300, Falling: 326, Storm: 222,
  Silver: -1, White: -1, // 銀白たてがみ (M14)
  Black: 260, Shadow: 280, Dark: 240, Night: 250, Silent: 210, Iron: 210,
};

/** 金系/寒色系/闇系の Prefix はアーキタイプにも緩く効かせる (bias のみ)。 */
const ARCH_BIAS: Record<string, Arch> = {
  Golden: 'v2', Solar: 'v2', Grand: 'v2', Sacred: 'v2', Lucky: 'v2', Desert: 'v2', Dawn: 'v2',
  Black: 'v4', Shadow: 'v4', Dark: 'v4', Night: 'v4', Iron: 'v4', Storm: 'v4', Silent: 'v4',
};

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
const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

/** バリアントの見かけ色相 (枠色・分散判定用)。desat は金枠に寄せる。 */
export function maneHueOf(m: ManeVariant): number {
  if (m.kind === 'rot') return (MANE_BASE_HUE + m.deg) % 360;
  if (m.kind === 'mono') return m.hue;
  return 45;
}

function frameOf(h: number): Pick<NftLook, 'frameLine' | 'frameGlow' | 'framePanel' | 'frameGrad'> {
  const H = Math.round(((h % 360) + 360) % 360);
  return {
    frameLine: `hsl(${H} 82% 62%)`,
    frameGlow: `hsl(${H} 88% 55% / 0.5)`,
    framePanel: `hsl(${H} 72% 50% / 0.14)`,
    frameGrad: `linear-gradient(92deg, hsl(${H} 80% 58%), hsl(${H} 85% 74%))`,
  };
}

/**
 * 実馬の見た目: dnaHash が乱数、実名 Prefix が色の好み(たてがみ)と
 * アーキタイプの bias を与える。同じ馬は永遠に同じルック。
 */
export function deriveNftLook(dnaHash: string, name: string): NftLook {
  const rng = mulberry32(fnv(dnaHash));
  const prefix = name.trim().split(/\s+/)[0] ?? '';

  const biased = ARCH_BIAS[prefix];
  const archRoll = rng();
  const arch: Arch = biased && archRoll < 0.6 ? biased : (['v2', 'v3', 'v4'] as const)[Math.floor(rng() * 3)]!;

  const bodyDeg = BODY_DEGS[Math.floor(rng() * BODY_DEGS.length)]!;

  const target = PREFIX_TARGET[prefix];
  let mane: ManeVariant;
  if (target === -1) {
    mane = { kind: 'desat' };
  } else if (target !== undefined) {
    // ターゲット色相に近い上位3バリアントから rng で選ぶ (単調にならないように)
    const ranked = [...MANE_VARIANTS].sort((a, b) => hueDist(maneHueOf(a), target) - hueDist(maneHueOf(b), target));
    mane = ranked[Math.floor(rng() * 3)]!;
  } else {
    mane = MANE_VARIANTS[Math.floor(rng() * MANE_VARIANTS.length)]!;
  }

  const hue = maneHueOf(mane);
  return { arch, bodyDeg, mane, hue, tone: arch === 'v4' ? 'dark' : 'vivid', ...frameOf(hue) };
}

/**
 * 「夜色」ルック(真夜中の馬・EASTER_EGG_PLAN.md)。承認済み576ルックの外にある
 * 隠し配色 — 深い藍のたてがみ×冷たいボディ角度×ダーク。誰が獲得するかの条件は
 * サーバーの秘密モジュール(hidden/looks.ts)にのみ存在。見た目そのものは公開。
 * dnaHash に依らず全ての夜の馬が同じ夜色になる(「特別な一頭」の統一エンブレム性)。
 */
export const NIGHT_LOOK: NftLook = {
  arch: 'v4',
  bodyDeg: 240,
  mane: { kind: 'mono', hue: 250 },
  hue: 250,
  tone: 'dark',
  ...frameOf(250),
};

/**
 * ショーケース: アーキタイプを揃えず(3種すべて登場・同種を隣接させない)、
 * たてがみ色相を互いに離す。プレローンチは Math.random、実DB結線後は実馬。
 */
export function pickNftShowcase(count: number, nextSeed: () => number): NftLook[] {
  const chosen: NftLook[] = [];
  const usedCombo = new Set<string>();
  for (let guard = 0; guard < 2000 && chosen.length < count; guard++) {
    const seed = nextSeed();
    const rng = mulberry32(seed >>> 0);
    const arch = (['v2', 'v3', 'v4'] as const)[Math.floor(rng() * 3)]!;
    const bodyDeg = BODY_DEGS[Math.floor(rng() * BODY_DEGS.length)]!;
    const mane = MANE_VARIANTS[Math.floor(rng() * MANE_VARIANTS.length)]!;
    const hue = maneHueOf(mane);
    const combo = `${arch}:${bodyDeg}:${JSON.stringify(mane)}`;
    if (usedCombo.has(combo)) continue;
    const prev = chosen[chosen.length - 1];
    if (prev && prev.arch === arch) continue; // 同アーキタイプの隣接を禁止
    if (chosen.some((c) => hueDist(c.hue, hue) < 34 && c.mane.kind === mane.kind)) continue;
    usedCombo.add(combo);
    chosen.push({ arch, bodyDeg, mane, hue, tone: arch === 'v4' ? 'dark' : 'vivid', ...frameOf(hue) });
  }
  while (chosen.length < count) {
    const arch = (['v2', 'v3', 'v4'] as const)[chosen.length % 3]!;
    chosen.push({ arch, bodyDeg: 0, mane: { kind: 'rot', deg: 0 }, hue: MANE_BASE_HUE, tone: arch === 'v4' ? 'dark' : 'vivid', ...frameOf(MANE_BASE_HUE) });
  }
  return chosen;
}
