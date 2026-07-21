import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import {
  computeEconomyMetrics,
  thresholdStatus,
  stressEscalationFloor,
  applyStabilityRule,
  evaluateEconomyStatus,
  currentEconomyStatus,
  selectProfitTakingListings,
  runStressScenario,
  runAllStressScenarios,
  type EconomyMetrics,
  type StressBaseInputs,
} from '../src/index.js';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

function metrics(overrides: Partial<EconomyMetrics> = {}): EconomyMetrics {
  return {
    cashCoverageRatio: 3,
    buybackCashCoverageRatio: 3,
    buybackLiabilityRatio: 0.2,
    forecastedCashCoverage: 3,
    p2pMatchRate: 0.9,
    rebuyRate: 0.5,
    gmvChangeRate: 0,
    liquidReserves: '0',
    buybackReserve: '0',
    totalReserves: '0',
    scheduledNext30d: '0',
    unpaidLiability: '0',
    avgDailyMintsLast7d: 0,
    ...overrides,
  };
}

describe('threshold status (04_ECONOMY_ENGINE.md v1.0)', () => {
  it('maps metric bands to statuses, most severe wins', () => {
    expect(thresholdStatus(metrics())).toBe('NORMAL');
    expect(thresholdStatus(metrics({ cashCoverageRatio: 1.9 }))).toBe('WATCH');
    expect(thresholdStatus(metrics({ p2pMatchRate: 0.7 }))).toBe('WATCH');
    expect(thresholdStatus(metrics({ rebuyRate: 0.2 }))).toBe('WATCH');
    expect(thresholdStatus(metrics({ cashCoverageRatio: 1.4 }))).toBe('WINTER');
    expect(thresholdStatus(metrics({ forecastedCashCoverage: 1.3 }))).toBe('WINTER');
    expect(thresholdStatus(metrics({ cashCoverageRatio: 1.1 }))).toBe('EMERGENCY');
    expect(thresholdStatus(metrics({ forecastedCashCoverage: 1.0 }))).toBe('EMERGENCY');
    expect(thresholdStatus(metrics({ buybackCashCoverageRatio: 0.9 }))).toBe('EMERGENCY');
  });

  it('stress failures escalate the floor (Decision 059)', () => {
    expect(stressEscalationFloor([])).toBe('NORMAL');
    expect(stressEscalationFloor([{ scenario: 'BASE', buybackShortfall: false }])).toBe('WATCH');
    expect(stressEscalationFloor([{ scenario: 'HIGH_SURVIVAL', buybackShortfall: false }])).toBe('WINTER');
    expect(stressEscalationFloor([{ scenario: 'BUFF_OVERPOWER', buybackShortfall: false }])).toBe('WINTER');
    expect(stressEscalationFloor([{ scenario: 'P2P_FREEZE', buybackShortfall: false }])).toBe('WATCH');
    // any shortfall -> EMERGENCY
    expect(stressEscalationFloor([{ scenario: 'BASE', buybackShortfall: true }])).toBe('EMERGENCY');
  });
});

describe('stability rule (Decision 026)', () => {
  it('EMERGENCY escalation is immediate; other escalations need 2 days', () => {
    expect(
      applyStabilityRule({ current: 'NORMAL', recommended: 'EMERGENCY', consecutiveRecommendedDays: 1, daysInEmergency: 0 }),
    ).toBe('EMERGENCY');
    expect(
      applyStabilityRule({ current: 'NORMAL', recommended: 'WATCH', consecutiveRecommendedDays: 1, daysInEmergency: 0 }),
    ).toBe('NORMAL');
    expect(
      applyStabilityRule({ current: 'NORMAL', recommended: 'WATCH', consecutiveRecommendedDays: 2, daysInEmergency: 0 }),
    ).toBe('WATCH');
  });

  it('EMERGENCY locks for 3 days, then recovery is stepwise only', () => {
    expect(
      applyStabilityRule({ current: 'EMERGENCY', recommended: 'NORMAL', consecutiveRecommendedDays: 5, daysInEmergency: 2 }),
    ).toBe('EMERGENCY'); // still locked
    expect(
      applyStabilityRule({ current: 'EMERGENCY', recommended: 'NORMAL', consecutiveRecommendedDays: 2, daysInEmergency: 3 }),
    ).toBe('WINTER'); // one step, never direct
    expect(
      applyStabilityRule({ current: 'WINTER', recommended: 'NORMAL', consecutiveRecommendedDays: 2, daysInEmergency: 0 }),
    ).toBe('WATCH'); // stepwise recovery
  });
});

describe('daily evaluation sequence (Steps 33-34)', () => {
  it('walks NORMAL -> WATCH -> EMERGENCY -> lock -> stepwise recovery', async () => {
    const watch = metrics({ cashCoverageRatio: 1.9 });
    const emergency = metrics({ cashCoverageRatio: 1.0 });
    const normal = metrics();

    // day 1: WATCH recommended, needs 2 days -> stays NORMAL
    const d1 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-01', economyPolicyVersion: 'economy_policy_v1.0', metrics: watch, stressFailures: [],
    });
    expect(d1).toEqual({ recommended: 'WATCH', final: 'NORMAL' });

    // day 2: WATCH confirmed
    const d2 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-02', economyPolicyVersion: 'economy_policy_v1.0', metrics: watch, stressFailures: [],
    });
    expect(d2.final).toBe('WATCH');

    // day 3: EMERGENCY is immediate
    const d3 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-03', economyPolicyVersion: 'economy_policy_v1.0', metrics: emergency, stressFailures: [],
    });
    expect(d3.final).toBe('EMERGENCY');

    // days 4-5: healthy again but locked (minimum 3 days in EMERGENCY)
    const d4 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-04', economyPolicyVersion: 'economy_policy_v1.0', metrics: normal, stressFailures: [],
    });
    expect(d4.final).toBe('EMERGENCY');
    const d5 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-05', economyPolicyVersion: 'economy_policy_v1.0', metrics: normal, stressFailures: [],
    });
    expect(d5.final).toBe('EMERGENCY');

    // day 6: lock satisfied -> stepwise to WINTER (never direct to NORMAL)
    const d6 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-06', economyPolicyVersion: 'economy_policy_v1.0', metrics: normal, stressFailures: [],
    });
    expect(d6.final).toBe('WINTER');

    // day 7 -> WATCH, day 8 -> NORMAL
    const d7 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-07', economyPolicyVersion: 'economy_policy_v1.0', metrics: normal, stressFailures: [],
    });
    expect(d7.final).toBe('WATCH');
    const d8 = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-08', economyPolicyVersion: 'economy_policy_v1.0', metrics: normal, stressFailures: [],
    });
    expect(d8.final).toBe('NORMAL');

    // evaluations are immutable and idempotent
    const replay = await evaluateEconomyStatus(client, {
      evaluationDate: '2036-01-03', economyPolicyVersion: 'economy_policy_v1.0', metrics: normal, stressFailures: [],
    });
    expect(replay.final).toBe('EMERGENCY'); // original result, not recomputed

    // the effective status for the next batch day is the last final
    expect(await currentEconomyStatus(client, '2036-01-09')).toBe('NORMAL');
    expect(await currentEconomyStatus(client, '2036-01-04')).toBe('EMERGENCY');
  });
});

describe('profit taking selection (Decisions 015-017)', () => {
  async function seedHorses(
    owners: string[],
    countPerOwner: number,
    startDay = 1,
  ): Promise<void> {
    for (const owner of owners) {
      for (let i = 0; i < countPerOwner; i += 1) {
        await client.query(
          `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                               horse_generation_version, mint_seed_hash, ability_json)
           values ($1, $2, $3, 'BALANCED', 'COMMON', $4, 0, 'v1', $5, '{}')`,
          [
            owner,
            ((startDay + i - 1) % 6) + 1,
            `PT ${randomUUID().slice(0, 16)}`,
            randomUUID().replaceAll('-', ''),
            randomUUID().replaceAll('-', ''),
          ],
        );
      }
    }
  }

  async function newUser(autoList = true): Promise<string> {
    const r = await client.query<{ id: string }>(
      `insert into users (email) values ($1) returning id`,
      [`${randomUUID()}@test.dev`],
    );
    // Decision 086: Smart出品はauto_list=trueの明示的選択が前提
    await client.query(
      `insert into user_trade_settings (user_id, auto_list) values ($1, $2)`,
      [r.rows[0]!.id, autoList],
    );
    return r.rows[0]!.id;
  }

  it('only horses of auto_list=true owners are eligible (Decision 086)', async () => {
    await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
    const optedIn = await newUser(true);
    const optedOut = await newUser(false);
    // 未選択(設定行なし)ユーザー
    const unchosen = await client.query<{ id: string }>(
      `insert into users (email) values ($1) returning id`,
      [`${randomUUID()}@test.dev`],
    );
    await seedHorses([optedIn, optedOut, unchosen.rows[0]!.id], 4);

    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ('2036-02-03', 'batch_v1.0') returning id`,
    );
    const result = await selectProfitTakingListings(client, {
      batchRunId: batch.rows[0]!.id,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      assignmentAlgorithmVersion: 'assignment_algorithm_v1.0',
    });
    // 母集団はオプトインの4頭のみ。OFFと未選択の馬は決して選ばれない
    expect(result.eligibleCount).toBe(4);
    for (const s of result.selected) {
      expect(s.ownerUserId).toBe(optedIn);
    }
  });

  it('floor(eligible * rate), owner limit 1 then single relaxation to 2, never 3', async () => {
    // isolate: retire anything eligible from other suites
    await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
    const ownerA = await newUser();
    const ownerB = await newUser();
    await seedHorses([ownerA, ownerB], 8); // 16 eligible, 2 owners

    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ('2036-02-01', 'batch_v1.0') returning id`,
    );

    // NORMAL 30%: floor(16 * 0.30) = 4 — needs the relaxation pass (2 owners)
    const result = await selectProfitTakingListings(client, {
      batchRunId: batch.rows[0]!.id,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      assignmentAlgorithmVersion: 'assignment_algorithm_v1.0',
    });
    expect(result.eligibleCount).toBe(16);
    expect(result.targetCount).toBe(4);
    expect(result.selected).toHaveLength(4);
    expect(result.relaxationUsed).toBe(true);
    // absolute limit 2 per owner — pass 3 forbidden
    const perOwner = new Map<string, number>();
    for (const s of result.selected) {
      perOwner.set(s.ownerUserId, (perOwner.get(s.ownerUserId) ?? 0) + 1);
    }
    expect([...perOwner.values()].every((n) => n <= 2)).toBe(true);

    // sort: highest current_day first (never-listed first among equals)
    const days = result.selected.map((s) => s.currentDay);
    expect([...days].sort((a, b) => b - a)).toEqual(days);

    // determinism
    const again = await selectProfitTakingListings(client, {
      batchRunId: batch.rows[0]!.id,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      assignmentAlgorithmVersion: 'assignment_algorithm_v1.0',
    });
    expect(again.selected.map((s) => s.horseId)).toEqual(result.selected.map((s) => s.horseId));

    // EMERGENCY: rate 0 -> nothing listed
    const emergency = await selectProfitTakingListings(client, {
      batchRunId: batch.rows[0]!.id,
      economyStatus: 'EMERGENCY',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      assignmentAlgorithmVersion: 'assignment_algorithm_v1.0',
    });
    expect(emergency.targetCount).toBe(0);
    expect(emergency.selected).toHaveLength(0);
  });

  it('施策F: target is capped at ownerCount * 2 (supply ceiling), not eligible*rate', async () => {
    // isolate
    await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
    const owner = await newUser();
    await seedHorses([owner], 10); // 10 eligible, 1 owner

    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ('2036-02-05', 'batch_v1.0') returning id`,
    );
    const result = await selectProfitTakingListings(client, {
      batchRunId: batch.rows[0]!.id,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      assignmentAlgorithmVersion: 'assignment_algorithm_v1.0',
    });
    // 旧式: floor(10 * 0.30) = 3。新式: min(3, 1 owner × 2) = 2。
    // 律速はオーナー上限であり、供給不可能な3は目標にしない。
    expect(result.eligibleCount).toBe(10);
    expect(result.targetCount).toBe(2);
    expect(result.selected).toHaveLength(2);
  });
});

describe('economy metrics (Decision 058)', () => {
  it('computes deterministic metrics from live records', async () => {
    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ('2036-03-01', 'batch_v1.0') returning id`,
    );
    // empty platform: no obligations -> full coverage, zero liability
    const empty = await computeEconomyMetrics(client, {
      asOfDate: '2036-03-01',
      batchRunId: batch.rows[0]!.id,
    });
    expect(empty.cashCoverageRatio).toBe(Number.POSITIVE_INFINITY);
    expect(empty.unpaidLiability).toBe('0.00000000');
    expect(empty.p2pMatchRate).toBe(1); // no listings -> perfect match by convention
    expect(empty.rebuyRate).toBe(1); // no burned owners in window
    expect(empty.gmvChangeRate).toBe(0);

    // add one unpaid buyback schedule inside the 30-day window
    const user = await client.query<{ id: string }>(
      `insert into users (email) values ($1) returning id`,
      [`${randomUUID()}@test.dev`],
    );
    const horse = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, status, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, 7, 'DAY7_CLEARED', $2, 'BALANCED', 'COMMON', $3, 0, 'v1', $4, '{}') returning id`,
      [user.rows[0]!.id, `Metric ${randomUUID().slice(0, 14)}`, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')],
    );
    const schedule = await client.query<{ id: string }>(
      `insert into buyback_schedules (horse_id, user_id, total_amount, payment_count, day7_clear_date)
       values ($1, $2, 200, 7, '2036-03-01') returning id`,
      [horse.rows[0]!.id, user.rows[0]!.id],
    );
    for (let n = 1; n <= 7; n += 1) {
      await client.query(
        `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
         values ($1, $2, ('2036-03-01'::date + $3 * interval '1 day')::date, $4)`,
        [schedule.rows[0]!.id, n, n, n < 7 ? '28.57142857' : '28.57142858'],
      );
    }

    const withDebt = await computeEconomyMetrics(client, {
      asOfDate: '2036-03-01',
      batchRunId: batch.rows[0]!.id,
    });
    expect(withDebt.scheduledNext30d).toBe('200.00000000'); // all 7 due within 30 days
    expect(withDebt.unpaidLiability).toBe('200.00000000');
    // reserves are empty in this suite -> zero coverage against 200 due
    expect(withDebt.cashCoverageRatio).toBe(0);
    expect(withDebt.buybackCashCoverageRatio).toBe(0);
  });
});

describe('stress scenarios (Decision 059)', () => {
  // Balanced economy: MLM inflow (50 x 5.40 = 270/day) covers MLM outflow
  // (20 burns x 10 = 200/day); buyback inflow 4,680/day covers obligations.
  const healthy: StressBaseInputs = {
    buybackReserve: 50_000,
    mlmReserve: 8_000, // buffer covers a 30-day mint winter with unchanged burn outflow
    emergencyReserve: 200,
    scheduledByDay: Array.from({ length: 39 }, () => 100), // modest existing obligations
    avgDailyMints: 50, // 50 x 93.60 = 4,680/day inflow
    day7ArrivalRate: 0.468,
    avgDailyBurns: 20,
    avgDailyBuffConsumptions: 10,
    withdrawableUserBalance: 100_000,
  };

  it('a healthy platform passes all scenarios; results are deterministic', () => {
    const results = runAllStressScenarios(healthy);
    expect(results).toHaveLength(8);
    for (const r of results) {
      expect(r.passed, `${r.scenario}: ${r.failureReasons.join('; ')}`).toBe(true);
    }
    expect(runAllStressScenarios(healthy)).toEqual(results);
  });

  it('an over-leveraged platform fails with a buyback shortfall', () => {
    const broke: StressBaseInputs = {
      ...healthy,
      buybackReserve: 500,
      mlmReserve: 50,
      scheduledByDay: Array.from({ length: 39 }, () => 2_000), // 2,000/day due vs tiny reserve
      avgDailyMints: 1,
    };
    const base = runStressScenario('BASE', broke);
    expect(base.passed).toBe(false);
    expect(base.buybackShortfall).toBe(true);
  });

  it('HIGH_SURVIVAL is strictly harsher on buyback coverage than BASE', () => {
    const tight: StressBaseInputs = { ...healthy, buybackReserve: 12_000, avgDailyMints: 30 };
    const base = runStressScenario('BASE', tight);
    const high = runStressScenario('HIGH_SURVIVAL', tight);
    expect(high.minBuybackCoverage).toBeLessThan(base.minBuybackCoverage);
  });

  it('WINTER_90 is harsher than WINTER_30 when heavy existing obligations must be honored', () => {
    // The danger of a mint winter is EXISTING liabilities with dried-up
    // inflow — model that: 2,500/day already scheduled, modest reserve.
    const obligated: StressBaseInputs = {
      ...healthy,
      buybackReserve: 30_000,
      scheduledByDay: Array.from({ length: 39 }, () => 2_500),
    };
    const w30 = runStressScenario('WINTER_30', obligated);
    const w90 = runStressScenario('WINTER_90', obligated);
    expect(w90.minCashCoverage).toBeLessThan(w30.minCashCoverage);
  });
});
