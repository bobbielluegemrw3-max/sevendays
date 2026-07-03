import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { MINT_COVERAGE_FACTOR_V1 } from '@sevendays/domain';

/**
 * Mint coverage gate (Decision 069): Day0 minting is allowed only while
 * the buyback reserve covers the stop-scenario liability — what the pool
 * would owe if demand stopped TODAY and every in-flight horse arrived at
 * its expected rate (NORMAL burn, 5% safety margin; the margin absorbs the
 * empirically measured excess arrivals from floor rounding and revenge
 * buffs). Deterministic: fixed factor table x 200, plus already-scheduled
 * unpaid payments.
 *
 * The gate is binary by design: when coverage ever slips below 1.0 the
 * next batch mints ZERO until fee inflow and burns restore it. Player-
 * facing terms are untouched — at worst a buyer falls through to refund
 * (Step 27), exactly like any day the mint limit is reached.
 */

export interface CoverageGateResult {
  reserve: string;
  stopLiability: string;
  covered: boolean;
}

export async function evaluateMintCoverageGate(client: SqlClient): Promise<CoverageGateResult> {
  const liabilityCase = MINT_COVERAGE_FACTOR_V1.map(
    (factor, racesLeft) => `when ${racesLeft} then ${Money.of('200').mulFloor(factor).toFixed8()}`,
  ).join(' ');

  const r = await client.query<{ reserve: string; pipeline: string; scheduled: string }>(
    `select
       coalesce((select b.balance from ledger_account_balances b
                 join ledger_accounts a on a.id = b.account_id
                 where a.account_type = 'PLATFORM_BUYBACK_RESERVE'), 0)::text as reserve,
       coalesce((select sum(case greatest(0, least(7, 7 - current_day)) ${liabilityCase} else 0 end)
                 from horses where status = 'ACTIVE'), 0)::numeric(20,8)::text as pipeline,
       coalesce((select sum(amount) from buyback_schedule_payments where status = 'SCHEDULED'), 0)::text as scheduled`,
  );
  const row = r.rows[0]!;
  const reserve = Money.of(row.reserve);
  const stopLiability = Money.of(row.pipeline).add(Money.of(row.scheduled));
  return {
    reserve: reserve.toFixed8(),
    stopLiability: stopLiability.toFixed8(),
    covered: reserve.gte(stopLiability),
  };
}
