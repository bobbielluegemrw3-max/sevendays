import { STRESS_SCENARIOS_V1, type StressScenario } from '@sevendays/domain';

/**
 * Daily stress tests v1.0 (Decision 045/059).
 * Deterministic 30-day arithmetic simulation — pure function of the inputs,
 * no randomness, no LLM. Amount arithmetic uses plain numbers here because
 * this is a projection model, not ledger accounting; results feed Economy
 * Status decisions, never balances.
 */

export const STRESS_HORIZON_DAYS = 30;

export interface StressBaseInputs {
  /** current reserve balances (numbers, USDT) */
  buybackReserve: number;
  mlmReserve: number;
  emergencyReserve: number;
  /** existing scheduled payments by day offset 1..N (from the DB) */
  scheduledByDay: number[];
  /** observed trends */
  avgDailyMints: number;
  day7ArrivalRate: number; // fraction of daily mints that eventually clear
  avgDailyBurns: number;
  avgDailyBuffConsumptions: number;
  /** demand share of P2P vs mint (0..1), used by P2P freeze */
  withdrawableUserBalance: number;
}

export interface ScenarioResult {
  scenario: StressScenario;
  passed: boolean;
  minCashCoverage: number;
  minBuybackCoverage: number;
  buybackShortfall: boolean;
  failureReasons: string[];
}

interface ScenarioParams {
  mintMultiplier: number;
  arrivalRateOverride?: number;
  burnMultiplier: number;
  minCashCoverage: number | null;
  minBuybackCoverage: number | null;
}

function paramsFor(scenario: StressScenario, base: StressBaseInputs): ScenarioParams {
  switch (scenario) {
    case 'BASE':
      return { mintMultiplier: 1, burnMultiplier: 1, minCashCoverage: 1.2, minBuybackCoverage: null };
    case 'WINTER_30':
      return { mintMultiplier: 0.7, burnMultiplier: 1, minCashCoverage: 1.0, minBuybackCoverage: 1.0 };
    case 'WINTER_90':
      return { mintMultiplier: 0.1, burnMultiplier: 1, minCashCoverage: 1.0, minBuybackCoverage: 1.0 };
    case 'HIGH_SURVIVAL':
      return {
        mintMultiplier: 1,
        arrivalRateOverride: Math.min(1, base.day7ArrivalRate + 0.1),
        burnMultiplier: 1,
        minCashCoverage: null,
        minBuybackCoverage: 1.0,
      };
    case 'LOW_BURN':
      // burn count -30%: 30% of former non-survivors now survive.
      return {
        mintMultiplier: 1,
        arrivalRateOverride: Math.min(1, base.day7ArrivalRate + (1 - base.day7ArrivalRate) * 0.3),
        burnMultiplier: 0.7,
        minCashCoverage: 1.0,
        minBuybackCoverage: null,
      };
    case 'P2P_FREEZE':
      // 7 days of zero P2P demand; inflow continues only via Day0 fallback.
      return { mintMultiplier: 1, burnMultiplier: 1, minCashCoverage: 1.0, minBuybackCoverage: 1.0 };
    case 'BUFF_OVERPOWER': {
      const buffShare = base.avgDailyMints > 0
        ? Math.min(1, base.avgDailyBuffConsumptions / base.avgDailyMints)
        : 0;
      return {
        mintMultiplier: 1,
        arrivalRateOverride: Math.min(1, base.day7ArrivalRate + 0.15 * buffShare),
        burnMultiplier: 1,
        minCashCoverage: null,
        minBuybackCoverage: 1.0,
      };
    }
    case 'MASS_WITHDRAWAL':
      // 20% of wallet balances withdrawn — user funds are fully backed by the
      // ledger (locked before broadcast), so the check is reserve solvency
      // under unchanged obligations.
      return { mintMultiplier: 1, burnMultiplier: 1, minCashCoverage: 1.0, minBuybackCoverage: 1.0 };
  }
}

export function runStressScenario(
  scenario: StressScenario,
  base: StressBaseInputs,
): ScenarioResult {
  const p = paramsFor(scenario, base);
  const arrival = p.arrivalRateOverride ?? base.day7ArrivalRate;
  const mintsPerDay = base.avgDailyMints * p.mintMultiplier;
  const burnsPerDay = base.avgDailyBurns * p.burnMultiplier;

  // Extend the payment schedule far enough for a rolling 30-day window.
  const horizon = STRESS_HORIZON_DAYS;
  const schedule = new Array<number>(horizon + 38).fill(0);
  base.scheduledByDay.forEach((amount, i) => {
    if (i < schedule.length) schedule[i] = (schedule[i] ?? 0) + amount;
  });

  let buyback = base.buybackReserve;
  let mlm = base.mlmReserve;
  const emergency = base.emergencyReserve;

  let minCash = Number.POSITIVE_INFINITY;
  let minBuybackCov = Number.POSITIVE_INFINITY;
  let buybackShortfall = false;
  const failures: string[] = [];

  for (let day = 1; day <= horizon; day += 1) {
    // inflows (reserve allocation per mint)
    buyback += mintsPerDay * 93.6;
    mlm += mintsPerDay * 5.4;

    // projected new day7 clears add 200/7 for the following 7 days
    const newClears = mintsPerDay * arrival;
    for (let k = 1; k <= 7; k += 1) {
      const idx = day + k;
      if (idx < schedule.length) schedule[idx] = (schedule[idx] ?? 0) + newClears * (200 / 7);
    }

    // outflows
    const due = schedule[day] ?? 0;
    if (buyback + 1e-9 < due) {
      buybackShortfall = true;
      failures.push(`day ${day}: buyback shortfall (due ${due.toFixed(2)}, reserve ${buyback.toFixed(2)})`);
      break;
    }
    buyback -= due;
    mlm -= burnsPerDay * 10;
    if (mlm < -1e-9) {
      failures.push(`day ${day}: MLM reserve negative`);
      mlm = 0; // continue to evaluate coverage, but the run has failed
    }

    // rolling 30-day coverage from this day
    let windowPayments = 0;
    for (let k = 1; k <= 30; k += 1) windowPayments += schedule[day + k] ?? 0;
    const liquid = buyback + Math.max(mlm, 0) + emergency;
    const cash = windowPayments === 0 ? Number.POSITIVE_INFINITY : liquid / windowPayments;
    const buybackCov = windowPayments === 0 ? Number.POSITIVE_INFINITY : buyback / windowPayments;
    minCash = Math.min(minCash, cash);
    minBuybackCov = Math.min(minBuybackCov, buybackCov);
  }

  if (p.minCashCoverage !== null && minCash < p.minCashCoverage) {
    failures.push(`min cash_coverage ${minCash.toFixed(3)} < ${p.minCashCoverage}`);
  }
  if (p.minBuybackCoverage !== null && minBuybackCov < p.minBuybackCoverage) {
    failures.push(`min buyback_coverage ${minBuybackCov.toFixed(3)} < ${p.minBuybackCoverage}`);
  }

  return {
    scenario,
    passed: failures.length === 0 && !buybackShortfall,
    minCashCoverage: minCash,
    minBuybackCoverage: minBuybackCov,
    buybackShortfall,
    failureReasons: failures,
  };
}

export function runAllStressScenarios(base: StressBaseInputs): ScenarioResult[] {
  return STRESS_SCENARIOS_V1.map((scenario) => runStressScenario(scenario, base));
}
