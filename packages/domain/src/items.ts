import type { HorseType, TrainingType, Weather } from './enums.js';
import { trainingModifierV1 } from './constants.js';

/**
 * Item System v1 (Decisions 078/079, ITEM_REVISION.md).
 *
 * Every effect is a PUBLIC deterministic rule of the horse's parameters —
 * there are no hidden coefficients. The daily "item setting" (1..6) is the
 * only variation and it is derived from the committed race seed (see
 * race-engine), revealed with the results.
 *
 * Effects resolve at snapshot time against the stats the player saw when
 * choosing (previous day's condition/fatigue) plus the seed-derived weather,
 * and are frozen into the participant snapshot. item_policy_v1.0.
 */

export const ITEM_POLICY_VERSION_V1 = 'item_policy_v1.0';

export type ItemBand = 'BASIC' | 'STANDARD' | 'PREMIUM' | 'BURN_DROP';

export interface ItemDefinition {
  key: string;
  nameJa: string;
  nameEn: string;
  band: ItemBand;
  /** Integer USDT as exact string; '0' for burn drops. */
  price: string;
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
  /** Seed-derived weather of the race (bet items resolve against it). */
  weather: Weather;
}

/** Raw effect BEFORE the daily setting coefficient. */
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
// Daily item setting (パチスロの設定1〜6のフェア版 — Decision 078)
// ---------------------------------------------------------------------------

/** P(setting 1..6) — centered on 3/4 as the owner specified. */
export const ITEM_SETTING_PROBABILITY_V1: readonly string[] = [
  '0.10', '0.15', '0.25', '0.25', '0.15', '0.10',
];
/** Effect multiplier for setting 1..6. */
export const ITEM_SETTING_COEFFICIENT_V1: readonly number[] = [0.5, 0.7, 0.9, 1.1, 1.3, 1.5];

/** Score-formula v1.1 ranges (see MODIFIER_RANGES_V1 for the v1.0 table). */
export const ITEM_MODIFIER_RANGE_V1 = { min: 0.0, max: 6.0 } as const;
/**
 * random_modifier range under v1.1: base -3/+3, LUCK-trained -2/+4
 * (Decision 052), plus an item shift of at most 1.0 x 1.5 (setting 6).
 */
export const ITEM_RANDOM_MODIFIER_RANGE_V1 = { min: -3.0, max: 5.5 } as const;

// ---------------------------------------------------------------------------
// Catalog v1.0 (30 sellable + 5 burn drops) — contents are owner-tunable data
// ---------------------------------------------------------------------------

function def(
  key: string,
  nameJa: string,
  nameEn: string,
  band: ItemBand,
  price: string,
  descriptionJa: string,
  extra?: Partial<ItemDefinition>,
): ItemDefinition {
  return {
    key,
    nameJa,
    nameEn,
    band,
    price,
    giftable: true,
    sellable: band !== 'BURN_DROP',
    descriptionJa,
    ...extra,
  };
}

export const ITEM_CATALOG_V1: readonly ItemDefinition[] = [
  // ---- BASIC (1-2 USDT) ----
  def('speed_feed', 'スピードフィード', 'Speed Feed', 'BASIC', '2', 'スピード調教の効果を高める(+1)。SPRINTERとの相性で1.5倍。'),
  def('power_feed', 'パワーフィード', 'Power Feed', 'BASIC', '2', 'パワー調教の効果を高める(+1)。POWERとの相性で1.5倍。'),
  def('recovery_feed', 'リカバリーフィード', 'Recovery Feed', 'BASIC', '2', 'リカバリー調教の効果を高める(+1)。ENDURANCEとの相性で1.5倍。'),
  def('sugar_cube', '角砂糖', 'Sugar Cube', 'BASIC', '1', 'どの調教でも効果を少し高める(+0.5)。'),
  def('mint_herb', 'ミントハーブ', 'Mint Herb', 'BASIC', '1', '疲労を3回復する。'),
  def('salt_lick', '岩塩ブロック', 'Salt Lick', 'BASIC', '2', '疲労を6回復する。'),
  def('cool_towel', 'クールタオル', 'Cool Towel', 'BASIC', '1', '調子を3上げる。'),
  def('chamomile', 'カモミールの束', 'Chamomile Bundle', 'BASIC', '2', '調子を6上げる。'),
  def('four_leaf_clover', '四つ葉のクローバー', 'Four-Leaf Clover', 'BASIC', '2', '運の振れ幅を+0.25シフト。LUCKとの相性で+0.4。'),
  def('iron_horseshoe', '鉄の蹄鉄', 'Iron Horseshoe', 'BASIC', '2', '疲労30以上の馬に+1(それ未満は+0.25)。疲れた馬の踏ん張り。'),
  def('morning_dew', '朝露の雫', 'Morning Dew', 'BASIC', '1', 'Day1〜2の若馬に+0.75。'),
  def('carrot_bundle', 'にんじん束', 'Carrot Bundle', 'BASIC', '1', '調教していない日でも+0.5。無調教日の保険。'),
  // ---- STANDARD (3-4 USDT) ----
  def('lucky_charm', 'ラッキーチャーム', 'Lucky Charm', 'STANDARD', '3', '運の振れ幅を+0.5シフト。LUCKとの相性で+0.75。'),
  def('double_feed', 'ダブルフィード', 'Double Feed', 'STANDARD', '4', 'どの調教でも効果を大きく高める(+1.5)。'),
  def('deep_rest_kit', '深休みキット', 'Deep Rest Kit', 'STANDARD', '3', '疲労を10回復する。'),
  def('spa_treatment', 'スパトリートメント', 'Spa Treatment', 'STANDARD', '4', '疲労を8回復し、調子を4上げる。'),
  def('focus_bridle', '集中の頭絡', 'Focus Bridle', 'STANDARD', '3', '調子70以上の好調馬に+1.5。'),
  def('comeback_tonic', 'カムバックトニック', 'Comeback Tonic', 'STANDARD', '3', '調子40未満のとき調子を12上げる。不調からの立て直し。'),
  def('storm_cloak', 'ストームクローク', 'Storm Cloak', 'STANDARD', '3', '+0.5。雨・嵐の日ならさらに+1(天候ベット)。'),
  def('sunny_visor', 'サニーバイザー', 'Sunny Visor', 'STANDARD', '3', '+0.5。晴れの日ならさらに+1(天候ベット)。'),
  def('endurance_wrap', '持久のラップ', 'Endurance Wrap', 'STANDARD', '4', 'ENDURANCE/POWERに+1.5、他タイプに+0.5。'),
  def('sprint_spurs', '疾走の拍車', 'Sprint Spurs', 'STANDARD', '4', 'SPRINTER/LUCKに+1.5、他タイプに+0.5。'),
  def('veteran_blanket', '古馬の毛布', "Veteran's Blanket", 'STANDARD', '4', 'Day4以上の古馬に+1.5。'),
  def('twin_horseshoes', '双子の蹄鉄', 'Twin Horseshoes', 'STANDARD', '4', '+1に加えて運の振れ幅も+0.25シフト。'),
  // ---- PREMIUM (5-7 USDT) ----
  def('champion_saddle', 'チャンピオンの鞍', "Champion's Saddle", 'PREMIUM', '7', 'Day5〜6の王手の夜だけ使える+2。', { usableDayMin: 5, usableDayMax: 6 }),
  def('royal_feast', 'ロイヤルフィースト', 'Royal Feast', 'PREMIUM', '6', 'どの調教でも効果を最大まで高める(+2)。'),
  def('miracle_water', 'ミラクルウォーター', 'Miracle Water', 'PREMIUM', '5', '疲労を15回復し、調子を8上げる。'),
  def('golden_charm', 'ゴールデンチャーム', 'Golden Charm', 'PREMIUM', '6', '運の振れ幅を+1.0シフト。LUCKならさらに+0.5。'),
  def('war_banner', '戦旗', 'War Banner', 'PREMIUM', '7', '+1。タイプ一致の調教をした日は合計+2.5。'),
  def('phoenix_feather', '不死鳥の羽根', 'Phoenix Feather', 'PREMIUM', '5', '調子50未満かつ疲労40以上のどん底で+2.5(それ以外+0.5)。'),
  // ---- BURN DROPS (non-sellable, price 0) ----
  def('memento_horseshoe', '形見の蹄鉄', 'Memento Horseshoe', 'BURN_DROP', '0', '失った馬の形見。無条件で+2。'),
  def('memorial_wreath', '追悼の花冠', 'Memorial Wreath', 'BURN_DROP', '0', '調子を15上げる。'),
  def('legacy_mane', '遺志のたてがみ', 'Legacy Mane', 'BURN_DROP', '0', '運の振れ幅を+1.0シフト。'),
  def('spirit_roar', '咆哮の魂', 'Spirit Roar', 'BURN_DROP', '0', 'タイプ一致の調教をした日に+3。ゲーム最強の一撃。'),
  def('stardust_sand', '星霜の砂', 'Stardust Sand', 'BURN_DROP', '0', '疲労を20回復する。'),
];

export const ITEM_BY_KEY_V1: ReadonlyMap<string, ItemDefinition> = new Map(
  ITEM_CATALOG_V1.map((i) => [i.key, i]),
);

/** The five burn-drop keys in draw order (each 20%, seed-deterministic). */
export const BURN_DROP_KEYS_V1: readonly string[] = ITEM_CATALOG_V1
  .filter((i) => i.band === 'BURN_DROP')
  .map((i) => i.key);

// ---------------------------------------------------------------------------
// Effects (item_policy_v1.0) — pure, versioned like trainingModifierV1
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
 * Raw effect of an item for a context (BEFORE the daily setting coefficient).
 * Unknown keys return zero effect — a decommissioned catalog entry must never
 * crash a replay.
 */
export function computeItemEffectV1(itemKey: string, ctx: ItemEffectContext): ItemEffectResult {
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
    case 'iron_horseshoe': return points(ctx.prevFatigue >= 30 ? 1 : 0.25);
    case 'morning_dew': return ctx.currentDay >= 1 && ctx.currentDay <= 2 ? points(0.75) : NONE;
    case 'carrot_bundle': return points(0.5);
    // STANDARD
    case 'lucky_charm': return { ...NONE, randomShift: ctx.horseType === 'LUCK' ? 0.75 : 0.5 };
    case 'double_feed': return ctx.training !== null ? points(1.5) : NONE;
    case 'deep_rest_kit': return { ...NONE, fatigueDelta: -10 };
    case 'spa_treatment': return { ...NONE, fatigueDelta: -8, conditionDelta: 4 };
    case 'focus_bridle': return ctx.prevCondition >= 70 ? points(1.5) : NONE;
    case 'comeback_tonic': return ctx.prevCondition < 40 ? { ...NONE, conditionDelta: 12 } : NONE;
    case 'storm_cloak':
      return points(ctx.weather === 'RAIN' || ctx.weather === 'STORM' ? 1.5 : 0.5);
    case 'sunny_visor': return points(ctx.weather === 'SUNNY' ? 1.5 : 0.5);
    case 'endurance_wrap':
      return points(ctx.horseType === 'ENDURANCE' || ctx.horseType === 'POWER' ? 1.5 : 0.5);
    case 'sprint_spurs':
      return points(ctx.horseType === 'SPRINTER' || ctx.horseType === 'LUCK' ? 1.5 : 0.5);
    case 'veteran_blanket': return ctx.currentDay >= 4 ? points(1.5) : NONE;
    case 'twin_horseshoes': return { ...NONE, itemPoints: 1, randomShift: 0.25 };
    // PREMIUM
    case 'champion_saddle': return points(2);
    case 'royal_feast': return ctx.training !== null ? points(2) : NONE;
    case 'miracle_water': return { ...NONE, fatigueDelta: -15, conditionDelta: 8 };
    case 'golden_charm':
      return { ...NONE, randomShift: 1.0, itemPoints: ctx.horseType === 'LUCK' ? 0.5 : 0 };
    case 'war_banner': return points(typeMatchedTraining(ctx.horseType, ctx.training) ? 2.5 : 1);
    case 'phoenix_feather':
      return points(ctx.prevCondition < 50 && ctx.prevFatigue >= 40 ? 2.5 : 0.5);
    // BURN DROPS
    case 'memento_horseshoe': return points(2);
    case 'memorial_wreath': return { ...NONE, conditionDelta: 15 };
    case 'legacy_mane': return { ...NONE, randomShift: 1.0 };
    case 'spirit_roar': return typeMatchedTraining(ctx.horseType, ctx.training) ? points(3) : NONE;
    case 'stardust_sand': return { ...NONE, fatigueDelta: -20 };
    default: return NONE;
  }
}

/** Round to 2dp (same convention as the race engine). */
function r2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Apply the daily setting coefficient (x0.5..x1.5) to a raw effect.
 * itemPoints is clamped into the v1.1 item_modifier range.
 */
export function applyItemSettingV1(effect: ItemEffectResult, setting: number): ItemEffectResult {
  const coeff = ITEM_SETTING_COEFFICIENT_V1[setting - 1];
  if (coeff === undefined) throw new Error(`ITEM_SETTING_OUT_OF_RANGE: ${setting}`);
  return {
    itemPoints: Math.min(ITEM_MODIFIER_RANGE_V1.max, r2(effect.itemPoints * coeff)),
    randomShift: r2(effect.randomShift * coeff),
    conditionDelta: r2(effect.conditionDelta * coeff),
    fatigueDelta: r2(effect.fatigueDelta * coeff),
  };
}
