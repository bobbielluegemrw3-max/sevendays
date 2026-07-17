import {
  CONDITION_PREP_RANGE_V2,
  LUCK_RANGE_V2,
  LUCK_TRAINED_RANGE_V2,
  type HorseType,
} from '@sevendays/domain';
import { round2, uniformInRange, unitFromParts } from '../random.js';

/**
 * エンジンV2 スコア(Decision 101):
 *
 *   final_score = total_value(0〜100)
 *               + condition_prep_modifier(±4 — 「備え」: タイプ適性+レースアイテム。
 *                 スナップショット時に確定済みの入力として受け取る)
 *               + luck(±3・Irwin-Hall近似の一様合成。LUCK×調教済みは −2〜+4)
 *
 * 総合値がスコアの主役(切れ味=鋭い・オーナー決定)。決定論・commit-reveal検証可能。
 */

export interface ScoreInputV2 {
  horseUuid: string;
  horseType: HorseType;
  /** スナップショット凍結済みの総合値(0〜100)。 */
  totalValue: number;
  /** 「備え」補正(±4)。タイプ適性+レースアイテムの合成をスナップショットで凍結した値。 */
  conditionPrepModifier: number;
  /** 調教確定済みか(LUCKの運レンジ拡大の判定・Decision 052/101)。 */
  trained: boolean;
  raceSeed: string;
  raceEngineVersion: string;
}

export interface ScoreBreakdownV2 {
  horseUuid: string;
  totalValue: number;
  conditionPrepModifier: number;
  luckModifier: number;
  finalScore: number;
}

export class ScoreRangeErrorV2 extends Error {
  constructor(field: string, value: number) {
    super(`MODIFIER_OUT_OF_RANGE: ${field} = ${value}`);
    this.name = 'ScoreRangeErrorV2';
  }
}

export function computeScoreV2(input: ScoreInputV2): ScoreBreakdownV2 {
  if (input.totalValue < 0 || input.totalValue > 100) {
    throw new ScoreRangeErrorV2('total_value', input.totalValue);
  }
  if (
    input.conditionPrepModifier < CONDITION_PREP_RANGE_V2.min ||
    input.conditionPrepModifier > CONDITION_PREP_RANGE_V2.max
  ) {
    throw new ScoreRangeErrorV2('condition_prep_modifier', input.conditionPrepModifier);
  }

  const luckActive = input.horseType === 'LUCK' && input.trained;
  const range = luckActive ? LUCK_TRAINED_RANGE_V2 : LUCK_RANGE_V2;
  // Irwin-Hall(3標本の平均)— 超越関数不使用・エンジン間ビット一致(v1と同じ思想)
  const u =
    (unitFromParts(input.raceSeed, input.horseUuid, input.raceEngineVersion, 'luck-v2', '1') +
      unitFromParts(input.raceSeed, input.horseUuid, input.raceEngineVersion, 'luck-v2', '2') +
      unitFromParts(input.raceSeed, input.horseUuid, input.raceEngineVersion, 'luck-v2', '3')) /
    3;
  const luck = round2(uniformInRange(u, range.min, range.max));

  const finalScore = round2(input.totalValue + input.conditionPrepModifier + luck);
  return {
    horseUuid: input.horseUuid,
    totalValue: input.totalValue,
    conditionPrepModifier: input.conditionPrepModifier,
    luckModifier: luck,
    finalScore,
  };
}
