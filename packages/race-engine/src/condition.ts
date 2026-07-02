import {
  CONDITION_FATIGUE_V1,
  conditionModifierV1,
  fatigueModifierV1,
  RECOVERY_TRAINING_FATIGUE_BONUS,
  type TrainingType,
} from '@sevendays/domain';
import { clamp, round2 } from './random.js';

/**
 * Daily Condition / Fatigue recurrence (Decisions 040, 054).
 *
 * Deterministic evaluation order per day:
 *   fatigue_today   = clamp(fatigue_yesterday + training_cost + race_cost - recovery, 0, 100)
 *   condition_today = clamp(condition_yesterday + training_effect - fatigue_today, 0, 100)
 */

export interface DailyStateInput {
  prevCondition: number;
  prevFatigue: number;
  training: TrainingType | null;
  ranRace: boolean;
}

export interface DailyState {
  condition: number;
  fatigue: number;
}

export function computeDailyState(input: DailyStateInput): DailyState {
  const p = CONDITION_FATIGUE_V1;
  const trainingCost = input.training ? p.trainingCost[input.training] : 0;
  const trainingEffect = input.training ? p.trainingEffect[input.training] : 0;
  const recovery =
    p.dailyNaturalRecovery +
    (input.training === 'RECOVERY_TRAINING' ? p.recoveryTrainingAdditionalRecovery : 0);
  const raceCost = input.ranRace ? p.raceFatigueCost : 0;

  const fatigue = round2(
    clamp(input.prevFatigue + trainingCost + raceCost - recovery, p.min, p.max),
  );
  const condition = round2(
    clamp(input.prevCondition + trainingEffect - fatigue, p.min, p.max),
  );
  return { condition, fatigue };
}

/** condition_modifier (-3..+3) from the condition value. */
export function conditionModifier(condition: number): number {
  return conditionModifierV1(condition);
}

/**
 * fatigue_modifier (-5..0) from the fatigue value, including the
 * RECOVERY_TRAINING +1.00 bonus (capped at 0 — it can offset fatigue,
 * never add score).
 */
export function fatigueModifier(fatigue: number, training: TrainingType | null): number {
  const base = fatigueModifierV1(fatigue);
  const bonus = training === 'RECOVERY_TRAINING' ? RECOVERY_TRAINING_FATIGUE_BONUS : 0;
  return clamp(base + bonus, -5, 0);
}
