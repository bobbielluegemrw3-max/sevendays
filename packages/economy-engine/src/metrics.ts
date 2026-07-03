import { Money, addDays } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { RESERVE_ALLOCATION_V1 } from '@sevendays/domain';

/**
 * Economy metrics v1.0 (Decision 058).
 * Every value derives deterministically from ledger, buyback, marketplace,
 * and batch records. No LLM, no sampling, no clocks.
 */

export const COVERAGE_WINDOW_DAYS = 30;
export const MINT_TREND_WINDOW_DAYS = 7;

export interface EconomyMetrics {
  cashCoverageRatio: number;
  buybackCashCoverageRatio: number;
  buybackLiabilityRatio: number;
  forecastedCashCoverage: number;
  p2pMatchRate: number;
  rebuyRate: number;
  gmvChangeRate: number;
  // raw components (audit / report)
  liquidReserves: string;
  buybackReserve: string;
  totalReserves: string;
  scheduledNext30d: string;
  unpaidLiability: string;
  avgDailyMintsLast7d: number;
}

async function reserveBalance(client: SqlClient, accountType: string): Promise<Money> {
  const r = await client.query<{ balance: string }>(
    `select coalesce(b.balance, 0)::text as balance
     from ledger_accounts a
     left join ledger_account_balances b on b.account_id = a.id
     where a.owner_type = 'PLATFORM' and a.account_type = $1::account_type`,
    [accountType],
  );
  return Money.of(r.rows[0]?.balance ?? '0');
}

/** Scheduled (unpaid) buyback payments due in (asOf, asOf + days]. */
async function scheduledPayments(client: SqlClient, asOf: string, days: number): Promise<Money> {
  const r = await client.query<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total
     from buyback_schedule_payments
     where status = 'SCHEDULED' and due_date > $1 and due_date <= $2`,
    [asOf, addDays(asOf, days)],
  );
  return Money.of(r.rows[0]?.total ?? '0');
}

/** ratio helper: a / b with the convention b == 0 -> fully covered (infinity -> large sentinel). */
function ratio(a: Money, b: Money): number {
  if (b.isZero()) return Number.POSITIVE_INFINITY;
  return Number(a.toFixed8()) / Number(b.toFixed8());
}

export async function computeEconomyMetrics(
  client: SqlClient,
  input: { asOfDate: string; batchRunId: string },
): Promise<EconomyMetrics> {
  const buyback = await reserveBalance(client, 'PLATFORM_BUYBACK_RESERVE');
  const mlm = await reserveBalance(client, 'PLATFORM_MLM_RESERVE');
  const emergency = await reserveBalance(client, 'PLATFORM_EMERGENCY_RESERVE');
  const operating = await reserveBalance(client, 'PLATFORM_OPERATING_RESERVE');

  const liquidReserves = buyback.add(mlm).add(emergency);
  const totalReserves = liquidReserves.add(operating);
  const next30d = await scheduledPayments(client, input.asOfDate, COVERAGE_WINDOW_DAYS);

  // Total unpaid liability: every non-PAID scheduled payment.
  const unpaid = await client.query<{ total: string }>(
    `select coalesce(sum(amount), 0)::text as total
     from buyback_schedule_payments where status <> 'PAID'`,
  );
  const unpaidLiability = Money.of(unpaid.rows[0]?.total ?? '0');

  // p2p_match_rate = assigned P2P count / P2P listing count (this batch).
  const match = await client.query<{ assigned: string; listed: string }>(
    `select
       (select count(*) from ownership_assignments
        where batch_run_id = $1 and market_listing_id is not null and status = 'SETTLED')::text as assigned,
       (select count(*) from market_listings where batch_run_id = $1)::text as listed`,
    [input.batchRunId],
  );
  const listedCount = Number(match.rows[0]!.listed);
  const p2pMatchRate = listedCount === 0 ? 1 : Number(match.rows[0]!.assigned) / listedCount;

  // rebuy_rate = burned owners who repurchased within 24h / burned owners
  // (measured over burns finalized in the last 24h before asOf).
  const rebuy = await client.query<{ burned_owners: string; rebuyers: string }>(
    `with recent_burns as (
       select distinct owner_user_id_at_snapshot as user_id, min(created_at) as burned_at
       from horse_burns
       where created_at >= ($1::date - interval '1 day')
       group by owner_user_id_at_snapshot
     )
     select
       (select count(*) from recent_burns)::text as burned_owners,
       (select count(*) from recent_burns rb
        where exists (
          select 1 from purchase_sessions ps
          where ps.user_id = rb.user_id
            and ps.created_at >= rb.burned_at
            and ps.created_at <= rb.burned_at + interval '24 hours'
        ))::text as rebuyers`,
    [input.asOfDate],
  );
  const burnedOwners = Number(rebuy.rows[0]!.burned_owners);
  const rebuyRate = burnedOwners === 0 ? 1 : Number(rebuy.rows[0]!.rebuyers) / burnedOwners;

  // gmv_change_rate = (today - yesterday) / yesterday over settled assignment prices.
  const gmv = await client.query<{ today: string; yesterday: string }>(
    `select
       coalesce((select sum(a.assigned_price) from ownership_assignments a
         join batch_runs b on b.id = a.batch_run_id
         where b.batch_date = $1 and a.status = 'SETTLED'), 0)::text as today,
       coalesce((select sum(a.assigned_price) from ownership_assignments a
         join batch_runs b on b.id = a.batch_run_id
         where b.batch_date = ($1::date - interval '1 day') and a.status = 'SETTLED'), 0)::text as yesterday`,
    [input.asOfDate],
  );
  const gmvYesterday = Money.of(gmv.rows[0]!.yesterday);
  const gmvChangeRate = gmvYesterday.isZero()
    ? 0
    : (Number(gmv.rows[0]!.today) - Number(gmv.rows[0]!.yesterday)) / Number(gmv.rows[0]!.yesterday);

  // avg Day0 mints over the last 7 batch days (deterministic projection input).
  const mints = await client.query<{ count: string }>(
    `select count(*)::text as count
     from ownership_assignments a
     join batch_runs b on b.id = a.batch_run_id
     where a.market_listing_id is null and a.status = 'SETTLED'
       and b.batch_date > ($1::date - interval '${MINT_TREND_WINDOW_DAYS} days')
       and b.batch_date <= $1`,
    [input.asOfDate],
  );
  const avgDailyMints = Number(mints.rows[0]!.count) / MINT_TREND_WINDOW_DAYS;

  // forecasted_cash_coverage (Decision 058): deterministic 30-day projection.
  const projectedInflow = Money.zero()
    .add(Money.of(RESERVE_ALLOCATION_V1.PLATFORM_BUYBACK_RESERVE).mulFloor(String(avgDailyMints * 30)))
    .add(Money.of(RESERVE_ALLOCATION_V1.PLATFORM_MLM_RESERVE).mulFloor(String(avgDailyMints * 30)))
    .add(Money.of(RESERVE_ALLOCATION_V1.PLATFORM_EMERGENCY_RESERVE).mulFloor(String(avgDailyMints * 30)));
  // projected MLM outflow: burns last 30d scaled to next 30d, 10 USDT each (conservative: every burn pays).
  const burns30 = await client.query<{ count: string }>(
    `select count(*)::text as count from horse_burns
     where created_at > ($1::date - interval '30 days')`,
    [input.asOfDate],
  );
  const projectedMlmOut = Money.of('10.00').mulFloor(burns30.rows[0]!.count);
  const projectedLiquidAfter30 = liquidReserves.add(projectedInflow).sub(projectedMlmOut);

  // projected payments: scheduled next 30d + new liability from projected clears.
  // Projected new clears use the observed day7 arrival trend over mints.
  const clears30 = await client.query<{ count: string }>(
    `select count(*)::text as count from buyback_schedules
     where created_at > ($1::date - interval '30 days')`,
    [input.asOfDate],
  );
  const arrivalPerDay = Number(clears30.rows[0]!.count) / 30;
  // New clears within the window generate payments partially inside it;
  // a clear on day d contributes min(30 - d, 7)/7 * 200 inside the window.
  let projectedNewPayments = Money.zero();
  for (let d = 1; d <= 30; d += 1) {
    const fraction = Math.min(30 - d, 7) / 7;
    if (fraction <= 0) continue;
    projectedNewPayments = projectedNewPayments.add(
      Money.of('200.00').mulFloor(String(arrivalPerDay * fraction)),
    );
  }
  const projectedPayments = next30d.add(projectedNewPayments);

  const forecastNumerator = projectedLiquidAfter30.isNegative()
    ? Money.zero()
    : projectedLiquidAfter30;

  return {
    cashCoverageRatio: ratio(liquidReserves, next30d),
    buybackCashCoverageRatio: ratio(buyback, next30d),
    buybackLiabilityRatio: totalReserves.isZero()
      ? Number.POSITIVE_INFINITY
      : Number(unpaidLiability.toFixed8()) / Number(totalReserves.toFixed8()),
    forecastedCashCoverage: ratio(forecastNumerator, projectedPayments),
    p2pMatchRate,
    rebuyRate,
    gmvChangeRate,
    liquidReserves: liquidReserves.toFixed8(),
    buybackReserve: buyback.toFixed8(),
    totalReserves: totalReserves.toFixed8(),
    scheduledNext30d: next30d.toFixed8(),
    unpaidLiability: unpaidLiability.toFixed8(),
    avgDailyMintsLast7d: avgDailyMints,
  };
}
