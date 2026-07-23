import type { Surface, TrackCondition, Weather } from './enums.js';
import {
  CONDITION_PREP_RANGE_V3,
  conditionPoleV3,
  type ConditionAxisV3,
  type RaceConditionsV3,
} from './v3.js';

/**
 * ============================================================================
 * アイテムカタログ V4 — 調教・適性再設計の26点(TRAINING_APTITUDE_REDESIGN.md §14.5)
 * ============================================================================
 * 位置づけ: V3(race_engine_v3.0)と対。稼働中の items-v3(item_policy_v3.0)は不変。
 *   V4 は「6条件 × 一貫パターン」で作り直したカタログ。次のリセットで有効化。
 *
 * 2系統(§7):
 *   🔵 調教アイテム(6) — 馬を強くする(total_value に合流・ソフトキャップ85に服す)
 *   🔴 レースアイテム(20) — 今夜の条件に賭ける(condition_prep の ±4 の器へ「加算」)
 *
 * ★レースアイテムは V3 で **加算方式**(§14.6): 対象軸に hit/miss を足す。
 *   （V3 の items-v3 は「置換方式」だったが、集中プレイで売り文句を18.9%削り §6 とも
 *     相反するため不採用。加算は削られ0.4%・§6「3つ揃うと積み上がる」と一致。）
 *   合算後の ±4 クランプは composeConditionPrepV3 が担う(超過で例外を防ぐ)。
 *
 * ★価格は「EV中立」を起点(§14.7)。無思考で毎回買う=損得ゼロ / 読んで買う=+ になる価格。
 *   弱4.7/中6.4/強7.7(+運営マージン)。調教ラダーは複利ぶん高い。最終値は RTP再突合で確定。
 *
 * 全効果は公開・決定論・リプレイ検証可能(運営裁量の変更は構造的に不可能)。
 */

export const ITEM_POLICY_VERSION_V4 = 'item_policy_v4.0';

export type ItemClassV4 = 'TRAINING' | 'RACE';
export type ItemTierV4 = 'S' | 'M' | 'L' | 'XL' | 'WEAK' | 'MID' | 'STRONG' | 'GUARD' | 'INSURE';

/* ---------------------------------------------------------------------------
 * 効果の型
 * ------------------------------------------------------------------------- */

/** 🔵 調教アイテム: total_value の伸びに合流(ソフトキャップ85に服す)。 */
export type TrainingEffectV4 =
  | { kind: 'GROWTH'; min: number; max: number } // 一様ロールで total_value ゲイン
  | { kind: 'DECAY_SHIELD'; races: number }; // 減衰を N レース無効(守り)

/** 🔴 レースアイテム: condition_prep への「加算」値(±4 は composeConditionPrep がクランプ)。 */
export type RaceEffectV4 =
  | {
      // 6条件のいずれか1つに備える。的中(その軸の実極性が備えた向き)で +hit / 外れで miss。
      kind: 'CONDITION_PREP';
      axis: ConditionAxisV3;
      pole: -1 | 1; // 備える極(＝どの条件か)
      hit: number; // 加算(的中時・+)
      miss: number; // 加算(外れ時・−)
    }
  | { kind: 'INSURANCE'; all: number }; // 全天候: どの条件でも小さく + (外れなし・保険)

export interface ItemDefinitionV4 {
  key: string;
  nameJa: string;
  nameEn: string;
  itemClass: ItemClassV4;
  tier: ItemTierV4;
  /** 条件タグ(player-facing の〔条件・段階〕表示に使う)。 */
  conditionTag: string;
  /** 整数 USDT(EV中立起点・§14.7)。最終値は RTP再突合で確定。 */
  price: string;
  effect: TrainingEffectV4 | RaceEffectV4;
  descriptionJa: string;
}

function race(
  key: string,
  nameJa: string,
  nameEn: string,
  axis: ConditionAxisV3,
  pole: -1 | 1,
  tier: 'WEAK' | 'MID' | 'STRONG',
  conditionTag: string,
  hit: number,
  miss: number,
  price: string,
): ItemDefinitionV4 {
  const step = tier === 'WEAK' ? '弱' : tier === 'MID' ? '中' : '強';
  return {
    key, nameJa, nameEn, itemClass: 'RACE', tier, conditionTag: `${conditionTag}・${step}`,
    price, effect: { kind: 'CONDITION_PREP', axis, pole, hit, miss },
    descriptionJa: `${conditionTag}に備える・${step}。的中 +${hit.toFixed(1)} / 外れ ${miss.toFixed(1)}。`,
  };
}

/* ---------------------------------------------------------------------------
 * カタログ本体(26点 = 調教6 + レース20)。§14.5 の確定たたき台。
 * ------------------------------------------------------------------------- */

/** レースの段階(§14.5): 弱 +1.0/−0.5 ・ 中 +1.8/−1.2 ・ 強 +2.5/−2.0。 */
const RACE_TIERS = {
  WEAK: { hit: 1.0, miss: -0.5, price: '5' }, // EV中立 ≈4.7 + マージン
  MID: { hit: 1.8, miss: -1.2, price: '6' }, //  ≈6.4
  STRONG: { hit: 2.5, miss: -2.0, price: '8' }, // ≈7.7
} as const;

/** 6条件 × それぞれの日本語名・軸・極・アイテム名(天候=着るもの / 馬場・コース=履くもの)。 */
const RACE_CONDITIONS: {
  cond: string; axis: ConditionAxisV3; pole: -1 | 1; ja: string; en: string; keyBase: string;
}[] = [
  { cond: '雨', axis: 'weather', pole: 1, ja: '雨合羽', en: 'Rain Cape', keyBase: 'rain_cape' },
  { cond: '晴', axis: 'weather', pole: -1, ja: '日よけ帽', en: 'Sun Hat', keyBase: 'sun_hat' },
  { cond: '道悪', axis: 'track', pole: 1, ja: '泥よけ蹄鉄', en: 'Mud Shoes', keyBase: 'mud_shoes' },
  { cond: '良馬場', axis: 'track', pole: -1, ja: '快速蹄鉄', en: 'Speed Shoes', keyBase: 'speed_shoes' },
  { cond: '芝', axis: 'surface', pole: 1, ja: '芝蹄鉄', en: 'Turf Shoes', keyBase: 'turf_shoes' },
  { cond: 'ダート', axis: 'surface', pole: -1, ja: '砂蹄鉄', en: 'Dirt Shoes', keyBase: 'dirt_shoes' },
];

const RACE_ITEMS: ItemDefinitionV4[] = RACE_CONDITIONS.flatMap((c) =>
  (['WEAK', 'MID', 'STRONG'] as const).map((tier) => {
    const t = RACE_TIERS[tier];
    const suffix = tier === 'WEAK' ? '弱' : tier === 'MID' ? '中' : '強';
    return race(
      `${c.keyBase}_${tier.toLowerCase()}`,
      `${c.ja}〔${c.cond}・${suffix}〕`,
      `${c.en} (${suffix})`,
      c.axis, c.pole, tier, c.cond, t.hit, t.miss, t.price,
    );
  }),
);

const INSURANCE_ITEMS: ItemDefinitionV4[] = [
  {
    key: 'full_ready_std', nameJa: '万全の備え〔全天候・並〕', nameEn: 'Full Ready',
    itemClass: 'RACE', tier: 'INSURE', conditionTag: '全天候・並', price: '4',
    effect: { kind: 'INSURANCE', all: 0.6 },
    descriptionJa: '全天候の保険。どの条件でも +0.6(外れなし)。読みが不安な夜のヘッジ。',
  },
  {
    key: 'full_ready_max', nameJa: '万全の備え・極〔全天候・上〕', nameEn: 'Full Ready+',
    itemClass: 'RACE', tier: 'INSURE', conditionTag: '全天候・上', price: '7',
    effect: { kind: 'INSURANCE', all: 1.0 },
    descriptionJa: '全天候の保険・強。どの条件でも +1.0(外れなし)。',
  },
];

/**
 * 🔵 調教ラダー(§14.5 + §15 聖杯 throttle)。total_value に合流。
 * ★聖杯制約(§15): 毎走使っても実効ゲインが GRAIL_ITEM_EFFECTIVE_GAIN_PER_RACE_V3(+4)に
 *   収まるよう、上位ラダーは値を抑える(黄金/秘伝の+4〜6は不採用)。90+到達率≈1.5%。
 */
const TRAINING_ITEMS: ItemDefinitionV4[] = [
  {
    key: 'highland_hay', nameJa: '高原の干し草〔強化・小〕', nameEn: 'Highland Hay',
    itemClass: 'TRAINING', tier: 'S', conditionTag: '強化・小', price: '2',
    effect: { kind: 'GROWTH', min: 1.0, max: 2.0 },
    descriptionJa: '総合値の伸び +1.0〜2.0。入口の強化。',
  },
  {
    key: 'carrot_cube', nameJa: 'にんじんキューブ〔強化・中〕', nameEn: 'Carrot Cube',
    itemClass: 'TRAINING', tier: 'M', conditionTag: '強化・中', price: '4',
    effect: { kind: 'GROWTH', min: 2.0, max: 3.0 },
    descriptionJa: '総合値の伸び +2.0〜3.0。',
  },
  {
    key: 'secret_feed', nameJa: '秘伝の飼い葉〔強化・大〕', nameEn: 'Secret Feed',
    itemClass: 'TRAINING', tier: 'L', conditionTag: '強化・大', price: '6',
    effect: { kind: 'GROWTH', min: 2.5, max: 3.5 },
    descriptionJa: '総合値の伸び +2.5〜3.5。よく育てた馬の主力(聖杯 throttle 内)。',
  },
  {
    key: 'golden_feed', nameJa: '黄金の飼い葉〔強化・特大〕', nameEn: 'Golden Feed',
    itemClass: 'TRAINING', tier: 'XL', conditionTag: '強化・特大', price: '10',
    effect: { kind: 'GROWTH', min: 3.0, max: 4.0 },
    descriptionJa: '総合値の伸び +3.0〜4.0。90+の聖杯を狙う一手(毎走の実効は+4に収まる)。',
  },
  {
    key: 'aeon_sand', nameJa: '星霜の砂〔減衰よけ・1走〕', nameEn: 'Aeon Sand',
    itemClass: 'TRAINING', tier: 'GUARD', conditionTag: '減衰よけ・1走', price: '3',
    effect: { kind: 'DECAY_SHIELD', races: 1 },
    descriptionJa: '減衰を1レース無効(RESTのいらない手入れ)。',
  },
  {
    key: 'long_rest', nameJa: '長期の休養〔減衰よけ・3走〕', nameEn: 'Long Rest',
    itemClass: 'TRAINING', tier: 'GUARD', conditionTag: '減衰よけ・3走', price: '6',
    effect: { kind: 'DECAY_SHIELD', races: 3 },
    descriptionJa: '減衰を3レース無効。長い守り。',
  },
];

export const ITEM_CATALOG_V4: readonly ItemDefinitionV4[] = [
  ...TRAINING_ITEMS,
  ...RACE_ITEMS,
  ...INSURANCE_ITEMS,
];

export const ITEM_BY_KEY_V4: ReadonlyMap<string, ItemDefinitionV4> = new Map(
  ITEM_CATALOG_V4.map((i) => [i.key, i]),
);

export const RACE_ITEM_KEYS_V4: readonly string[] = ITEM_CATALOG_V4
  .filter((i) => i.itemClass === 'RACE')
  .map((i) => i.key);
export const TRAINING_ITEM_KEYS_V4: readonly string[] = ITEM_CATALOG_V4
  .filter((i) => i.itemClass === 'TRAINING')
  .map((i) => i.key);

/* ---------------------------------------------------------------------------
 * レースアイテムの加算値(純関数・決定論)— 実際の条件に対して hit/miss を返す。
 * スナップショットとリプレイが同じ関数を呼ぶ。返り値は composeConditionPrepV3 の
 * itemEdge に渡す(合算後に ±4 クランプされるので、ここでは器を気にせず素直に返す)。
 * ------------------------------------------------------------------------- */

/** レースアイテム1つの condition_prep への加算値。RACE 以外・未知キーは 0。 */
export function raceItemEdgeV4(itemKey: string, conditions: RaceConditionsV3): number {
  const def = ITEM_BY_KEY_V4.get(itemKey);
  if (!def || def.itemClass !== 'RACE') return 0;
  const e = def.effect as RaceEffectV4;
  if (e.kind === 'INSURANCE') return e.all;
  // 的中 = その軸の実極性が、備えた極 (pole) と一致
  const actualPole = conditionPoleV3(e.axis, conditionValueForAxis(e.axis, conditions));
  return actualPole === e.pole ? e.hit : e.miss;
}

function conditionValueForAxis(
  axis: ConditionAxisV3,
  c: RaceConditionsV3,
): Weather | TrackCondition | Surface {
  return axis === 'weather' ? c.weather : axis === 'track' ? c.track : c.surface;
}

/** 開発用の自己点検: レースアイテムの hit/miss は単体で ±4 の器の内側(合算前)。 */
export function raceItemWithinHalfVesselV4(): boolean {
  const half = CONDITION_PREP_RANGE_V3.max;
  for (const key of RACE_ITEM_KEYS_V4) {
    const def = ITEM_BY_KEY_V4.get(key)!;
    const e = def.effect as RaceEffectV4;
    if (e.kind === 'CONDITION_PREP' && (Math.abs(e.hit) > half || Math.abs(e.miss) > half)) return false;
  }
  return true;
}
