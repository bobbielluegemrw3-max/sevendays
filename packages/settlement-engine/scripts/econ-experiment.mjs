import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money, addDays } from '@sevendays/shared';
import { getBalance, getPlatformAccountId } from '@sevendays/ledger';
import {
  buildProductionHandlers,
  createPurchaseSession,
  evaluateMintCoverageGate,
  runBatch,
} from '../dist/index.js';

/**
 * Demand-stop drill for the Decision 069 economy (burn 10.7% ladder,
 * mint fee 2, P2P fee 2%, mint coverage gate — all live in the engine).
 * BUYERS/day for STOP days, then ZERO demand; every scheduled buyback
 * payment must still be made to the end.
 *
 * Baseline for comparison (pre-069 engine, same drill): buyback pool
 * defaulted 9 days after the stop with 279 missed payments.
 */

const USERS = Number(process.env.EXP_USERS ?? 20000);
const BUYERS = Number(process.env.EXP_BUYERS ?? 300);
const STOP = Number(process.env.EXP_STOP ?? 15);
const DAYS = Number(process.env.EXP_DAYS ?? 40);
const START_DATE = '2040-01-01';

const log = (m) => console.log(m);

async function seed(client) {
  await client.query(
    `insert into users (email)
     select 'exp+' || g || '@sim.dev' from generate_series(1, $1::int) g`,
    [USERS],
  );
  await client.query(
    `insert into ledger_accounts (owner_type, owner_id, account_type, currency)
     select 'USER', u.id, t.acct::account_type, 'USDT'
     from users u cross join (values ('USER_AVAILABLE'), ('USER_LOCKED')) t(acct)
     where u.email like 'exp+%' on conflict do nothing`,
  );
  for (let offset = 0; offset < USERS; offset += 5000) {
    await client.query('begin');
    await client.query(
      `with sim as (select id, row_number() over (order by email) rn from users where email like 'exp+%'),
            chunk as (select id from sim where rn > $1 and rn <= $2)
       insert into ledger_transactions (transaction_type, idempotency_key)
       select 'BLOCKCHAIN_DEPOSIT_CONFIRMATION', 'exp:dep:' || id from chunk`,
      [offset, offset + 5000],
    );
    await client.query(
      `with tx as (select t.id as tx_id, replace(t.idempotency_key, 'exp:dep:', '')::uuid as user_id
                   from ledger_transactions t
                   where t.idempotency_key like 'exp:dep:%'
                     and not exists (select 1 from ledger_entries e where e.transaction_id = t.id)),
            clearing as (select id from ledger_accounts where account_type = 'PLATFORM_DEPOSIT_CLEARING')
       insert into ledger_entries (transaction_id, account_id, direction, amount)
       select tx.tx_id, clearing.id, 'DEBIT'::entry_direction, 1000 from tx cross join clearing
       union all
       select tx.tx_id, a.id, 'CREDIT'::entry_direction, 1000
       from tx join ledger_accounts a on a.owner_id = tx.user_id and a.account_type = 'USER_AVAILABLE'`,
    );
    await client.query('commit');
  }
  const rows = await client.query(`select id from users where email like 'exp+%' order by email`);
  return rows.rows.map((r) => r.id);
}

const client = await createTestDb();
const userIds = await seed(client);
log(`=== Decision 069 engine drill (${USERS} users, ${BUYERS} buyers/day, demand stops after day ${STOP}) ===`);

let failure = null;
for (let day = 0; day < DAYS; day += 1) {
  const date = addDays(START_DATE, day);

  if (day < STOP) {
    for (let i = 0; i < BUYERS; i += 1) {
      await createPurchaseSession(client, {
        userId: userIds[(day * BUYERS + i) % userIds.length],
        idempotencyKey: `exp:069:${day}:${i}`,
      });
    }
  }

  const result = await runBatch(client, { batchDate: date, handlers: buildProductionHandlers() });

  const mintsToday = Number(
    (
      await client.query(
        `select count(*)::text as c from ownership_assignments a
         join batch_runs b on b.id = a.batch_run_id
         where b.batch_date = $1 and a.market_listing_id is null and a.status = 'SETTLED'`,
        [date],
      )
    ).rows[0].c,
  );
  const operating = Money.of(
    await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE')),
  );
  const gate = await evaluateMintCoverageGate(client);
  const unpaidDue = Number(
    (
      await client.query(
        `select count(*)::text as c from buyback_schedule_payments where due_date <= $1 and status <> 'PAID'`,
        [date],
      )
    ).rows[0].c,
  );
  const coverage = Money.of(gate.stopLiability).isZero()
    ? '∞'
    : (Number(gate.reserve) / Number(gate.stopLiability)).toFixed(3);
  log(
    `[069] ${date} d${String(day).padStart(2)} mints=${String(mintsToday).padStart(3)} ` +
      `reserve=${gate.reserve.padStart(12)} stopLiability=${gate.stopLiability.padStart(12)} ` +
      `coverage=${coverage} operating=${operating.toString().padStart(9)} unpaidDue=${unpaidDue} batch=${result.status}`,
  );

  if (result.status !== 'COMPLETED') {
    const failedSteps = await client.query(
      `select step_key, error_code from batch_steps s join batch_runs b on b.id = s.batch_run_id
       where b.batch_date = $1 and s.status = 'FAILED'`,
      [date],
    );
    failure = { day, date, steps: failedSteps.rows.map((s) => s.step_key).join(', '), unpaidDue };
    break;
  }
}

if (failure) {
  log(`*** FAILED on day ${failure.day} (${failure.date}): ${failure.steps}; unpaid due=${failure.unpaidDue}`);
  process.exit(1);
}
const totals = await client.query(
  `select
     (select count(*) from buyback_schedule_payments where status = 'PAID')::text as paid,
     (select count(*) from buyback_schedule_payments where due_date < $1 and status <> 'PAID')::text as missed`,
  [addDays(START_DATE, DAYS)],
);
log(
  `*** SURVIVED all ${DAYS} days: payments paid=${totals.rows[0].paid}, missed=${totals.rows[0].missed} (must be 0)`,
);
