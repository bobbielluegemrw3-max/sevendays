import {
  SURFACE_JA,
  TRACK_JA,
  WEATHER_JA,
  aggregateVerdictV3,
  conditionGroupLabelV3,
  readFormV3,
  runMatchFlagsV3,
  type AxisReadingV3,
  type ConditionAxisV3,
  type FormHintV3,
  type FormRunV3,
  type Surface,
  type TrackCondition,
  type Weather,
} from '@sevendays/domain';
import type { FormPanelAxis, FormPanelData } from '@/components/FormPanel';

/**
 * ドメイン(readFormV3 / aggregateVerdictV3 / runMatchFlagsV3)→ 馬柱パネルの表示モデル。
 * ロジックはドメインが正・ここは日本語ラベルと軸名(track→ground / surface→course)の写像だけ。
 * 馬柱プレビュー(/dev/form-preview)と本番 HorseDetailView(⑥)で共有する。
 */

export interface FormPanelSource {
  kana: string;
  en: string;
  totalValue: number;
  horseType: string;
  runs: FormRunV3[]; // 新しい順
  forecast: { weather: Weather; track: TrackCondition; surface: Surface };
}

/** domain の軸名 → デザイン側の軸名。 */
const AXIS_TO_PANEL: Record<ConditionAxisV3, FormPanelAxis> = {
  weather: 'weather',
  track: 'ground',
  surface: 'course',
};

const HINT_LABEL: Record<FormHintV3, string> = {
  strong: '得意そうだ',
  weak: '苦手そう',
  even: '五分か',
  unknown: 'まだ読めない',
};

/** 走破数が少なく傾向未確定なら新馬扱い(前向きに「これから読めてくる」)。 */
const ROOKIE_MAX_RUNS = 2;

/** strong 以外の sub 文言(strong は噛み合った条件名を buildFormPanelData で組む)。 */
function verdictSubNonStrong(cls: FormHintV3): string {
  if (cls === 'weak') return '今夜の条件は逆風かもしれない';
  if (cls === 'unknown') return '走ったぶんだけ読めてくる';
  return '条件次第・自信は持ちきれない';
}

export function buildFormPanelData(src: FormPanelSource): FormPanelData {
  const reading = readFormV3(src.runs, src.forecast);
  const verdict = aggregateVerdictV3(reading);

  const runs = src.runs.map((r) => {
    const flags = runMatchFlagsV3(r, src.forecast);
    return {
      weather: WEATHER_JA[r.weather],
      ground: TRACK_JA[r.track],
      course: SURFACE_JA[r.surface],
      rank: r.rank,
      entrants: r.entrants,
      match: { weather: flags.weather, ground: flags.track, course: flags.surface },
    };
  });

  const axesOrder: ConditionAxisV3[] = ['weather', 'track', 'surface'];
  const reads = axesOrder.map((axis) => {
    const a: AxisReadingV3 = reading[axis];
    return {
      axis: AXIS_TO_PANEL[axis],
      name: conditionGroupLabelV3(axis, a.pole), // 今夜その軸が示す条件名(例「雨」)
      label: HINT_LABEL[a.hint],
      runs: a.matched.map((m) => `${m.rank}位`),
      hint: a.hint,
    };
  });

  // strong の sub は噛み合った条件名を各軸の「今夜の極」で呼ぶ(reading.pole 準拠)。
  const strongNames = verdict.strongAxes.map((ax) => conditionGroupLabelV3(ax, reading[ax].pole));
  const sub =
    verdict.cls === 'strong' && strongNames.length
      ? `${strongNames.join(' · ')} が今夜と噛み合っている`
      : verdictSubNonStrong(verdict.cls);

  return {
    kana: src.kana,
    en: src.en,
    total_value: src.totalValue,
    horse_type: src.horseType,
    forecast: {
      weather: WEATHER_JA[src.forecast.weather],
      ground: TRACK_JA[src.forecast.track],
      course: SURFACE_JA[src.forecast.surface],
    },
    runs,
    reads,
    verdict: { cls: verdict.cls, mark: verdict.mark, head: verdict.head, sub },
    isRookie: src.runs.length <= ROOKIE_MAX_RUNS,
  };
}
