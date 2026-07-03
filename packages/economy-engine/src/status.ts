import type { SqlClient } from '@sevendays/shared';
import {
  ECONOMY_STATUS_SEVERITY,
  STABILITY_RULE_V1,
  type EconomyStatus,
  type StressScenario,
} from '@sevendays/domain';
import type { EconomyMetrics } from './metrics.js';

/**
 * Economy Status evaluation (04_ECONOMY_ENGINE.md, Decisions 025/026/059).
 * The Deterministic Policy Engine recommends; threshold rules decide.
 * No LLM anywhere in this path (Decision 046).
 */

/** Threshold candidate from metrics — most severe match wins. */
export function thresholdStatus(metrics: EconomyMetrics): EconomyStatus {
  const cash = metrics.cashCoverageRatio;
  const forecast = metrics.forecastedCashCoverage;

  if (cash < 1.2 || forecast < 1.2 || metrics.buybackCashCoverageRatio < 1.0) {
    return 'EMERGENCY';
  }
  if (cash < 1.5 || forecast < 1.5) {
    return 'WINTER';
  }
  if (cash < 2.0 || metrics.p2pMatchRate < 0.8 || metrics.rebuyRate < 0.3) {
    return 'WATCH';
  }
  return 'NORMAL';
}

/** Stress failure -> minimum status escalation (Decision 059). */
export function stressEscalationFloor(
  failures: readonly { scenario: StressScenario; buybackShortfall: boolean }[],
): EconomyStatus {
  let floor: EconomyStatus = 'NORMAL';
  const raise = (s: EconomyStatus): void => {
    if (ECONOMY_STATUS_SEVERITY[s] > ECONOMY_STATUS_SEVERITY[floor]) floor = s;
  };
  for (const f of failures) {
    if (f.buybackShortfall) raise('EMERGENCY');
    switch (f.scenario) {
      case 'BASE':
      case 'P2P_FREEZE':
        raise('WATCH');
        break;
      case 'HIGH_SURVIVAL':
      case 'BUFF_OVERPOWER':
        raise('WINTER');
        break;
      default:
        break;
    }
  }
  return floor;
}

export function mostSevere(a: EconomyStatus, b: EconomyStatus): EconomyStatus {
  return ECONOMY_STATUS_SEVERITY[a] >= ECONOMY_STATUS_SEVERITY[b] ? a : b;
}

const RECOVERY_STEP: Record<EconomyStatus, EconomyStatus> = {
  EMERGENCY: 'WINTER',
  WINTER: 'WATCH',
  WATCH: 'NORMAL',
  NORMAL: 'NORMAL',
};

export interface StabilityInput {
  current: EconomyStatus;
  recommended: EconomyStatus;
  /** consecutive daily evaluations (including today) recommending `recommended`. */
  consecutiveRecommendedDays: number;
  /** consecutive days the CURRENT status has been EMERGENCY (0 if not). */
  daysInEmergency: number;
}

/**
 * Stability Rule v1.0 (Decision 026):
 * - transitions require 2 consecutive matching evaluations
 * - EMERGENCY escalation is immediate
 * - EMERGENCY has a 3-day minimum lock
 * - recovery is stepwise: EMERGENCY -> WINTER -> WATCH -> NORMAL
 */
export function applyStabilityRule(input: StabilityInput): EconomyStatus {
  const { current, recommended } = input;
  if (recommended === current) return current;

  const escalating = ECONOMY_STATUS_SEVERITY[recommended] > ECONOMY_STATUS_SEVERITY[current];
  if (escalating) {
    if (recommended === 'EMERGENCY' && STABILITY_RULE_V1.emergencyImmediate) return 'EMERGENCY';
    return input.consecutiveRecommendedDays >= STABILITY_RULE_V1.statusConfirmationDays
      ? recommended
      : current;
  }

  // Recovery path.
  if (current === 'EMERGENCY' && input.daysInEmergency < STABILITY_RULE_V1.emergencyMinimumLockDays) {
    return 'EMERGENCY';
  }
  if (input.consecutiveRecommendedDays >= STABILITY_RULE_V1.statusConfirmationDays) {
    return RECOVERY_STEP[current]; // one step at a time, never direct recovery
  }
  return current;
}

export interface EvaluationResult {
  recommended: EconomyStatus;
  final: EconomyStatus;
}

/**
 * Batch Step 33 — Calculate Tomorrow Economy Status and record the daily
 * evaluation (recommended vs threshold-validated final).
 */
export async function evaluateEconomyStatus(
  client: SqlClient,
  input: {
    evaluationDate: string;
    economyPolicyVersion: string;
    metrics: EconomyMetrics;
    stressFailures: readonly { scenario: StressScenario; buybackShortfall: boolean }[];
  },
): Promise<EvaluationResult> {
  const idempotent = await client.query<{ recommended_status: EconomyStatus; final_status: EconomyStatus }>(
    `select recommended_status::text as recommended_status, final_status::text as final_status
     from economy_status_evaluations where evaluation_date = $1`,
    [input.evaluationDate],
  );
  if (idempotent.rows[0]) {
    return { recommended: idempotent.rows[0].recommended_status, final: idempotent.rows[0].final_status };
  }

  const recommended = mostSevere(
    thresholdStatus(input.metrics),
    stressEscalationFloor(input.stressFailures),
  );

  const previous = await client.query<{
    final_status: EconomyStatus;
    recommended_status: EconomyStatus;
    consecutive_match_days: number;
  }>(
    `select final_status::text as final_status, recommended_status::text as recommended_status,
            consecutive_match_days
     from economy_status_evaluations
     where evaluation_date < $1 order by evaluation_date desc limit 1`,
    [input.evaluationDate],
  );
  const prev = previous.rows[0] ?? null;
  const current = prev?.final_status ?? 'NORMAL';
  const consecutive = prev && prev.recommended_status === recommended ? prev.consecutive_match_days + 1 : 1;

  const emergencyStreak = await client.query<{ count: string }>(
    `select count(*)::text as count from economy_status_evaluations
     where final_status = 'EMERGENCY'
       and evaluation_date >= ($1::date - interval '${STABILITY_RULE_V1.emergencyMinimumLockDays} days')
       and evaluation_date < $1`,
    [input.evaluationDate],
  );

  const final = applyStabilityRule({
    current,
    recommended,
    consecutiveRecommendedDays: consecutive,
    daysInEmergency: current === 'EMERGENCY' ? Number(emergencyStreak.rows[0]!.count) : 0,
  });

  await client.query(
    `insert into economy_status_evaluations
       (evaluation_date, economy_policy_version, metrics_json, recommended_status, final_status, consecutive_match_days)
     values ($1, $2, $3, $4::economy_status, $5::economy_status, $6)
     on conflict (evaluation_date) do nothing`,
    [
      input.evaluationDate,
      input.economyPolicyVersion,
      JSON.stringify({ ...input.metrics, stress_failures: input.stressFailures }),
      recommended,
      final,
      consecutive,
    ],
  );
  return { recommended, final };
}

/** Today's effective status (yesterday's final evaluation; NORMAL before day one). */
export async function currentEconomyStatus(
  client: SqlClient,
  asOfDate: string,
): Promise<EconomyStatus> {
  const r = await client.query<{ final_status: EconomyStatus }>(
    `select final_status::text as final_status from economy_status_evaluations
     where evaluation_date < $1 order by evaluation_date desc limit 1`,
    [asOfDate],
  );
  return r.rows[0]?.final_status ?? 'NORMAL';
}
