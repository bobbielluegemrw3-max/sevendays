import type { Surface, TrackCondition, Weather } from './enums.js';
import { seedUnit } from './volatility.js';

/**
 * ============================================================================
 * V3 定数 — 調教・適性・アイテムの根本再設計(TRAINING_APTITUDE_REDESIGN.md)
 * ============================================================================
 * 位置づけ: 稼働中の V2(race_engine_v2.0)は不変。V3 は**別バージョンとして並走**し、
 *   次のテストネットリセットで有効化する(適性が個体別になるので既存馬の中身が変わる
 *   = リセットが自然な切替点)。エンジンは保存済みバージョン文字列で V2/V3 を分岐する。
 *
 * 設計の核(§0・§14): すべてを **6つの条件** で貫く。
 *   天候: 雨(雨・嵐) / 晴(晴・曇)   馬場: 道悪(稍重・不良) / 良馬場(高速・良)   コース: 芝 / ダート
 *
 * スコア式は V2 と同じ器を使う(§9「経済の骨格は触らない」):
 *   score = total_value + condition_prep(±4) + luck
 * 変えるのは condition_prep の**中身**だけ:
 *   condition_prep = clamp( 適性エッジ + 調教の備え + レースアイテム, ±4 )
 *
 * 数値は経済シムで検証済み(training-aptitude-sim.mjs / training-item-catalog-sim.mjs):
 *   器±4据置・メニューEV平坦化・重み 適性2.5/調教0.8 で A〜F 6/6(§12.1)。
 *   RTP突合で C(ソルベンシー)保持を確認(§16)。最終値は実装後の RTP 再突合で確定。
 */

/** V3 のバージョン文字列(race_engine_versions に登録・リセット時に有効化)。 */
export const RACE_ENGINE_V3_VERSION = 'race_engine_v3.0';

/** 保存済みバージョン文字列で V3 経路を分岐する(リプレイは常に当時の経路=憲法)。 */
export function isRaceEngineV3(version: string): boolean {
  return version.startsWith('race_engine_v3');
}

/* ---------------------------------------------------------------------------
 * 1. 6条件モデル — 3軸 × 2極。極性は「+側の極に属するか」の二値(±1)。
 *    適性・調教・レースアイテムの全てがこの同じ極性で喋る(§14.0 共通言語)。
 * ------------------------------------------------------------------------- */

export const CONDITION_AXES_V3 = ['weather', 'track', 'surface'] as const;
export type ConditionAxisV3 = (typeof CONDITION_AXES_V3)[number];

/** 各軸の「+極」に属する実条件(player-facing の呼称と対応)。 */
export const AXIS_POSITIVE_MEMBERS_V3: Readonly<Record<ConditionAxisV3, readonly string[]>> = {
  weather: ['RAIN', 'STORM'], // +極 = 雨（雨・嵐）
  track: ['SOFT', 'HEAVY'], //   +極 = 道悪（稍重・不良）
  surface: ['TURF'], //          +極 = 芝
};

/** 実条件の1軸ぶんの極性(+1 = 雨/道悪/芝側、−1 = 晴/良馬場/ダート側)。 */
export function conditionPoleV3(axis: ConditionAxisV3, value: Weather | TrackCondition | Surface): -1 | 1 {
  return AXIS_POSITIVE_MEMBERS_V3[axis].includes(value) ? 1 : -1;
}

/** 3軸まとめて極性を出す(適性・調教の噛み合い計算の入力)。 */
export interface RaceConditionsV3 {
  weather: Weather;
  track: TrackCondition;
  surface: Surface;
}
export function conditionPolesV3(c: RaceConditionsV3): Record<ConditionAxisV3, -1 | 1> {
  return {
    weather: conditionPoleV3('weather', c.weather),
    track: conditionPoleV3('track', c.track),
    surface: conditionPoleV3('surface', c.surface),
  };
}

/* ---------------------------------------------------------------------------
 * 2. 隠れた適性 — 個体ごと(dna_hash 由来)。3軸それぞれ [-1, +1]。
 *    +1 = その軸の+極が完全に得意 / −1 = −極が完全に得意 / 0 = どちらでもない。
 *    タイプ固定ではない(§2 オーナー決定)。deriveNftLook と同じ決定論導出方式。
 * ------------------------------------------------------------------------- */

export interface AptitudeV3 {
  weather: number; // [-1, 1]
  track: number;
  surface: number;
}

/** dna_hash から個体の隠れた適性を導出する(保存しない・決定論・検証可能)。 */
export function deriveAptitudeV3(dnaHash: string): AptitudeV3 {
  return {
    weather: 2 * seedUnit(dnaHash, 'apt-weather-v3') - 1,
    track: 2 * seedUnit(dnaHash, 'apt-track-v3') - 1,
    surface: 2 * seedUnit(dnaHash, 'apt-surface-v3') - 1,
  };
}

/** player-facing の適性ラベル(§2・A案「巧者」で統一)。強さ順の呼称は表示側で。 */
export const APTITUDE_LABELS_V3: Readonly<
  Record<ConditionAxisV3, { positive: string; negative: string }>
> = {
  weather: { positive: '雨巧者', negative: '晴巧者' },
  track: { positive: '道悪巧者', negative: '良馬場巧者' },
  surface: { positive: '芝巧者', negative: 'ダート巧者' },
};

/* ---------------------------------------------------------------------------
 * 3. 調教メニュー6つ ↔ 条件6極(1対1・§4)。内部キーは V2 と同じ(HILL 等)。
 *    成長は全メニュー均等(EV平坦化=HILL一択の根治・§13 決定2)。違いは「どの条件に
 *    備えるか」だけ。SPAR のみ高分散を博打の風味として残す。REST は 0+減衰無効。
 * ------------------------------------------------------------------------- */

export type TrainingMenuV3 = 'HILL' | 'POOL' | 'WOOD' | 'GATE' | 'SPAR' | 'REST';

/** メニュー → 備える条件(軸 + 極)。表示名も併記(player-facing)。 */
export const MENU_CONDITION_V3: Readonly<
  Record<TrainingMenuV3, { axis: ConditionAxisV3; pole: -1 | 1; label: string; prepares: string }>
> = {
  HILL: { axis: 'track', pole: 1, label: '坂路', prepares: '道悪' },
  POOL: { axis: 'weather', pole: 1, label: '水泳', prepares: '雨' },
  WOOD: { axis: 'surface', pole: 1, label: 'ウッド', prepares: '芝' },
  GATE: { axis: 'track', pole: -1, label: 'ゲート', prepares: '良馬場' },
  SPAR: { axis: 'surface', pole: -1, label: '併せ馬', prepares: 'ダート' },
  REST: { axis: 'weather', pole: -1, label: '調整', prepares: '晴＋回復' },
};

/**
 * メニューの永続成長レンジ(EV均等・§14.5)。REST は 0(減衰無効の守り)、
 * SPAR は同EVで高分散(下振れ拡大=博打の風味)。値は紙合意・RTP再突合で確定。
 */
export const TRAINING_MENUS_V3: readonly { key: TrainingMenuV3; min: number; max: number }[] = [
  { key: 'HILL', min: 1.5, max: 3.5 }, // 期待 2.5
  { key: 'POOL', min: 1.5, max: 3.5 },
  { key: 'WOOD', min: 1.5, max: 3.5 },
  { key: 'GATE', min: 1.5, max: 3.5 },
  { key: 'SPAR', min: 0.0, max: 5.0 }, // 期待 2.5・高分散
  { key: 'REST', min: 0.0, max: 0.0 }, // 成長0・減衰無効(§4)
];
export const TRAINING_MENU_KEYS_V3: readonly TrainingMenuV3[] = TRAINING_MENUS_V3.map((m) => m.key);
export const TRAINING_MENU_BY_KEY_V3 = new Map(TRAINING_MENUS_V3.map((m) => [m.key, m]));

/** RESTを含むかで減衰無効(§4・V2の utility を維持)。 */
export function menusNegateDecayV3(menus: readonly TrainingMenuV3[]): boolean {
  return menus.includes('REST');
}

/** 1レースサイクルの組み合わせ上限(V2 と同じ・§5「2つ選ぶ」)。 */
export const TRAINING_COMBO_SIZE_V3 = 2;

/* ---------------------------------------------------------------------------
 * 4. condition_prep の合成 — 適性 + 調教 + レースアイテム を足して ±4 にクランプ。
 *    ★クランプは必須: computeScoreV2 系は prep>±4 で例外を投げる(score.ts)。3入力の
 *    整列尾で±4を超えうるので、凍結前にここで必ずクランプする(§12.2 / §14.7)。
 *    重みは経済シムの検証点(§12.1: 適性2.5/調教0.8)。
 * ------------------------------------------------------------------------- */

/** condition_prep の器(V2 と同一・広げない=基準B の生命線・§9)。 */
export const CONDITION_PREP_RANGE_V3 = { min: -4.0, max: 4.0 } as const;

/** 適性の総寄与(全3軸整列時の最大)。3軸へ均等按分。 */
export const APTITUDE_TOTAL_WEIGHT_V3 = 2.5;
/** 調教の備えの総寄与(2メニュー整列時の最大)。2枠へ均等按分。 */
export const TRAINING_PREP_TOTAL_WEIGHT_V3 = 0.8;

const APT_W_PER_AXIS = APTITUDE_TOTAL_WEIGHT_V3 / CONDITION_AXES_V3.length;
const TRN_W_PER_MENU = TRAINING_PREP_TOTAL_WEIGHT_V3 / TRAINING_COMBO_SIZE_V3;

/** 適性エッジ = Σ_軸 適性[軸] × 実条件の極性 × 軸あたり重み。噛み合えば+・逆風は−。 */
export function aptitudeEdgeV3(apt: AptitudeV3, conditions: RaceConditionsV3): number {
  const poles = conditionPolesV3(conditions);
  let sum = 0;
  for (const axis of CONDITION_AXES_V3) sum += apt[axis] * poles[axis] * APT_W_PER_AXIS;
  return sum;
}

/** 調教の備えエッジ = Σ_選んだメニュー (メニュー極 × 実条件の極性) × メニューあたり重み。 */
export function trainingPrepEdgeV3(
  menus: readonly TrainingMenuV3[],
  conditions: RaceConditionsV3,
): number {
  const poles = conditionPolesV3(conditions);
  let sum = 0;
  for (const menu of menus) {
    const m = MENU_CONDITION_V3[menu];
    sum += m.pole * poles[m.axis] * TRN_W_PER_MENU;
  }
  return sum;
}

/**
 * 3入力を合算して condition_prep を確定する(±4 クランプ必須)。
 * itemEdge はレースアイテム(items-v4)側で計算した加算値を受け取る。
 * NaN/Infinity ガード(不正値で例外を投げるより 0 側へ倒す — 表示ヘルパの教訓)。
 */
export function composeConditionPrepV3(input: {
  apt: AptitudeV3;
  menus: readonly TrainingMenuV3[];
  itemEdge?: number;
  conditions: RaceConditionsV3;
}): number {
  const raw =
    aptitudeEdgeV3(input.apt, input.conditions) +
    trainingPrepEdgeV3(input.menus, input.conditions) +
    (Number.isFinite(input.itemEdge) ? (input.itemEdge as number) : 0);
  const safe = Number.isFinite(raw) ? raw : 0;
  return Math.max(CONDITION_PREP_RANGE_V3.min, Math.min(CONDITION_PREP_RANGE_V3.max, safe));
}

/* ---------------------------------------------------------------------------
 * 5. 聖杯 throttle(§15) — 調教アイテムで total_value 90+ に届くのは「稀な聖杯」。
 *    実効ゲイン +4/走 で到達率 ≈1.5%(検証済み・§14.7/§15.1)。カタログ(items-v4)の
 *    強化ラダーは「毎走使っても実効 +4/走 に収まる」よう値と頻度で組む。
 * ------------------------------------------------------------------------- */

/** 聖杯の狙い: 調教アイテムの実効総ゲインの上限(毎走使った時の p99 ≈90 の境界)。 */
export const GRAIL_ITEM_EFFECTIVE_GAIN_PER_RACE_V3 = 4.0;
/** その throttle での 90+ 到達率(検証済み・カード90+聖杯ティアの前提)。 */
export const GRAIL_REACH_RATE_V3 = 0.015;
