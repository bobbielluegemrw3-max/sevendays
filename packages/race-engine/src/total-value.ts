import {
  ABILITY_WEIGHTS_V1,
  MODIFIER_RANGES_V1,
  RARITY_MODIFIER_V1,
  trainingModifierV1,
  type AbilityName,
  type HorseType,
  type Rarity,
  type TrainingType,
} from '@sevendays/domain';
import { computeDailyState, conditionModifier, fatigueModifier } from './condition.js';
import { round2 } from './random.js';

/**
 * 総合値 V0(FUN改修 A1・表示先行 — FUN_V2_PLAN.md §3 A1)。
 *
 * 「馬の強さが1つの数字(0〜100)で分かる」ための表示値。**手書きの近似式ではなく、
 * レースエンジンが今夜のスナップショットで実際に行う計算そのもの**から導出する:
 *
 *   1. 状態の漸化式: computeDailyState(現在の調子/疲労, 今夜の調教, ranRace=true)
 *      — スナップショット(settlement-engine/race/snapshots.ts)と同一
 *   2. スコアの決定論部分: base_ability_score(ABILITY_WEIGHTS_V1の加重和)
 *      + rarity + dna + training + condition + fatigue の各修正値
 *      — computeScore と同一の関数・定数
 *   3. その合計を理論レンジ [min, max] で 0〜100 に正規化
 *
 * 含めないもの(理由):
 *   - weather / track: 当日条件への「備え」の軸 — 馬固有の値ではない(別表示)
 *   - random: 運 — 見せたら嘘になる
 *   - revenge buff / item: 一時ブースト — 別バッジで表示する
 *
 * V2(総合値がエンジン機構になる)までの間、この値は「実配点に忠実な目安」。
 * 嘘の数字を見せない不変条項(FUN_V2_PLAN.md §1-2)の下で管理する。
 */

export interface TotalValueInputV0 {
  /** horses.ability_json(5能力。base_ability_scoreキーは無視して加重和を再計算)。 */
  abilityJson: Record<string, number>;
  horseType: HorseType;
  rarity: Rarity;
  /** horses.dna_modifier(-2.00〜+2.00)。 */
  dnaModifier: number;
  /** horses.condition / horses.fatigue(現在値 — 前回バッチ確定後の値)。 */
  condition: number;
  fatigue: number;
  /** 今夜向けに確定済みの調教タイプ(未調教は null)。 */
  training: TrainingType | null;
}

/** 決定論部分の理論最小値(定数表から導出 — 定数が変われば自動で追随)。 */
function rarityRange(): { min: number; max: number } {
  const values = Object.values(RARITY_MODIFIER_V1);
  return { min: Math.min(...values), max: Math.max(...values) };
}

const R = MODIFIER_RANGES_V1;
const TOTAL_MIN =
  R.base_ability_score.min + rarityRange().min + R.dna_modifier.min +
  R.training_modifier.min + R.condition_modifier.min + R.fatigue_modifier.min;
const TOTAL_MAX =
  R.base_ability_score.max + rarityRange().max + R.dna_modifier.max +
  R.training_modifier.max + R.condition_modifier.max + R.fatigue_modifier.max;

/** 正規化前の決定論スコア(computeScoreの weather/track/random/buff/item を除いた部分)。 */
export function deterministicScoreV0(input: TotalValueInputV0): number {
  const state = computeDailyState({
    prevCondition: input.condition,
    prevFatigue: input.fatigue,
    training: input.training,
    ranRace: true, // 今夜走る前提の投影 — スナップショットと同じ
  });
  const base = round2(
    (Object.keys(ABILITY_WEIGHTS_V1) as AbilityName[]).reduce(
      (sum, name) => sum + Number(input.abilityJson[name] ?? 0) * ABILITY_WEIGHTS_V1[name],
      0,
    ),
  );
  return round2(
    base +
      RARITY_MODIFIER_V1[input.rarity] +
      input.dnaModifier +
      trainingModifierV1(input.horseType, input.training) +
      conditionModifier(state.condition) +
      fatigueModifier(state.fatigue, input.training),
  );
}

/** 総合値 V0: 0〜100 の整数。 */
export function totalValueV0(input: TotalValueInputV0): number {
  const raw = deterministicScoreV0(input);
  const normalized = ((raw - TOTAL_MIN) / (TOTAL_MAX - TOTAL_MIN)) * 100;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

/** 「今夜の安全圏」バンド(表示専用のヒューリスティック — FUN_V2_PLAN.md §3 A1)。
 *  BURN選定には運が絡むため順位は保証ではない。しきい値はここだけで管理する。 */
export type TonightBand = 'SAFE' | 'MID' | 'RISK';
export const BAND_SAFE_TOP_RATIO = 0.4; // 上位40% = 安全圏
export const BAND_RISK_BOTTOM_RATIO = 0.25; // 下位25% = 危険圏(BURN枠8〜13.5%+運の余白)

export function tonightBand(rank: number, entrants: number): TonightBand {
  if (entrants <= 0 || rank <= 0) return 'MID';
  if (rank <= Math.ceil(entrants * BAND_SAFE_TOP_RATIO)) return 'SAFE';
  if (rank > entrants - Math.ceil(entrants * BAND_RISK_BOTTOM_RATIO)) return 'RISK';
  return 'MID';
}
