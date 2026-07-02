import { Money } from '@sevendays/shared';
import type { SqlClient } from './types.js';

/**
 * Settlement Verification (batch step 29) and ongoing ledger integrity checks.
 * Everything here derives from ledger_entries — the single source of truth —
 * independently of the balance cache.
 */

export interface ReconciliationIssue {
  check: string;
  detail: string;
}

export interface ReconciliationReport {
  ok: boolean;
  issues: ReconciliationIssue[];
}

export async function reconcile(client: SqlClient): Promise<ReconciliationReport> {
  const issues: ReconciliationIssue[] = [];

  // 1. Every posted transaction balances (independent re-check of DB trigger).
  const unbalanced = await client.query<{ transaction_id: string; diff: string }>(
    `select transaction_id,
            (coalesce(sum(amount) filter (where direction = 'DEBIT'), 0)
           - coalesce(sum(amount) filter (where direction = 'CREDIT'), 0))::text as diff
     from ledger_entries
     group by transaction_id
     having coalesce(sum(amount) filter (where direction = 'DEBIT'), 0)
         <> coalesce(sum(amount) filter (where direction = 'CREDIT'), 0)`,
  );
  for (const row of unbalanced.rows) {
    issues.push({
      check: 'TRANSACTION_BALANCED',
      detail: `transaction ${row.transaction_id} unbalanced by ${row.diff}`,
    });
  }

  // 2. Settlement clearing must be zero (05_SETTLEMENT_ENGINE.md).
  const clearing = await client.query<{ balance: string }>(
    `select coalesce(sum(case direction when 'CREDIT' then amount else -amount end), 0)::text as balance
     from ledger_entries e
     join ledger_accounts a on a.id = e.account_id
     where a.account_type = 'PLATFORM_SETTLEMENT_CLEARING'`,
  );
  const clearingBalance = clearing.rows[0]?.balance ?? '0';
  if (!Money.of(clearingBalance).isZero()) {
    issues.push({
      check: 'SETTLEMENT_CLEARING_ZERO',
      detail: `settlement clearing balance is ${clearingBalance}`,
    });
  }

  // 3. No negative balances outside clearing accounts.
  const negatives = await client.query<{ account_id: string; account_type: string; balance: string }>(
    `select a.id as account_id, a.account_type::text as account_type,
            sum(case e.direction when 'CREDIT' then e.amount else -e.amount end)::text as balance
     from ledger_entries e
     join ledger_accounts a on a.id = e.account_id
     where a.account_type not in (
       'PLATFORM_SETTLEMENT_CLEARING', 'PLATFORM_DEPOSIT_CLEARING', 'PLATFORM_WITHDRAWAL_CLEARING'
     )
     group by a.id, a.account_type
     having sum(case e.direction when 'CREDIT' then e.amount else -e.amount end) < 0`,
  );
  for (const row of negatives.rows) {
    issues.push({
      check: 'NO_NEGATIVE_BALANCE',
      detail: `account ${row.account_id} (${row.account_type}) balance ${row.balance}`,
    });
  }

  // 4. Balance cache agrees with entry-derived balances.
  const drift = await client.query<{ account_id: string; cached: string; derived: string }>(
    `select b.account_id, b.balance::text as cached,
            coalesce(sum(case e.direction when 'CREDIT' then e.amount else -e.amount end), 0)::text as derived
     from ledger_account_balances b
     left join ledger_entries e on e.account_id = b.account_id
     group by b.account_id, b.balance
     having b.balance <> coalesce(sum(case e.direction when 'CREDIT' then e.amount else -e.amount end), 0)`,
  );
  for (const row of drift.rows) {
    issues.push({
      check: 'BALANCE_CACHE_CONSISTENT',
      detail: `account ${row.account_id} cached ${row.cached} != derived ${row.derived}`,
    });
  }

  return { ok: issues.length === 0, issues };
}
