import type { SqlClient } from '@sevendays/shared';
import type { EconomyMetrics, ScenarioResult, StressBaseInputs } from '@sevendays/economy-engine';
import { STRESS_HORIZON_DAYS } from '@sevendays/economy-engine';

/**
 * Batch Steps 31-32 — Liquidity Report and daily Stress Tests.
 */

export async function createLiquidityReport(
  client: SqlClient,
  input: { batchRunId: string; reportDate: string; metrics: EconomyMetrics },
): Promise<void> {
  await client.query(
    `insert into liquidity_reports (batch_run_id, report_date, metrics_json)
     values ($1, $2, $3)
     on conflict (batch_run_id) do nothing`,
    [input.batchRunId, input.reportDate, JSON.stringify(input.metrics)],
  );
}

export async function saveStressResults(
  client: SqlClient,
  batchRunId: string,
  results: readonly ScenarioResult[],
): Promise<void> {
  for (const result of results) {
    await client.query(
      `insert into stress_test_results (batch_run_id, scenario, passed, detail_json)
       values ($1, $2, $3, $4)
       on conflict (batch_run_id, scenario) do nothing`,
      [batchRunId, result.scenario, result.passed, JSON.stringify(result)],
    );
  }
}

/** Gather the deterministic simulation inputs from live records (Decision 059). */
export async function buildStressBaseInputs(
  client: SqlClient,
  asOfDate: string,
): Promise<StressBaseInputs> {
  const reserves = await client.query<{ account_type: string; balance: string }>(
    `select a.account_type::text as account_type, coalesce(b.balance, 0)::text as balance
     from ledger_accounts a
     left join ledger_account_balances b on b.account_id = a.id
     where a.owner_type = 'PLATFORM'`,
  );
  const byType = new Map(reserves.rows.map((r) => [r.account_type, Number(r.balance)]));

  const scheduled = await client.query<{ offset_days: number; total: string }>(
    `select (due_date - $1::date)::int as offset_days, sum(amount)::text as total
     from buyback_schedule_payments
     where status = 'SCHEDULED' and due_date > $1
       and due_date <= ($1::date + interval '${STRESS_HORIZON_DAYS + 8} days')
     group by due_date order by due_date`,
    [asOfDate],
  );
  const scheduledByDay = new Array<number>(STRESS_HORIZON_DAYS + 9).fill(0);
  for (const row of scheduled.rows) {
    if (row.offset_days >= 0 && row.offset_days < scheduledByDay.length) {
      scheduledByDay[row.offset_days] = Number(row.total);
    }
  }

  const trends = await client.query<{ mints7: string; clears30: string; mints30: string; burns30: string; buffs7: string }>(
    `select
       (select count(*) from ownership_assignments a join batch_runs b on b.id = a.batch_run_id
        where a.market_listing_id is null and a.status = 'SETTLED'
          and b.batch_date > ($1::date - interval '7 days') and b.batch_date <= $1)::text as mints7,
       (select count(*) from buyback_schedules
        where created_at > ($1::date - interval '30 days'))::text as clears30,
       (select count(*) from ownership_assignments a join batch_runs b on b.id = a.batch_run_id
        where a.market_listing_id is null and a.status = 'SETTLED'
          and b.batch_date > ($1::date - interval '30 days') and b.batch_date <= $1)::text as mints30,
       (select count(*) from horse_burns where created_at > ($1::date - interval '30 days'))::text as burns30,
       (select count(*) from revenge_buffs
        where consumed_at > ($1::date - interval '7 days'))::text as buffs7`,
    [asOfDate],
  );
  const t = trends.rows[0]!;
  const mints30 = Number(t.mints30);
  const day7ArrivalRate = mints30 > 0 ? Math.min(1, Number(t.clears30) / mints30) : 0.468; // model target fallback

  const userBalances = await client.query<{ total: string }>(
    `select coalesce(sum(b.balance), 0)::text as total
     from ledger_accounts a join ledger_account_balances b on b.account_id = a.id
     where a.owner_type = 'USER' and a.account_type = 'USER_AVAILABLE'`,
  );

  return {
    buybackReserve: byType.get('PLATFORM_BUYBACK_RESERVE') ?? 0,
    mlmReserve: byType.get('PLATFORM_MLM_RESERVE') ?? 0,
    emergencyReserve: byType.get('PLATFORM_EMERGENCY_RESERVE') ?? 0,
    scheduledByDay,
    avgDailyMints: Number(t.mints7) / 7,
    day7ArrivalRate,
    avgDailyBurns: Number(t.burns30) / 30,
    avgDailyBuffConsumptions: Number(t.buffs7) / 7,
    withdrawableUserBalance: Number(userBalances.rows[0]!.total),
  };
}
