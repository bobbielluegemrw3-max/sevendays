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
const FAM: Record<string, [Rgb, Rgb]> = {
  gold: [[58, 40, 10], [255, 226, 150]],
  cyan: [[4, 32, 44], [150, 246, 255]],
  magenta: [[40, 6, 32], [255, 150, 232]],
  crimson: [[42, 8, 8], [255, 150, 120]],
  emerald: [[5, 40, 24], [140, 255, 196]],
  silver: [[28, 32, 40], [240, 246, 255]],
  onyx: [[12, 12, 22], [150, 180, 225]],
  electric: [[30, 26, 4], [224, 255, 110]],
};
const PREFIX_FAM: Record<string, string> = {
  Golden: 'gold', Solar: 'gold', Grand: 'gold', Noble: 'gold', Royal: 'gold', Sacred: 'gold', Bright: 'gold', Dawn: 'gold', Lucky: 'gold',
  Azure: 'cyan', Blue: 'cyan', Sky: 'cyan', Ocean: 'cyan', Crystal: 'cyan', Frozen: 'cyan',
  Cosmic: 'magenta', Lunar: 'magenta', Mystic: 'magenta', Phantom: 'magenta',
  Crimson: 'crimson', Scarlet: 'crimson', Burning: 'crimson',
  Emerald: 'emerald', Wild: 'emerald', Silver: 'silver', White: 'silver',
  Black: 'onyx', Shadow: 'onyx', Dark: 'onyx', Night: 'onyx', Silent: 'onyx', Iron: 'onyx',
  Storm: 'electric', Thunder: 'electric', Rapid: 'electric', Rising: 'electric', Wind: 'electric', Desert: 'electric', Falling: 'electric', Brave: 'electric',
};
/** Mane neon (from the name suffix motif): [shadow, highlight]. */
const MANE: Record<string, [Rgb, Rgb]> = {
  cyan: [[4, 32, 44], [150, 246, 255]],
  magenta: [[40, 6, 32], [255, 150, 232]],
  gold: [[46, 32, 6], [255, 224, 150]],
  orange: [[44, 18, 4], [255, 180, 90]],
  lime: [[26, 34, 4], [200, 255, 120]],
  violet: [[24, 10, 44], [190, 150, 255]],
};
const SUFFIX_MANE: Record<string, string> = {
  Frost: 'cyan', Wave: 'cyan', River: 'cyan', Ocean: 'cyan', Comet: 'cyan', Star: 'cyan', Meteor: 'cyan', Flash: 'cyan', Falcon: 'cyan', Eagle: 'cyan',
  Flame: 'orange', Blade: 'orange', Strike: 'orange', Arrow: 'orange',
  Thunder: 'lime', Storm: 'lime', Tempest: 'lime',
  Dream: 'violet', Spirit: 'violet', Soul: 'violet', Mirage: 'violet', Heart: 'violet',
  Crown: 'gold', King: 'gold', Queen: 'gold', Glory: 'gold', Legend: 'gold', Star_: 'gold',
  Dragon: 'magenta', Wolf: 'magenta', Tiger: 'magenta', Lion: 'magenta',
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
 * Base manifest — mirrors public/horses/bases/bases.json. Update when new
 * batches land (rare poses gain a higher rarityMin so they stay exclusive).
 */
export interface BaseDef { id: string; pose: string; gender: string; rarityMin: Rarity; }
export const BASES: BaseDef[] = [
  { id: 'base_01', pose: 'gallop', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_04', pose: 'gallop_extended', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_05', pose: 'gallop_collected', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_06', pose: 'gallop_extended', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_07', pose: 'power_kickoff', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_08', pose: 'gallop_extended', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_09', pose: 'gallop_3q_rear', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_10', pose: 'gallop_collected', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_11', pose: 'high_trot', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_12', pose: 'power_kickoff', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_13', pose: 'gliding_gallop', gender: 'male', rarityMin: 'COMMON' },
  // batch02 (standard, COMMON)
  { id: 'base_14', pose: 'gallop_collected', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_15', pose: 'gallop_extended', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_16', pose: 'power_stride', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_17', pose: 'gallop_3q_front', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_18', pose: 'gallop_3q_rear', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_19', pose: 'high_trot', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_20', pose: 'leap_stride', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_21', pose: 'gliding_gallop', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_22', pose: 'gallop_extended', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_23', pose: 'gallop_collected', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_24', pose: 'power_stride', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_25', pose: 'gallop_3q_front', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_26', pose: 'gallop_3q_rear', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_27', pose: 'high_trot', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_28', pose: 'leap_stride', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_29', pose: 'gliding_gallop', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_30', pose: 'gallop_extended', gender: 'neutral', rarityMin: 'COMMON' },
  { id: 'base_31', pose: 'gallop_collected', gender: 'male', rarityMin: 'COMMON' },
  { id: 'base_32', pose: 'power_stride', gender: 'female', rarityMin: 'COMMON' },
  { id: 'base_33', pose: 'gallop_3q_front', gender: 'neutral', rarityMin: 'COMMON' },
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
const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
function jitter(c: Rgb, rng: () => number, amt = 26): Rgb {
  return [clamp255(c[0] + (rng() * 2 - 1) * amt), clamp255(c[1] + (rng() * 2 - 1) * amt), clamp255(c[2] + (rng() * 2 - 1) * amt)];
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
  family: string;
  coat: [Rgb, Rgb];
  mane: [Rgb, Rgb];
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
  const family = PREFIX_FAM[prefix] ?? 'cyan';
  const famPair = FAM[family]!;
  const coat: [Rgb, Rgb] = [famPair[0], jitter(famPair[1], rng)];
  const maneKey = SUFFIX_MANE[suffix] ?? (rng() < 0.5 ? 'cyan' : 'magenta');
  const mane = MANE[maneKey]!;
  const type = HORSE_TYPES[Math.floor(rng() * HORSE_TYPES.length)]!;

  const eligible = BASES.filter((b) => RARITY_RANK[b.rarityMin] <= ri);
  const pool = eligible.length ? eligible : BASES;
  const baseId = pool[Math.floor(rng() * pool.length)]!.id;
  const flip = rng() < 0.45;

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
    family, coat, mane, baseId, flip,
    price, last, likes, rank,
  };
}
