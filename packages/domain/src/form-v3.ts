import type { Surface, TrackCondition, Weather } from './enums.js';
import { CONDITION_AXES_V3, conditionPoleV3, type ConditionAxisV3 } from './v3.js';

/**
 * ============================================================================
 * 馬柱の読解(TRAINING_APTITUDE_REDESIGN.md §3 / §12.3-b)
 * ============================================================================
 * 隠れた個体適性は「馬柱(過去成績)を読めば見抜ける」。ただしシムで分かった通り、
 * 7走では機械推定は半分しか当たらない(§12.3)。→ **数値推定を機械にやらせず**、
 * 「今夜の予報に一致する過去走だけを抜き出して並べる」ことで、人間がパターンを読む。
 *
 * これは表示用の抽出・要約であり、隠れた適性値そのものは絶対に出さない(R1/読解の楽しみ)。
 * ヒントは「得意そう/苦手そう/五分/まだ読めない」の曖昧な当たりだけ(決定論でない=基準D)。
 */

export interface FormRunV3 {
  weather: Weather;
  track: TrackCondition;
  surface: Surface;
  /** 着順(1始まり)。 */
  rank: number;
  /** 出走頭数。 */
  entrants: number;
}

/** 1走の「走り具合」を [0,1] に正規化(1=1着 / 0=最下位)。頭数1以下は 0.5(判定不能)。 */
export function runPerformanceV3(run: Pick<FormRunV3, 'rank' | 'entrants'>): number {
  if (run.entrants <= 1) return 0.5;
  const p = 1 - (run.rank - 1) / (run.entrants - 1);
  return Math.max(0, Math.min(1, p));
}

export type FormHintV3 = 'strong' | 'weak' | 'even' | 'unknown';

export interface AxisReadingV3 {
  axis: ConditionAxisV3;
  /** 今夜の予報がこの軸で属する極(+1/−1)。 */
  pole: -1 | 1;
  /** その極で走った過去走(新しい順)。 */
  matched: FormRunV3[];
  /** 平均パフォーマンス [0,1](matched が空なら null)。 */
  performance: number | null;
  /** 読解ヒント(曖昧・決定論でない)。 */
  hint: FormHintV3;
}

/** ヒントの閾値。強すぎない(2走未満は unknown・§12.3 の「一生分からない/丸見え」の中間)。 */
const MIN_RUNS_TO_READ = 2;
const STRONG_AT = 0.6;
const WEAK_AT = 0.4;

function hintFrom(matched: FormRunV3[], performance: number | null): FormHintV3 {
  if (performance === null || matched.length < MIN_RUNS_TO_READ) return 'unknown';
  if (performance >= STRONG_AT) return 'strong';
  if (performance <= WEAK_AT) return 'weak';
  return 'even';
}

/** 1軸ぶんの読解: 今夜の予報がその軸で示す極と同じ極で走った過去走を抜き出し、要約する。 */
export function readAxisV3(
  runs: readonly FormRunV3[],
  axis: ConditionAxisV3,
  forecastValue: Weather | TrackCondition | Surface,
): AxisReadingV3 {
  const pole = conditionPoleV3(axis, forecastValue);
  const matched = runs
    .filter((r) => conditionPoleV3(axis, axisValue(r, axis)) === pole)
    .slice(); // 呼び出し側で順序を保証(新しい順の入力を期待)
  const performance =
    matched.length > 0 ? matched.reduce((s, r) => s + runPerformanceV3(r), 0) / matched.length : null;
  return { axis, pole, matched, performance, hint: hintFrom(matched, performance) };
}

/** 3軸すべての読解を返す(今夜の予報に対する馬柱の抽出)。 */
export function readFormV3(
  runs: readonly FormRunV3[],
  forecast: { weather: Weather; track: TrackCondition; surface: Surface },
): Record<ConditionAxisV3, AxisReadingV3> {
  return {
    weather: readAxisV3(runs, 'weather', forecast.weather),
    track: readAxisV3(runs, 'track', forecast.track),
    surface: readAxisV3(runs, 'surface', forecast.surface),
  };
}

function axisValue(run: FormRunV3, axis: ConditionAxisV3): Weather | TrackCondition | Surface {
  return axis === 'weather' ? run.weather : axis === 'track' ? run.track : run.surface;
}

/** player-facing の条件名(6条件・§2)。軸×極 → 呼称。 */
export const CONDITION_GROUP_LABEL_V3: Readonly<Record<ConditionAxisV3, { positive: string; negative: string }>> = {
  weather: { positive: '雨', negative: '晴' },
  track: { positive: '道悪', negative: '良馬場' },
  surface: { positive: '芝', negative: 'ダート' },
};

/** ある軸×極の条件名(例: weather,+1 → 「雨」)。 */
export function conditionGroupLabelV3(axis: ConditionAxisV3, pole: -1 | 1): string {
  const l = CONDITION_GROUP_LABEL_V3[axis];
  return pole > 0 ? l.positive : l.negative;
}

export const CONDITION_AXES_ORDER_V3 = CONDITION_AXES_V3;
