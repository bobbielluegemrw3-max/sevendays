import type { HorseType, Surface, TrackCondition, TrainingType, Weather } from './enums.js';
import { trainingModifierV1 } from './constants.js';

/**
 * Item System v2 (Decisions 078/079/082).
 *
 * Every effect is a PUBLIC deterministic rule of the horse's parameters —
 * there are no hidden coefficients. v2 replaces the abstract daily "setting"
 * (1..6) with RACE CONDITIONS the racing world actually speaks:
 * weather x track condition (both already core engine values, seed-derived
 * and score-affecting) x the new surface (TURF/DIRT, items only).
 *
 * Each item carries an AFFINITY (芝巧者/道悪の鬼...). The condition
 * coefficient (x0.5..x1.5, same bounds as v1's setting) comes from the
 * item's affinity against tonight's conditions — revealed at 20:00 with the
 * race, verifiable from the seed afterwards. Expected value over the public
 * distributions is ~1.0 per affinity, so the economy is unchanged.
 *
 * Effects resolve at snapshot time against the stats the player saw when
 * choosing (previous day's condition/fatigue). item_policy_v2.0.
 */

export const ITEM_POLICY_VERSION_V2 = 'item_policy_v2.0';

export type ItemBand = 'BASIC' | 'STANDARD' | 'PREMIUM' | 'BURN_DROP';

/** 適性 — どの条件でアイテムが輝くか(公開・カタログ属性)。 */
export type ItemAffinity =
  | 'ALL'         // オールラウンド: 条件の影響を受けない
  | 'TURF'        // 芝巧者
  | 'DIRT'        // ダート巧者
  | 'SUN'         // 晴れ舞台
  | 'RAIN'        // 雨の鬼
  | 'FIRM'        // 高速馬場好き
  | 'MUD'         // 道悪の鬼
  | 'STORM_EPIC'; // 荒天の大駆け(嵐でだけ爆発)

export interface ItemDefinition {
  key: string;
  nameJa: string;
  nameEn: string;
  band: ItemBand;
  /** Integer USDT as exact string; '0' for burn drops. */
  price: string;
  affinity: ItemAffinity;
  /** Decision 079: all giftable for now; per-item switch kept on purpose. */
  giftable: boolean;
  sellable: boolean;
  /** Usable only while the horse's current_day is inside [min, max]. */
  usableDayMin?: number;
  usableDayMax?: number;
  descriptionJa: string;
}

export interface ItemEffectContext {
  horseType: HorseType;
  /** Horse's current_day when the item is applied. */
  currentDay: number;
  /** Training chosen for the same race (null = none). */
  training: TrainingType | null;
  /** Stats the player saw when choosing = previous day's values. */
  prevCondition: number;
  prevFatigue: number;
  /** Seed-derived weather of the race (kept for context/replay parity). */
  weather: Weather;
}

/** Raw effect BEFORE the condition coefficient. */
export interface ItemEffectResult {
  /** Score points into item_modifier (0..). */
  itemPoints: number;
  /** Additive shift of the random_modifier range. */
  randomShift: number;
  /** Condition stat delta (applied inside the daily 0..100 recurrence). */
  conditionDelta: number;
  /** Fatigue stat delta (negative = relief), same recurrence. */
  fatigueDelta: number;
}

// ---------------------------------------------------------------------------
// Race conditions (Decision 082) — the racing-world replacement of 設定1〜6
// ---------------------------------------------------------------------------

export interface RaceConditions {
  weather: Weather;
  track: TrackCondition;
  surface: Surface;
}

/** 日本語ラベル(UI/演出用の正典)。 */
export const WEATHER_JA: Readonly<Record<Weather, string>> = {
  SUNNY: '晴れ',
  CLOUDY: '曇り',
  RAIN: '雨',
  STORM: '嵐',
};
export const TRACK_JA: Readonly<Record<TrackCondition, string>> = {
  FAST: '高速',
  GOOD: '良',
  SOFT: '稍重',
  HEAVY: '不良',
};
export const SURFACE_JA: Readonly<Record<Surface, string>> = {
  TURF: '芝',
  DIRT: 'ダート',
};
export const AFFINITY_JA: Readonly<Record<ItemAffinity, string>> = {
  ALL: 'オールラウンド',
  TURF: '芝巧者',
  DIRT: 'ダート巧者',
  SUN: '晴れ舞台',
  RAIN: '雨の鬼',
  FIRM: '高速馬場好き',
  MUD: '道悪の鬼',
  STORM_EPIC: '荒天の大駆け',
};

/**
 * 祭りの夜の名前(演出用)。レアな条件の組合せに冠を付ける。
 * 通常開催は null。優先順は上から。
 */
export function raceNightNameV2(c: RaceConditions): string | null {
  if (c.weather === 'STORM' && c.track === 'HEAVY') return '嵐の荒天決戦';
  if (c.weather === 'STORM') return '嵐の夜';
  if (c.weather === 'RAIN' && c.track === 'HEAVY' && c.surface === 'DIRT') return '豪雨のダート決戦';
  if (c.weather === 'RAIN' && c.track === 'HEAVY') return '豪雨の不良馬場';
  if (c.track === 'HEAVY') return '道悪の夜';
  if (c.weather === 'SUNNY' && c.track === 'FAST' && c.surface === 'TURF') return '絶好の芝日和';
  if (c.weather === 'SUNNY' && c.track === 'FAST' && c.surface === 'DIRT') return '快晴のダート日和';
  return null;
}

/**
 * 適性 x 今夜の条件 → 係数(x0.5..x1.5)。
 * 公開分布(天候40/30/20/10・馬場25/40/25/10・コース60/40)に対する期待値は
 * どの適性も ~1.0(経済中立)。値は全て [0.5, 1.5] に収まる。
 */
export function itemConditionCoefficientV2(affinity: ItemAffinity, c: RaceConditions): number {
  switch (affinity) {
    case 'ALL':
      return 1.0;
    case 'TURF':
      return c.surface === 'TURF' ? 1.25 : 0.65;
    case 'DIRT':
      return c.surface === 'DIRT' ? 1.5 : 0.67;
    case 'SUN':
      return { SUNNY: 1.4, CLOUDY: 1.0, RAIN: 0.6, STORM: 0.5 }[c.weather];
    case 'RAIN':
      return { SUNNY: 0.6, CLOUDY: 1.0, RAIN: 1.5, STORM: 1.5 }[c.weather];
    case 'FIRM':
      return { FAST: 1.5, GOOD: 1.1, SOFT: 0.6, HEAVY: 0.5 }[c.track];
    case 'MUD':
      return { FAST: 0.6, GOOD: 0.85, SOFT: 1.4, HEAVY: 1.5 }[c.track];
    case 'STORM_EPIC':
      return { SUNNY: 0.85, CLOUDY: 0.95, RAIN: 1.15, STORM: 1.5 }[c.weather];
  }
}

/** Score-formula v1.1 ranges (unchanged by v2 — coefficient bounds identical). */
export const ITEM_MODIFIER_RANGE_V1 = { min: 0.0, max: 6.0 } as const;
/**
 * random_modifier range under v1.1: base -3/+3, LUCK-trained -2/+4
 * (Decision 052), plus an item shift of at most 1.0 x 1.5.
 */
export const ITEM_RANDOM_MODIFIER_RANGE_V1 = { min: -3.0, max: 5.5 } as const;

// ---------------------------------------------------------------------------
// Catalog v2.0 (30 sellable + 5 burn drops) — Decision 082 total refresh.
// 26 items carried over from v1 (proven utility), 9 replaced with
// condition-themed gear. Dropped v1 keys: iron_horseshoe, morning_dew,
// carrot_bundle, endurance_wrap, sprint_spurs, veteran_blanket,
// twin_horseshoes, war_banner, golden_charm (legacy effects kept below).
// ---------------------------------------------------------------------------

function def(
  key: string,
  nameJa: string,
  nameEn: string,
  band: ItemBand,
  price: string,
  affinity: ItemAffinity,
  descriptionJa: string,
  extra?: Partial<ItemDefinition>,
): ItemDefinition {
  return {
    key,
    nameJa,
    nameEn,
    band,
    price,
    affinity,
    giftable: true,
    sellable: band !== 'BURN_DROP',
    descriptionJa,
    ...extra,
  };
}

export const ITEM_CATALOG_V2: readonly ItemDefinition[] = [
  // ---- BASIC (1-2 USDT) ----
  def('speed_feed', 'スピードフィード', 'Speed Feed', 'BASIC', '2', 'ALL', 'スピード調教の効果を高める(+1)。SPRINTERとの相性で1.5倍。'),
  def('power_feed', 'パワーフィード', 'Power Feed', 'BASIC', '2', 'ALL', 'パワー調教の効果を高める(+1)。POWERとの相性で1.5倍。'),
  def('recovery_feed', 'リカバリーフィード', 'Recovery Feed', 'BASIC', '2', 'ALL', 'リカバリー調教の効果を高める(+1)。ENDURANCEとの相性で1.5倍。'),
  def('sugar_cube', '角砂糖', 'Sugar Cube', 'BASIC', '1', 'ALL', 'どの調教でも効果を少し高める(+0.5)。'),
  def('mint_herb', 'ミントハーブ', 'Mint Herb', 'BASIC', '1', 'ALL', '疲労を3回復する。'),
  def('salt_lick', '岩塩ブロック', 'Salt Lick', 'BASIC', '2', 'ALL', '疲労を6回復する。'),
  def('cool_towel', 'クールタオル', 'Cool Towel', 'BASIC', '1', 'ALL', '調子を3上げる。'),
  def('chamomile', 'カモミールの束', 'Chamomile Bundle', 'BASIC', '2', 'ALL', '調子を6上げる。'),
  def('four_leaf_clover', '四つ葉のクローバー', 'Four-Leaf Clover', 'BASIC', '2', 'ALL', '運の振れ幅を+0.25シフト。LUCKとの相性で+0.4。'),
  def('turf_spikes', '芝用スパイク', 'Turf Spikes', 'BASIC', '2', 'TURF', '+0.75。今夜が芝コースなら1.25倍に伸びる(ダートでは鈍る)。'),
  def('dirt_shoes', 'ダート蹄鉄', 'Dirt Shoes', 'BASIC', '2', 'DIRT', '+0.75。今夜がダートなら1.5倍に爆発(芝では鈍る)。'),
  def('rain_hood', '雨天フード', 'Rain Hood', 'BASIC', '2', 'RAIN', '+0.75。雨・嵐の夜に1.5倍(晴れでは鈍る)。'),
  // ---- STANDARD (3-4 USDT) ----
  def('lucky_charm', 'ラッキーチャーム', 'Lucky Charm', 'STANDARD', '3', 'ALL', '運の振れ幅を+0.5シフト。LUCKとの相性で+0.75。'),
  def('double_feed', 'ダブルフィード', 'Double Feed', 'STANDARD', '4', 'ALL', 'どの調教でも効果を大きく高める(+1.5)。'),
  def('deep_rest_kit', '深休みキット', 'Deep Rest Kit', 'STANDARD', '3', 'ALL', '疲労を10回復する。'),
  def('spa_treatment', 'スパトリートメント', 'Spa Treatment', 'STANDARD', '4', 'ALL', '疲労を8回復し、調子を4上げる。'),
  def('focus_bridle', '集中の頭絡', 'Focus Bridle', 'STANDARD', '3', 'ALL', '調子70以上の好調馬に+1.5。'),
  def('comeback_tonic', 'カムバックトニック', 'Comeback Tonic', 'STANDARD', '3', 'ALL', '調子40未満のとき調子を12上げる。不調からの立て直し。'),
  def('sunny_visor', 'サニーバイザー', 'Sunny Visor', 'STANDARD', '3', 'SUN', '+1。晴れの夜に1.4倍(雨・嵐では鈍る)。'),
  def('storm_cloak', 'ストームクローク', 'Storm Cloak', 'STANDARD', '3', 'RAIN', '+1。雨・嵐の夜に1.5倍(晴れでは鈍る)。'),
  def('firm_plates', '高速馬場プレート', 'Fast-Track Plates', 'STANDARD', '4', 'FIRM', '+1。高速馬場で1.5倍(道悪では鈍る)。'),
  def('mud_guards', '泥除けガード', 'Mud Guards', 'STANDARD', '4', 'MUD', '+1。稍重・不良の道悪で1.4〜1.5倍(高速馬場では鈍る)。'),
  def('turf_master_saddle', '芝の名手の鞍', 'Turf Master Saddle', 'STANDARD', '4', 'TURF', '+1.25。芝で1.25倍(ダートでは鈍る)。'),
  def('dirt_master_saddle', 'ダートの名手の鞍', 'Dirt Master Saddle', 'STANDARD', '4', 'DIRT', '+1.25。ダートで1.5倍(芝では鈍る)。'),
  // ---- PREMIUM (5-7 USDT) ----
  def('champion_saddle', 'チャンピオンの鞍', "Champion's Saddle", 'PREMIUM', '7', 'ALL', 'Day5〜6の王手の夜だけ使える+2。', { usableDayMin: 5, usableDayMax: 6 }),
  def('royal_feast', 'ロイヤルフィースト', 'Royal Feast', 'PREMIUM', '6', 'ALL', 'どの調教でも効果を最大まで高める(+2)。'),
  def('miracle_water', 'ミラクルウォーター', 'Miracle Water', 'PREMIUM', '5', 'ALL', '疲労を15回復し、調子を8上げる。'),
  def('phoenix_feather', '不死鳥の羽根', 'Phoenix Feather', 'PREMIUM', '5', 'ALL', '調子50未満かつ疲労40以上のどん底で+2.5(それ以外+0.5)。'),
  def('storm_emperor_cloak', '嵐帝のマント', "Storm Emperor's Cloak", 'PREMIUM', '7', 'STORM_EPIC', '+1.5。嵐の夜に1.5倍で吼える大駆け装備(晴れでは平凡)。'),
  def('mudlord_crown', '泥王の冠', "Mudlord's Crown", 'PREMIUM', '6', 'MUD', '+1.5。道悪で1.4〜1.5倍。泥のレースの支配者。'),
  // ---- BURN DROPS (non-sellable, price 0) ----
  def('memento_horseshoe', '形見の蹄鉄', 'Memento Horseshoe', 'BURN_DROP', '0', 'ALL', '失った馬の形見。無条件で+2。'),
  def('memorial_wreath', '追悼の花冠', 'Memorial Wreath', 'BURN_DROP', '0', 'ALL', '調子を15上げる。'),
  def('legacy_mane', '遺志のたてがみ', 'Legacy Mane', 'BURN_DROP', '0', 'ALL', '運の振れ幅を+1.0シフト。'),
  def('spirit_roar', '咆哮の魂', 'Spirit Roar', 'BURN_DROP', '0', 'ALL', 'タイプ一致の調教をした日に+3。ゲーム最強の一撃。'),
  def('stardust_sand', '星霜の砂', 'Stardust Sand', 'BURN_DROP', '0', 'ALL', '疲労を20回復する。'),
];

export const ITEM_BY_KEY_V2: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_CATALOG_V2.map((i) => [i.key, i]),
);

/** The five burn-drop keys in draw order (each 20%, seed-deterministic). */
export const BURN_DROP_KEYS_V2: readonly string[] = ITEM_CATALOG_V2
  .filter((i) => i.band === 'BURN_DROP')
  .map((i) => i.key);

// ---------------------------------------------------------------------------
// Effects (item_policy_v2.0) — pure, versioned like trainingModifierV1
// ---------------------------------------------------------------------------

const NONE: ItemEffectResult = { itemPoints: 0, randomShift: 0, conditionDelta: 0, fatigueDelta: 0 };

function points(n: number): ItemEffectResult {
  return { ...NONE, itemPoints: n };
}

/** "タイプ一致の調教" = the +5 pairing (SPRINTER×SPEED etc.; BALANCED has none). */
function typeMatchedTraining(type: HorseType, training: TrainingType | null): boolean {
  return training !== null && trainingModifierV1(type, training) === 5;
}

/** Feed helper: boosts only when the matching training was chosen. */
function feed(ctx: ItemEffectContext, wanted: TrainingType, favored: HorseType): ItemEffectResult {
  if (ctx.training !== wanted) return NONE;
  return points(ctx.horseType === favored ? 1.5 : 1);
}

/**
 * Raw effect of an item for a context (BEFORE the condition coefficient).
 * Unknown keys return zero effect — a decommissioned catalog entry must never
 * crash a replay. Weather no longer branches inside effects — condition
 * response lives entirely in the affinity coefficient (no double dipping).
 */
export function computeItemEffectV2(itemKey: string, ctx: ItemEffectContext): ItemEffectResult {
  switch (itemKey) {
    // BASIC
    case 'speed_feed': return feed(ctx, 'SPEED_TRAINING', 'SPRINTER');
    case 'power_feed': return feed(ctx, 'POWER_TRAINING', 'POWER');
    case 'recovery_feed': return feed(ctx, 'RECOVERY_TRAINING', 'ENDURANCE');
    case 'sugar_cube': return ctx.training !== null ? points(0.5) : NONE;
    case 'mint_herb': return { ...NONE, fatigueDelta: -3 };
    case 'salt_lick': return { ...NONE, fatigueDelta: -6 };
    case 'cool_towel': return { ...NONE, conditionDelta: 3 };
    case 'chamomile': return { ...NONE, conditionDelta: 6 };
    case 'four_leaf_clover': return { ...NONE, randomShift: ctx.horseType === 'LUCK' ? 0.4 : 0.25 };
    case 'turf_spikes': return points(0.75);
    case 'dirt_shoes': return points(0.75);
    case 'rain_hood': return points(0.75);
    // STANDARD
    case 'lucky_charm': return { ...NONE, randomShift: ctx.horseType === 'LUCK' ? 0.75 : 0.5 };
    case 'double_feed': return ctx.training !== null ? points(1.5) : NONE;
    case 'deep_rest_kit': return { ...NONE, fatigueDelta: -10 };
    case 'spa_treatment': return { ...NONE, fatigueDelta: -8, conditionDelta: 4 };
    case 'focus_bridle': return ctx.prevCondition >= 70 ? points(1.5) : NONE;
    case 'comeback_tonic': return ctx.prevCondition < 40 ? { ...NONE, conditionDelta: 12 } : NONE;
    case 'sunny_visor': return points(1);
    case 'storm_cloak': return points(1);
    case 'firm_plates': return points(1);
    case 'mud_guards': return points(1);
    case 'turf_master_saddle': return points(1.25);
    case 'dirt_master_saddle': return points(1.25);
    // PREMIUM
    case 'champion_saddle': return points(2);
    case 'royal_feast': return ctx.training !== null ? points(2) : NONE;
    case 'miracle_water': return { ...NONE, fatigueDelta: -15, conditionDelta: 8 };
    case 'phoenix_feather':
      return points(ctx.prevCondition < 50 && ctx.prevFatigue >= 40 ? 2.5 : 0.5);
    case 'storm_emperor_cloak': return points(1.5);
    case 'mudlord_crown': return points(1.5);
    // BURN DROPS
    case 'memento_horseshoe': return points(2);
    case 'memorial_wreath': return { ...NONE, conditionDelta: 15 };
    case 'legacy_mane': return { ...NONE, randomShift: 1.0 };
    case 'spirit_roar': return typeMatchedTraining(ctx.horseType, ctx.training) ? points(3) : NONE;
    case 'stardust_sand': return { ...NONE, fatigueDelta: -20 };
    // ---- legacy v1 keys (decommissioned from the shop; held units replay) ----
    case 'iron_horseshoe': return points(ctx.prevFatigue >= 30 ? 1 : 0.25);
    case 'morning_dew': return ctx.currentDay >= 1 && ctx.currentDay <= 2 ? points(0.75) : NONE;
    case 'carrot_bundle': return points(0.5);
    case 'endurance_wrap':
      return points(ctx.horseType === 'ENDURANCE' || ctx.horseType === 'POWER' ? 1.5 : 0.5);
    case 'sprint_spurs':
      return points(ctx.horseType === 'SPRINTER' || ctx.horseType === 'LUCK' ? 1.5 : 0.5);
    case 'veteran_blanket': return ctx.currentDay >= 4 ? points(1.5) : NONE;
    case 'twin_horseshoes': return { ...NONE, itemPoints: 1, randomShift: 0.25 };
    case 'war_banner': return points(typeMatchedTraining(ctx.horseType, ctx.training) ? 2.5 : 1);
    case 'golden_charm':
      return { ...NONE, randomShift: 1.0, itemPoints: ctx.horseType === 'LUCK' ? 0.5 : 0 };
    default: return NONE;
  }
}

/** Round to 2dp (same convention as the race engine). */
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Apply tonight's condition coefficient (x0.5..x1.5) to a raw effect.
 * Items not in the v2 catalog (legacy keys) run at x1.0.
 * itemPoints is clamped into the v1.1 item_modifier range.
 */
export function applyItemConditionsV2(
  itemKey: string,
  effect: ItemEffectResult,
  conditions: RaceConditions,
): ItemEffectResult {
  const affinity = ITEM_BY_KEY_V2.get(itemKey)?.affinity ?? 'ALL';
  const coeff = itemConditionCoefficientV2(affinity, conditions);
  return {
    itemPoints: Math.min(ITEM_MODIFIER_RANGE_V1.max, r2(effect.itemPoints * coeff)),
    randomShift: r2(effect.randomShift * coeff),
    conditionDelta: r2(effect.conditionDelta * coeff),
    fatigueDelta: r2(effect.fatigueDelta * coeff),
  };
}
