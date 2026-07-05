/**
 * Deterministic horse visual derivation (HORSE_VISUAL_SYSTEM.md).
 *
 * Pure + client-safe: no server/ledger imports. Given a numeric seed (stands in
 * for the on-chain dnaHash pre-launch; post-launch pass the real horse's derived
 * seed), this returns everything needed to BOTH render the card text/frame
 * server-side AND paint the layered canvas client-side — one source of truth so
 * name↔colour and rarity always agree.
 */

export type Rgb = [number, number, number];

/** Mirrors NAME_PREFIXES_V1 / NAME_SUFFIXES_V1 (packages/race-engine). */
const PREFIX = [
  'Royal', 'Black', 'Golden', 'Silver', 'Crimson', 'Azure', 'Emerald', 'Scarlet',
  'White', 'Shadow', 'Storm', 'Silent', 'Wild', 'Iron', 'Bright', 'Dark',
  'Noble', 'Rapid', 'Mystic', 'Frozen', 'Burning', 'Grand', 'Lucky', 'Brave',
  'Crystal', 'Thunder', 'Desert', 'Ocean', 'Sky', 'Night', 'Dawn', 'Solar',
  'Lunar', 'Wind', 'Rising', 'Falling', 'Sacred', 'Phantom', 'Cosmic', 'Blue',
] as const;
const SUFFIX = [
  'Thunder', 'Wind', 'Storm', 'Blade', 'Arrow', 'Crown', 'Spirit', 'Runner',
  'Flash', 'Comet', 'Star', 'Knight', 'King', 'Queen', 'Dragon', 'Falcon',
  'Eagle', 'Wolf', 'Tiger', 'Lion', 'River', 'Flame', 'Frost', 'Shadow',
  'Light', 'Dream', 'Glory', 'Legend', 'Strike', 'Hoof', 'Dash', 'Rider',
  'Meteor', 'Tempest', 'Wave', 'Heart', 'Soul', 'Peak', 'Road', 'Mirage',
] as const;

/** Coat palette families: [shadow, highlight] for the luminance ramp. */
function hslToRgb(h: number, s: number, l: number): Rgb {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * Metallic luminance ramp for any hue: dark saturated shadow -> bright, slightly
 * desaturated highlight (the metal sheen). `hiL` lowers the top for dark/gunmetal
 * coats. Full-spectrum + continuous dna jitter = effectively unlimited colours.
 */
function metallicRamp(h: number, s: number, hiL = 0.55): [Rgb, Rgb] {
  return [hslToRgb(h, Math.min(1, s * 1.1), 0.16), hslToRgb(h, Math.min(1, s * 0.98), hiL)];
}

/** Name prefix -> [hue, saturation, highlightLightness]. Spread across the whole
 *  wheel with vivid primaries; name still biases the colour (Crimson=red …). */
const PREFIX_HUE: Record<string, [number, number, number?]> = {
  Crimson: [352, 0.92], Scarlet: [6, 0.9], Burning: [18, 0.92], Brave: [2, 0.86],
  Rising: [28, 0.9], Dawn: [40, 0.82], Desert: [34, 0.78],
  Solar: [44, 0.96], Golden: [47, 0.96], Grand: [48, 0.86], Sacred: [50, 0.7], Bright: [54, 0.95], Lucky: [64, 0.9],
  Wild: [96, 0.86], Emerald: [150, 0.88],
  Wind: [168, 0.78], Rapid: [182, 0.86], Frozen: [188, 0.82], Crystal: [192, 0.8], Ocean: [198, 0.92], Sky: [206, 0.88],
  Azure: [214, 0.96], Blue: [224, 0.96], Noble: [228, 0.82], Royal: [238, 0.86],
  Lunar: [252, 0.78], Thunder: [260, 0.82], Cosmic: [280, 0.92], Phantom: [288, 0.74], Mystic: [300, 0.88],
  Falling: [326, 0.86], Storm: [222, 0.5, 0.5],
  Silver: [212, 0.1, 0.86], White: [210, 0.05, 0.9],
  Black: [232, 0.28, 0.34], Shadow: [258, 0.3, 0.4], Dark: [222, 0.24, 0.38], Night: [242, 0.38, 0.42], Silent: [206, 0.34, 0.5], Iron: [210, 0.22, 0.52],
};

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
interface RarStyle { name: Rarity; line: string; glow: string; panel: string; ink: string; ribbon: string; }
const RAR: RarStyle[] = [
  { name: 'COMMON', line: '#8a92a0', glow: 'rgba(130,140,160,.45)', panel: 'rgba(130,140,160,.12)', ink: '#0a0813', ribbon: 'linear-gradient(92deg,#8a92a0,#c3ccd8)' },
  { name: 'UNCOMMON', line: '#35d07f', glow: 'rgba(53,208,127,.5)', panel: 'rgba(53,208,127,.14)', ink: '#04140c', ribbon: 'linear-gradient(92deg,#35d07f,#9dffc4)' },
  { name: 'RARE', line: '#00eaff', glow: 'rgba(0,234,255,.55)', panel: 'rgba(0,234,255,.16)', ink: '#04141a', ribbon: 'linear-gradient(92deg,#00eaff,#a9f6ff)' },
  { name: 'EPIC', line: '#ff2dc4', glow: 'rgba(255,45,196,.55)', panel: 'rgba(255,45,196,.16)', ink: '#150410', ribbon: 'linear-gradient(92deg,#ff2dc4,#ff8fe4)' },
  { name: 'LEGENDARY', line: '#d8b25a', glow: 'rgba(201,168,106,.6)', panel: 'rgba(201,168,106,.18)', ink: '#0a0813', ribbon: 'linear-gradient(92deg,#c9a86a,#f7eccb)' },
];

export const HORSE_TYPES = ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'] as const;
export type HorseType = (typeof HORSE_TYPES)[number];

/**
 * Spatial coat pattern — how the two coat colours (coat = primary, coatB =
 * secondary) are distributed over the body. This is what makes each horse a
 * distinct *marking* rather than a flat recolour. `regionT()` in HorseArt maps a
 * body-normalised (nx: tail→head, ny: back→belly) position to 0 (coat) .. 1
 * (coatB). All fields are derived deterministically from the seed.
 */
export type CoatPattern =
  | { kind: 'solid' }
  | { kind: 'upperLower'; edge: number; soft: number } // back vs belly
  | { kind: 'frontRear'; edge: number; soft: number } // forehand vs hindquarters
  | { kind: 'gradient'; angle: number } // smooth two-tone sweep
  | { kind: 'socks'; edge: number } // lower legs a different colour
  | { kind: 'points'; edge: number } // legs + muzzle (bay-style points)
  | { kind: 'shoulder'; cx: number; cy: number; r: number } // a localised patch ("right shoulder")
  | { kind: 'dapple'; scale: number; thresh: number }; // metallic dappling / blotches

/** Pick a spatial coat pattern from the seed. Solid is deliberately a minority
 *  so most horses carry a real marking; each branch consumes its own rng draws. */
function pickPattern(rng: () => number): CoatPattern {
  const r = rng();
  if (r < 0.12) return { kind: 'solid' };
  if (r < 0.28) return { kind: 'upperLower', edge: 0.44 + rng() * 0.12, soft: 0.1 + rng() * 0.12 };
  if (r < 0.42) return { kind: 'frontRear', edge: 0.42 + rng() * 0.16, soft: 0.1 + rng() * 0.14 };
  if (r < 0.58) return { kind: 'gradient', angle: rng() * Math.PI };
  if (r < 0.7) return { kind: 'socks', edge: 0.62 + rng() * 0.12 };
  if (r < 0.82) return { kind: 'points', edge: 0.6 + rng() * 0.12 };
  if (r < 0.92) return { kind: 'shoulder', cx: 0.62 + rng() * 0.16, cy: 0.28 + rng() * 0.2, r: 0.22 + rng() * 0.14 };
  return { kind: 'dapple', scale: 4 + Math.floor(rng() * 4), thresh: 0.46 + (rng() - 0.5) * 0.2 };
}

/**
 * Base manifest — mirrors public/horses/bases/bases.json. Update when new
 * batches land (rare poses gain a higher rarityMin so they stay exclusive).
 */
export interface BaseDef { id: string; pose: string; gender: string; rarityMin: Rarity; }
// New-style pool (batch01R+02R, V2/V3/V4 liquid chrome). Owner-approved:
// excluded 02,05,13,14,18,23 out of base_01..24. batch03R (25-36) pending.
export const BASES: BaseDef[] = [
  { id: 'base_01', pose: 'gallop_extended', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_03', pose: 'high_trot', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_04', pose: 'gallop_extended', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_06', pose: 'gallop_extended', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_07', pose: 'leap_stride', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_08', pose: 'gallop_standard', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_09', pose: 'power_kickoff', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_10', pose: 'gliding_gallop', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_11', pose: 'high_trot', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_12', pose: 'gallop_3q_front', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_15', pose: 'gallop_extended', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_16', pose: 'power_stride', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_17', pose: 'gallop_3q_front', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_19', pose: 'high_trot', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_20', pose: 'leap_stride', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_21', pose: 'gliding_gallop', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_22', pose: 'gallop_extended', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_24', pose: 'power_stride', gender: 'neutral', rarityMin: 'COMMON' },
];
const RARITY_RANK: Record<Rarity, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The purely visual identity of a horse — everything HorseArt + the card frame need. */
export interface HorseVisual {
  coat: [Rgb, Rgb];
  coatB: [Rgb, Rgb];
  pattern: CoatPattern;
  mane: [Rgb, Rgb];
  hue: number;
  accentHue: number;
  tone: 'dark' | 'pale' | 'vivid';
  frameLine: string;
  frameGlow: string;
  framePanel: string;
  frameGrad: string;
  baseId: string;
}

/**
 * Shared colour/pattern/base pipeline. `ph/ps/phiL` come from the name prefix
 * (name↔colour coherence), `ri` is the rarity rank (gates the base-pose pool),
 * and every other choice is drawn from `rng`.
 */
function deriveVisual(rng: () => number, ph: number, ps: number, phiL: number | undefined, ri: number): HorseVisual {
  const coatHue = ph + (rng() * 2 - 1) * 22;
  const coatSat = Math.max(0.05, Math.min(1, ps + (rng() * 2 - 1) * 0.1));
  // Pure single-colour horses (owner request): not every horse carries a two-tone
  // marking. ~24% are ONE bold colour head-to-toe — 真っ赤/真っ青/真緑/真っ黄 for
  // vivid prefixes (saturation pushed to full, punchier highlight so the primary
  // stays saturated), and true blacks/whites/silvers for monochrome prefixes.
  // Name↔colour coherence is untouched: only vividness changes, never the hue.
  const pure = rng() < 0.24;
  const monochrome = ps < 0.45; // Black/White/Silver/Shadow… families
  const coatHiL = pure && !monochrome ? 0.58 : (phiL ?? 0.82);
  const pureSat = pure && !monochrome ? Math.max(0.96, coatSat) : coatSat;
  const coat = metallicRamp(coatHue, pureSat, coatHiL);
  let coatB = coat;
  let pattern: CoatPattern = { kind: 'solid' };
  let bHue = coatHue;
  if (!pure) {
    // Secondary coat colour + spatial pattern — this is what turns a flat recolour
    // into a real per-horse marking (two-tone body, points, shoulder patch, …).
    const cb = rng();
    let bSat = coatSat;
    let bHiL = phiL ?? 0.82;
    if (cb < 0.16) {
      bSat = coatSat * 0.45; // metallic shade of the same hue (subtle, premium — kept rare)
      bHiL = Math.min(0.92, (phiL ?? 0.82) + 0.16);
    } else if (cb < 0.46) {
      bHue = coatHue + (46 + rng() * 44) * (rng() < 0.5 ? 1 : -1); // wide analogous — clearly different
      bSat = Math.min(1, coatSat * 1.02);
    } else if (cb < 0.76) {
      bHue = coatHue + 180; // complementary pop (bold two-tone)
      bSat = Math.min(1, Math.max(0.55, coatSat));
    } else if (cb < 0.92) {
      bHue = coatHue + (rng() < 0.5 ? 150 : 210); // split-complementary
      bSat = Math.min(1, Math.max(0.5, coatSat * 0.95));
    } else {
      bHue = coatHue + 120 * (rng() < 0.5 ? 1 : -1); // triad
      bSat = Math.min(1, Math.max(0.5, coatSat));
    }
    coatB = metallicRamp(bHue, bSat, bHiL);
    pattern = pickPattern(rng);
  }
  // mane: pure horses keep the mane in their own colour (slightly brighter for
  // silhouette); otherwise a harmonious accent — complementary neon / analogous / sheen
  let maneHue = coatHue;
  let mane: [Rgb, Rgb];
  if (pure) {
    mane = metallicRamp(coatHue, pureSat, Math.min(0.9, coatHiL + 0.14));
  } else {
    const mc = rng();
    maneHue = mc < 0.5 ? coatHue + 180 : mc < 0.8 ? coatHue + 42 : coatHue;
    const maneSat = mc < 0.8 ? 0.9 : 0.16;
    mane = metallicRamp(maneHue, maneSat, 0.86);
  }
  // Perceived tone family: two dark horses (navy vs gun-teal) read as "black twins"
  // whatever their hues — the showcase caps darks and pales at one each.
  const tone: 'dark' | 'pale' | 'vivid' = coatHiL < 0.5 ? 'dark' : pureSat < 0.22 ? 'pale' : 'vivid';
  // Frame colour matches the horse (full-spectrum), not the 5 rarity colours —
  // rarity still reads from the badge. hue drives both the frame and the
  // showcase colour-spread logic (see pickShowcase in Landing).
  const hue = ((coatHue % 360) + 360) % 360;
  const H = Math.round(hue);
  const frameLine = `hsl(${H} 82% 62%)`;
  const frameGlow = `hsl(${H} 88% 55% / 0.5)`;
  const framePanel = `hsl(${H} 72% 50% / 0.14)`;
  const frameGrad = `linear-gradient(92deg, hsl(${H} 80% 58%), hsl(${H} 85% 74%))`;

  const eligible = BASES.filter((b) => RARITY_RANK[b.rarityMin] <= ri);
  const pool = eligible.length ? eligible : BASES;
  const baseId = pool[Math.floor(rng() * pool.length)]!.id;

  return {
    coat, coatB, pattern, mane, hue,
    accentHue: (((pattern.kind === 'solid' ? maneHue : bHue) % 360) + 360) % 360,
    tone,
    frameLine, frameGlow, framePanel, frameGrad, baseId,
  };
}

/**
 * Visual identity for a REAL horse row (dashboard/stable/detail): `dna_hash`
 * seeds the rng, the horse's real name prefix drives the hue family (so
 * name↔colour coherence holds on live data too) and its real rarity gates the
 * base-pose pool. Same horse → same pixels, everywhere, forever.
 */
export function deriveHorseArt(dnaHash: string, name: string, rarity: string): HorseVisual {
  let h = 0x811c9dc5; // FNV-1a over the hash string — dna_hash formats stay opaque
  for (let i = 0; i < dnaHash.length; i++) {
    h ^= dnaHash.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const rng = mulberry32(h >>> 0);
  const prefix = name.trim().split(/\s+/)[0] ?? '';
  const [ph, ps, phiL] = PREFIX_HUE[prefix] ?? [200, 0.82];
  const ri = RARITY_RANK[rarity as Rarity] ?? 0;
  return deriveVisual(rng, ph, ps, phiL, ri);
}

export interface DerivedHorse {
  seed: number;
  id: string; // display id like "#0007"
  prefix: string;
  suffix: string;
  name: string;
  type: HorseType;
  rarity: Rarity;
  rarityLine: string;
  rarityGlow: string;
  rarityPanel: string;
  rarityInk: string;
  rarityRibbon: string;
  coat: [Rgb, Rgb];
  coatB: [Rgb, Rgb];
  pattern: CoatPattern;
  mane: [Rgb, Rgb];
  hue: number; // normalised coat hue 0..360 — used to spread the showcase & colour the frame
  accentHue: number; // dominant second colour on the card (coatB, or mane when solid)
  tone: 'dark' | 'pale' | 'vivid'; // perceived family beyond hue — blacks/whites read alike whatever their hue
  frameLine: string; // card border/id — a vivid tint of the horse's own colour
  frameGlow: string; // outer glow
  framePanel: string; // art backdrop wash
  frameGrad: string; // CTA button fill
  baseId: string;
  flip: boolean;
  price: string;
  last: string;
  likes: string;
  rank: string;
}

/** Deterministically derive a full horse (identity + palette + base) from a seed. */
export function deriveHorse(seed: number): DerivedHorse {
  const rng = mulberry32(seed);
  const rr = rng();
  const ri = rr < 0.5 ? 0 : rr < 0.75 ? 1 : rr < 0.9 ? 2 : rr < 0.98 ? 3 : 4;
  const rar = RAR[ri]!;
  const prefix = PREFIX[Math.floor(rng() * PREFIX.length)]!;
  const suffix = SUFFIX[Math.floor(rng() * SUFFIX.length)]!;
  const [ph, ps, phiL] = PREFIX_HUE[prefix] ?? [200, 0.82];
  const visual = deriveVisual(rng, ph, ps, phiL, ri);
  const type = HORSE_TYPES[Math.floor(rng() * HORSE_TYPES.length)]!;
  const flip = false; // all horses face right for a consistent, curated grid

  const priceBase = [110, 150, 190, 300, 500][ri]!;
  const price = String(priceBase + Math.floor(rng() * priceBase * 0.5));
  const last = String(Math.max(1, Number(price) - Math.floor(rng() * 40 + 8)));
  const likes = (rng() * 2.6).toFixed(1) + 'k';
  const rank = '#' + (Math.floor(rng() * 900) + 2);

  return {
    seed,
    id: '#' + ((seed % 9999) + 1).toString().padStart(4, '0'),
    prefix, suffix, name: `${prefix} ${suffix}`.toUpperCase(),
    type, rarity: rar.name,
    rarityLine: rar.line, rarityGlow: rar.glow, rarityPanel: rar.panel, rarityInk: rar.ink, rarityRibbon: rar.ribbon,
    ...visual, flip,
    price, last, likes, rank,
  };
}

/**
 * Pick `count` showcase horses whose coat colours are guaranteed to be from
 * DIFFERENT hue families (one per 360/count° slice of the wheel), then order
 * them so neighbouring cards sit far apart on the wheel — no two similar-colour
 * horses ever line up. `nextSeed` supplies fresh seeds (Math.random pre-launch;
 * real dnaHashes post-launch). Each horse is still fully derived from its own
 * seed, so name↔colour coherence is preserved.
 */
export function pickShowcase(count: number, nextSeed: () => number): DerivedHorse[] {
  const slice = 360 / count;
  const hueDist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const chosen: DerivedHorse[] = [];
  const usedBuckets = new Set<number>();
  for (let guard = 0; guard < 4000 && chosen.length < count; guard++) {
    const h = deriveHorse(nextSeed());
    const bucket = Math.floor(h.hue / slice) % count;
    if (usedBuckets.has(bucket)) continue;
    // Perceived-family checks on top of the hue bucket. Bucket boundaries let
    // near-identical hues through (352° vs 30° are different buckets), and two
    // horses with the SAME colour-pair (warm coat + teal accent, twice) or two
    // dark/pale horses read as twins regardless of nominal hue.
    if (chosen.some((c) => hueDist(h.hue, c.hue) < 36)) continue;
    if (chosen.some((c) => hueDist(h.hue, c.hue) < 70 && hueDist(h.accentHue, c.accentHue) < 50)) continue;
    if (h.tone !== 'vivid' && chosen.some((c) => c.tone === h.tone)) continue; // ≤1 dark, ≤1 pale
    usedBuckets.add(bucket);
    chosen.push(h);
  }
  while (chosen.length < count) chosen.push(deriveHorse(nextSeed())); // safety fill
  chosen.sort((a, b) => a.hue - b.hue);
  // Walk the sorted ring in a stride coprime with count (~1/3 of the wheel) so
  // adjacent output positions are maximally far apart and the walk hits each one.
  const n = chosen.length;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let stride = Math.max(1, Math.round(n / 3));
  while (n > 1 && gcd(stride, n) !== 1) stride = (stride % n) + 1;
  const ordered: DerivedHorse[] = [];
  for (let i = 0, k = 0; i < n; i++, k = (k + stride) % n) {
    ordered.push(chosen[k]!);
  }
  return ordered;
}
