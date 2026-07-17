import type { TrackCondition, Weather } from './enums.js';
import type { TrainingMenuV2 } from './v2.js';

/**
 * ============================================================================
 * アイテムカタログ V2(Decision 109)— コード上は item_policy_v3.0 / _V3
 * ============================================================================
 * 命名の対応: ドキュメント(ITEM_CATALOG_V2.md)の「カタログV2」は、コードでは
 * 第3世代 = `_V3`。既存の `_V2`(items.ts / item_policy_v2.0)は Decision 082 の
 * 条件改訂版レガシーカタログで、V1シーズン稼働中のため不変。
 *
 * 設計法則(Decision 101/104/109):
 *  - V2スコア式は閉じている: score = total_value + condition_prep(±4) + luck。
 *    アイテムの作用面は total_value(TRAINING系)と condition_prep(RACE系)のみ
 *  - RACE系は「置換方式」: 的中 = 軸の適性を上限側へ max(axis, hit) /
 *    外れ = 下限側へ min(axis, miss)。hit/miss は各軸±2の範囲内なので、
 *    合成(±4の器)は構造的に溢れない。シムの「+4〜+8/−7〜−3」は器のスイング
 *  - 全効果は公開・決定論・リプレイ検証可能。運営裁量の変更は構造的に不可能
 */

export const ITEM_POLICY_VERSION_V3 = 'item_policy_v3.0';

export type ItemClassV3 = 'TRAINING' | 'RACE';
export type ItemBandV3 = 'BASIC' | 'STANDARD' | 'PREMIUM' | 'BURN_DROP';

/** 条件グループ(公開値 — 予報の読み方ガイドに明記)。 */
export type ConditionGroupV3 = 'RAIN_GROUP' | 'SUN_GROUP' | 'MUD_GROUP' | 'FIRM_GROUP';
export type WeatherGroupV3 = 'RAIN_GROUP' | 'SUN_GROUP';
export type TrackGroupV3 = 'MUD_GROUP' | 'FIRM_GROUP';

export const CONDITION_GROUP_MEMBERS_V3: Readonly<Record<ConditionGroupV3, readonly string[]>> = {
  RAIN_GROUP: ['RAIN', 'STORM'],
  SUN_GROUP: ['SUNNY', 'CLOUDY'],
  MUD_GROUP: ['SOFT', 'HEAVY'],
  FIRM_GROUP: ['FAST', 'GOOD'],
};

export const CONDITION_GROUP_JA_V3: Readonly<Record<ConditionGroupV3, string>> = {
  RAIN_GROUP: '雨系(雨・嵐)',
  SUN_GROUP: '晴れ系(晴れ・曇り)',
  MUD_GROUP: '道悪系(稍重・不良)',
  FIRM_GROUP: '良系(高速・良)',
};

/** TRAINING系の効果(確定ロールに合流 — ソフトキャップ85の法則に服する)。 */
export type TrainingEffectV3 =
  | {
      kind: 'BONUS';
      /** 一様ロールの公開レンジ(min=maxで固定値)。 */
      min: number;
      max: number;
      /** このメニューを含む確定でのみ有効(添付時にAPIが検証)。 */
      requiresMenu?: TrainingMenuV2;
      /** 大好物メニューを含む確定でのみ有効(D4)。 */
      requiresFavorite?: boolean;
      /** LV(current_day)制限。 */
      lvMin?: number;
      lvMax?: number;
    }
  | { kind: 'FLOOR_ZERO' } // 保険: ロール合計が0未満なら0に引き上げ
  | { kind: 'SYNERGY_DOUBLE' } // 大好物シナジー発動時にボーナス2倍
  | { kind: 'DECAY_SHIELD'; races: number }; // 減衰をNレース分無効(即時適用・D5)

/** RACE系の効果(±4の器への置換法則)。 */
export type RaceEffectV3 =
  | { kind: 'GROUP_PREP'; group: ConditionGroupV3; hit: number; miss: number }
  | {
      kind: 'PINPOINT_PREP';
      axis: 'WEATHER' | 'TRACK';
      condition: Weather | TrackCondition;
      hit: number;
      miss: number;
    }
  /** 両軸。備え先グループは使用時にプレイヤーが選ぶ(params必須)。 */
  | { kind: 'DUAL_PREP'; hit: number; miss: number }
  /** 両軸 floor 0 — 的中/外れの概念なし(読まない人の保険)。 */
  | { kind: 'DUAL_FLOOR' };

export interface ItemDefinitionV3 {
  key: string;
  nameJa: string;
  nameEn: string;
  itemClass: ItemClassV3;
  band: ItemBandV3;
  /** Integer USDT as exact string; '0' for burn drops. */
  price: string;
  sellable: boolean;
  /** Decision 109: 非売5種は譲渡不可。販売品は従来どおり可。 */
  giftable: boolean;
  effect: TrainingEffectV3 | RaceEffectV3;
  descriptionJa: string;
}

function t(
  key: string,
  nameJa: string,
  nameEn: string,
  band: ItemBandV3,
  price: string,
  effect: TrainingEffectV3,
  descriptionJa: string,
): ItemDefinitionV3 {
  return {
    key, nameJa, nameEn, band, price, effect, descriptionJa,
    itemClass: 'TRAINING',
    sellable: band !== 'BURN_DROP',
    giftable: band !== 'BURN_DROP',
  };
}

function r(
  key: string,
  nameJa: string,
  nameEn: string,
  band: ItemBandV3,
  price: string,
  effect: RaceEffectV3,
  descriptionJa: string,
): ItemDefinitionV3 {
  return {
    key, nameJa, nameEn, band, price, effect, descriptionJa,
    itemClass: 'RACE',
    sellable: band !== 'BURN_DROP',
    giftable: band !== 'BURN_DROP',
  };
}

/**
 * カタログ本体(販売30+非売5=35点・ITEM_CATALOG_V2.md §2/§3 が正)。
 * レンジの最終数値はRTPシム突合(IT2-4)で±調整あり — 変更時はDecision追記。
 */
export const ITEM_CATALOG_V3: readonly ItemDefinitionV3[] = [
  // ---- TRAINING系(15種) ----
  t('carrot_cube', 'にんじんキューブ', 'Carrot Cubes', 'BASIC', '2',
    { kind: 'BONUS', min: 1.0, max: 1.0 },
    '調教の確定ロールに+1.0(固定)。下振れなしの入口アイテム。'),
  t('highland_hay', '高原の干し草', 'Highland Hay', 'BASIC', '3',
    { kind: 'BONUS', min: 1.0, max: 2.0 },
    '調教の確定ロールに+1.0〜+2.0。'),
  t('protein_mash', 'プロテインマッシュ', 'Protein Mash', 'STANDARD', '5',
    { kind: 'BONUS', min: 2.0, max: 3.5 },
    '調教の確定ロールに+2.0〜+3.5。'),
  t('royal_banquet', 'ロイヤルフィースト', 'Royal Banquet', 'PREMIUM', '8',
    { kind: 'BONUS', min: 3.0, max: 5.0 },
    '調教の確定ロールに+3.0〜+5.0。「化けさせる」主力。'),
  t('masters_eye', '名伯楽の眼', "Master's Eye", 'PREMIUM', '6',
    { kind: 'FLOOR_ZERO' },
    '保険: 確定ロールの合計が0を下回ったら0に引き上げる(下振れ無効)。'),
  t('farrier_kit', '装蹄キット', 'Farrier Kit', 'STANDARD', '4',
    { kind: 'BONUS', min: 1.0, max: 2.0, requiresMenu: 'REST' },
    'RESTを含む確定専用: 減衰無効に加えてさらに+1.0〜+2.0。手入れ特化。'),
  t('foal_milk', '若駒のミルク', 'Foal Milk', 'BASIC', '3',
    { kind: 'BONUS', min: 2.0, max: 3.0, lvMax: 1 },
    'LV0〜1限定: 確定ロールに+2.0〜+3.0。若馬の伸び。'),
  t('awakening_elixir', '覚醒のエリキシル', 'Awakening Elixir', 'PREMIUM', '10',
    { kind: 'BONUS', min: 2.0, max: 6.0 },
    '確定ロールに+2.0〜+6.0。下振れはないが振れ幅の大きい夢枠。'),
  t('hill_manual', '坂路の心得', 'Hill Manual', 'BASIC', '3',
    { kind: 'BONUS', min: 1.5, max: 2.5, requiresMenu: 'HILL' },
    'HILLを含む確定専用: +1.5〜+2.5。'),
  t('pool_float', 'プールの浮き具', 'Pool Float', 'BASIC', '3',
    { kind: 'BONUS', min: 1.5, max: 2.5, requiresMenu: 'POOL' },
    'POOLを含む確定専用: +1.5〜+2.5。'),
  t('spar_guard', '併せ馬の防具', 'Sparring Guard', 'STANDARD', '4',
    { kind: 'BONUS', min: 1.5, max: 2.5, requiresMenu: 'SPAR' },
    'SPARを含む確定専用: +1.5〜+2.5(SPAR自体の下振れは消えない)。'),
  t('gate_bell', 'ゲートの鈴', 'Gate Bell', 'BASIC', '3',
    { kind: 'BONUS', min: 1.5, max: 2.5, requiresMenu: 'GATE' },
    'GATEを含む確定専用: +1.5〜+2.5。'),
  t('wood_premium', '極上ウッドチップ', 'Premium Wood Chips', 'BASIC', '3',
    { kind: 'BONUS', min: 1.5, max: 2.5, requiresMenu: 'WOOD' },
    'WOODを含む確定専用: +1.5〜+2.5。'),
  t('elder_blanket', '古馬の毛布', 'Elder Blanket', 'STANDARD', '5',
    { kind: 'BONUS', min: 2.0, max: 3.5, lvMin: 4 },
    'LV4以上限定: 確定ロールに+2.0〜+3.5。高価値馬の防衛。'),
  t('synergy_incense', '好物の香', 'Synergy Incense', 'PREMIUM', '6',
    { kind: 'SYNERGY_DOUBLE' },
    '大好物シナジーが発動した確定でボーナス2倍。発動しなければ効果なし。'),

  // ---- RACE系(15種) ----
  r('rain_cape', '雨のケープ', 'Rain Cape', 'BASIC', '2',
    { kind: 'GROUP_PREP', group: 'RAIN_GROUP', hit: 1.5, miss: -1.0 },
    '雨系(雨・嵐)への備え・弱。的中: 天候適性がmax(+1.5)/外れ: min(−1.0)。'),
  r('storm_armor', '嵐の完全装具', 'Storm Armor', 'STANDARD', '5',
    { kind: 'GROUP_PREP', group: 'RAIN_GROUP', hit: 2.0, miss: -2.0 },
    '雨系への備え・強。的中: 天候適性がmax(+2.0)/外れ: min(−2.0)。'),
  r('sun_visor', '陽よけのバイザー', 'Sun Visor', 'BASIC', '2',
    { kind: 'GROUP_PREP', group: 'SUN_GROUP', hit: 1.5, miss: -1.0 },
    '晴れ系(晴れ・曇り)への備え・弱。'),
  r('solar_silks', '快晴の勝負服', 'Solar Silks', 'STANDARD', '5',
    { kind: 'GROUP_PREP', group: 'SUN_GROUP', hit: 2.0, miss: -2.0 },
    '晴れ系への備え・強。'),
  r('mud_shoes', '道悪蹄鉄', 'Mud Shoes', 'BASIC', '2',
    { kind: 'GROUP_PREP', group: 'MUD_GROUP', hit: 1.5, miss: -1.0 },
    '道悪系(稍重・不良)への備え・弱。'),
  r('mud_plates', '重馬場プレート', 'Mud Plates', 'STANDARD', '5',
    { kind: 'GROUP_PREP', group: 'MUD_GROUP', hit: 2.0, miss: -2.0 },
    '道悪系への備え・強。'),
  r('speed_calks', '快速カルクス', 'Speed Calks', 'BASIC', '2',
    { kind: 'GROUP_PREP', group: 'FIRM_GROUP', hit: 1.5, miss: -1.0 },
    '良系(高速・良)への備え・弱。'),
  r('glass_plates', '良馬場プレート', 'Glass Plates', 'STANDARD', '5',
    { kind: 'GROUP_PREP', group: 'FIRM_GROUP', hit: 2.0, miss: -2.0 },
    '良系への備え・強。'),
  r('full_harness', '完全装備', 'Full Harness', 'PREMIUM', '8',
    { kind: 'DUAL_PREP', hit: 2.0, miss: -2.0 },
    '天候と馬場のグループを1つずつ選んで備える。両的中で器の頂点(+4)へ。'),
  r('storm_eye', '嵐の眼', 'Eye of the Storm', 'BASIC', '3',
    { kind: 'PINPOINT_PREP', axis: 'WEATHER', condition: 'STORM', hit: 2.0, miss: -1.5 },
    'ピンポイント: 嵐のみ的中。max(+2.0)/外れ min(−1.5)。'),
  r('clear_plume', '快晴の羽根飾り', 'Clear-Sky Plume', 'BASIC', '3',
    { kind: 'PINPOINT_PREP', axis: 'WEATHER', condition: 'SUNNY', hit: 2.0, miss: -1.5 },
    'ピンポイント: 晴れのみ的中。'),
  r('deep_tread', '不良の深爪', 'Deep Treads', 'BASIC', '3',
    { kind: 'PINPOINT_PREP', axis: 'TRACK', condition: 'HEAVY', hit: 2.0, miss: -1.5 },
    'ピンポイント: 不良馬場のみ的中。'),
  r('firm_grip', '堅良のグリップ', 'Firm Grip', 'BASIC', '3',
    { kind: 'PINPOINT_PREP', axis: 'TRACK', condition: 'FAST', hit: 2.0, miss: -1.5 },
    'ピンポイント: 高速馬場のみ的中。'),
  r('field_kit', '野営一式', 'Field Kit', 'STANDARD', '4',
    { kind: 'DUAL_PREP', hit: 1.5, miss: -1.0 },
    '両軸・弱。天候と馬場のグループを1つずつ選んで軽く備える。'),
  r('steady_tack', '堅実な馬具', 'Steady Tack', 'STANDARD', '4',
    { kind: 'DUAL_FLOOR' },
    '両軸の適性を0未満にしない保険。的中も外れもない — 苦手条件を消すだけ。'),

  // ---- 非売5種(Burnドロップ・譲渡不可・Decision 109) ----
  r('keepsake_shoe', '形見の蹄鉄', 'Keepsake Shoe', 'BURN_DROP', '0',
    { kind: 'DUAL_PREP', hit: 2.0, miss: -2.0 },
    '完全装備と同じ両軸の備えを1回。弔いの上乗せ。'),
  t('farewell_wreath', '追悼の花冠', 'Farewell Wreath', 'BURN_DROP', '0',
    { kind: 'BONUS', min: 2.0, max: 4.0 },
    '調教の確定ロールに+2.0〜+4.0。'),
  t('testament_mane', '遺志のたてがみ', 'Testament Mane', 'BURN_DROP', '0',
    { kind: 'FLOOR_ZERO' },
    '保険: 確定ロールの合計が0を下回ったら0に引き上げる。'),
  t('roar_soul', '咆哮の魂', 'Roar Soul', 'BURN_DROP', '0',
    { kind: 'BONUS', min: 3.0, max: 5.0, requiresFavorite: true },
    '大好物メニューを含む確定専用: +3.0〜+5.0。'),
  t('aeon_sand', '星霜の砂', 'Aeon Sand', 'BURN_DROP', '0',
    { kind: 'DECAY_SHIELD', races: 2 },
    '使った瞬間から減衰を2レース分無効にする。RESTのいらない手入れ。'),
];

export const ITEM_BY_KEY_V3: ReadonlyMap<string, ItemDefinitionV3> = new Map(
  ITEM_CATALOG_V3.map((i) => [i.key, i]),
);

/** ドロップ抽選順(各20%・シード決定論・旧仕様と同じ器)。 */
export const BURN_DROP_KEYS_V3: readonly string[] = ITEM_CATALOG_V3
  .filter((i) => i.band === 'BURN_DROP')
  .map((i) => i.key);

// ---------------------------------------------------------------------------
// RACE系の置換法則(純関数・決定論 — スナップショットとリプレイ検証が同じ関数を呼ぶ)
// ---------------------------------------------------------------------------

/** DUAL_PREP の使用時パラメータ(備え先グループの選択)。 */
export interface RacePrepParamsV3 {
  weatherGroup?: WeatherGroupV3;
  trackGroup?: TrackGroupV3;
}

export interface RacePrepResultV3 {
  weatherMod: number;
  trackMod: number;
  /** null = その軸に備えていない(判定なし)。 */
  weatherHit: boolean | null;
  trackHit: boolean | null;
}

function inGroup(group: ConditionGroupV3, value: string): boolean {
  return CONDITION_GROUP_MEMBERS_V3[group].includes(value);
}

function overrideAxis(natural: number, hit: boolean, hitFloor: number, missCeil: number): number {
  return hit ? Math.max(natural, hitFloor) : Math.min(natural, missCeil);
}

/**
 * RACE系アイテムを素の適性(各軸±2)へ適用する。判定は**実際の条件**。
 * 返り値の各軸は±2の範囲内に留まるので、合成(±4の器)は構造的に溢れない。
 */
export function applyRacePrepItemV3(args: {
  itemKey: string;
  params: RacePrepParamsV3 | null;
  naturalWeatherMod: number;
  naturalTrackMod: number;
  actualWeather: Weather;
  actualTrack: TrackCondition;
}): RacePrepResultV3 {
  const def = ITEM_BY_KEY_V3.get(args.itemKey);
  if (!def || def.itemClass !== 'RACE') {
    throw new Error(`ITEM_V3_UNKNOWN_RACE_ITEM: ${args.itemKey}`);
  }
  const effect = def.effect as RaceEffectV3;
  let weatherMod = args.naturalWeatherMod;
  let trackMod = args.naturalTrackMod;
  let weatherHit: boolean | null = null;
  let trackHit: boolean | null = null;

  switch (effect.kind) {
    case 'GROUP_PREP': {
      const isWeatherAxis = effect.group === 'RAIN_GROUP' || effect.group === 'SUN_GROUP';
      if (isWeatherAxis) {
        weatherHit = inGroup(effect.group, args.actualWeather);
        weatherMod = overrideAxis(weatherMod, weatherHit, effect.hit, effect.miss);
      } else {
        trackHit = inGroup(effect.group, args.actualTrack);
        trackMod = overrideAxis(trackMod, trackHit, effect.hit, effect.miss);
      }
      break;
    }
    case 'PINPOINT_PREP': {
      if (effect.axis === 'WEATHER') {
        weatherHit = args.actualWeather === effect.condition;
        weatherMod = overrideAxis(weatherMod, weatherHit, effect.hit, effect.miss);
      } else {
        trackHit = args.actualTrack === effect.condition;
        trackMod = overrideAxis(trackMod, trackHit, effect.hit, effect.miss);
      }
      break;
    }
    case 'DUAL_PREP': {
      const wg = args.params?.weatherGroup;
      const tg = args.params?.trackGroup;
      if (!wg || !tg) throw new Error(`ITEM_V3_PARAMS_REQUIRED: ${args.itemKey} needs weatherGroup+trackGroup`);
      weatherHit = inGroup(wg, args.actualWeather);
      trackHit = inGroup(tg, args.actualTrack);
      weatherMod = overrideAxis(weatherMod, weatherHit, effect.hit, effect.miss);
      trackMod = overrideAxis(trackMod, trackHit, effect.hit, effect.miss);
      break;
    }
    case 'DUAL_FLOOR': {
      weatherMod = Math.max(weatherMod, 0);
      trackMod = Math.max(trackMod, 0);
      break;
    }
  }
  return { weatherMod, trackMod, weatherHit, trackHit };
}
