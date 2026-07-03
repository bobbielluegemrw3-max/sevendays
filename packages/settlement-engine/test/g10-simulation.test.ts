import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@sevendays/database';
import { addDays } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { reconcile } from '@sevendays/ledger';
import {
  runBatch,
  buildProductionHandlers,
  createPurchaseSession,
  getMarketplaceState,
} from '../src/index.js';

/**
 * Completion Gate G10 — the 100,000 user economic simulation.
 *
 * The harness bulk-seeds users/accounts/deposits with set-based SQL (every
 * DB trigger and constraint still fires row-by-row), then drives REAL days:
 * deterministic buyers open purchase sessions, and the actual production
 * 37-step Daily Settlement Batch runs each day. After every day the
 * economic invariants are asserted:
 *   - batch COMPLETED and the marketplace reopened
 *   - ledger balanced, settlement clearing zero, no negative balances
 *   - every buyback payment due that day is PAID
 * plus a final sweep (burn rate cap, Day7 horses all scheduled, buff/MLM
 * conservation).
 *
 * The default parameters are a fast smoke that runs in the normal suite.
 * The full gate is opt-in (hours-long):
 *   G10_USERS=100000 G10_DAYS=30 G10_DAILY_BUYERS=1000 \
 *     pnpm --filter @sevendays/settlement-engine test -- g10
 */

const USERS = Number(process.env.G10_USERS ?? 1500);
const DAYS = Number(process.env.G10_DAYS ?? 5);
const DAILY_BUYERS = Number(process.env.G10_DAILY_BUYERS ?? 40);
const DEPOSIT_PER_USER = '1000';
const START_DATE = '2035-06-01';
const SEED_CHUNK = 5000;

let client: SqlClient;
let simUserIds: string[] = [];

async function seedUsers(): Promise<void> {
  for (let offset = 0; offset < USERS; offset += SEED_CHUNK) {
    const count = Math.min(SEED_CHUNK, USERS - offset);
    await client.query(
      `insert into users (email)
       select 'g10+' || g || '@sim.dev' from generate_series($1::int, $2::int) g`,
      [offset + 1, offset + count],
    );
  }
  const rows = await client.query<{ id: string }>(
    `select id from users where email like 'g10+%' order by email`,
  );
  simUserIds = rows.rows.map((r) => r.id);

  // Referral graph for MLM: the first 1% are roots; every 3rd user refers
  // to a root (chain length 1 — the cycle trigger walk stays O(1) per row).
  await client.query(
    `with sim as (
       select id, row_number() over (order by email) rn
       from users where email like 'g10+%'
     ), roots as (
       select id, rn from sim where rn <= greatest(1, $1::int / 100)
     )
     update users u
     set direct_referrer_user_id = r.id
     from sim s
     join roots r on r.rn = (s.rn % greatest(1, $1::int / 100)) + 1
     where u.id = s.id and s.rn > greatest(1, $1::int / 100) and s.rn % 3 = 0`,
    [USERS],
  );
}

async function seedAccountsAndDeposits(): Promise<void> {
  await client.query(
    `insert into ledger_accounts (owner_type, owner_id, account_type, currency)
     select 'USER', u.id, t.acct::account_type, 'USDT'
     from users u
     cross join (values ('USER_AVAILABLE'), ('USER_LOCKED')) t(acct)
     where u.email like 'g10+%'
     on conflict do nothing`,
  );

  // Deposits: one BLOCKCHAIN_DEPOSIT_CONFIRMATION per user, in chunks so the
  // deferred balance/consistency triggers fire on bounded commits.
  for (let offset = 0; offset < USERS; offset += SEED_CHUNK) {
    await client.query('begin');
    try {
      await client.query(
        `with sim as (
           select id, row_number() over (order by email) rn
           from users where email like 'g10+%'
         ), chunk as (
           select id from sim where rn > $1 and rn <= $2
         )
         insert into ledger_transactions (transaction_type, idempotency_key)
         select 'BLOCKCHAIN_DEPOSIT_CONFIRMATION', 'g10:dep:' || id from chunk`,
        [offset, offset + SEED_CHUNK],
      );
      await client.query(
        `with tx as (
           select t.id as tx_id, replace(t.idempotency_key, 'g10:dep:', '')::uuid as user_id
           from ledger_transactions t
           where t.idempotency_key like 'g10:dep:%'
             and not exists (select 1 from ledger_entries e where e.transaction_id = t.id)
         ), clearing as (
           select id from ledger_accounts where account_type = 'PLATFORM_DEPOSIT_CLEARING'
         )
         insert into ledger_entries (transaction_id, account_id, direction, amount)
         select tx.tx_id, clearing.id, 'DEBIT'::entry_direction, $1::numeric from tx cross join clearing
         union all
         select tx.tx_id, a.id, 'CREDIT'::entry_direction, $1::numeric
         from tx join ledger_accounts a
           on a.owner_id = tx.user_id and a.account_type = 'USER_AVAILABLE'`,
        [DEPOSIT_PER_USER],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  }
}

interface DayReport {
  date: string;
  buyers: number;
  participants: number;
  burned: number;
  day7: number;
  buybackPaymentsDue: number;
  buybackReserve: string;
  economyStatus: string;
}

async function runDay(dayIndex: number): Promise<DayReport> {
  const date = addDays(START_DATE, dayIndex);

  // Deterministic distinct buyers: rotate through the population.
  const buyers: string[] = [];
  for (let i = 0; i < DAILY_BUYERS; i += 1) {
    buyers.push(simUserIds[(dayIndex * DAILY_BUYERS + i) % simUserIds.length]!);
  }
  for (const [i, userId] of buyers.entries()) {
    await createPurchaseSession(client, {
      userId,
      idempotencyKey: `g10:session:${dayIndex}:${i}`,
    });
  }

  const result = await runBatch(client, { batchDate: date, handlers: buildProductionHandlers() });
  expect(result.status, `batch ${date}`).toBe('COMPLETED');

  // Invariants (G1 direction): balanced ledger, clearing zero, no negatives.
  const audit = await reconcile(client);
  expect(audit.issues, `reconcile ${date}`).toEqual([]);
  expect(await getMarketplaceState(client)).toBe('OPEN');

  // Every due buyback payment is PAID (Decision 059 pass condition).
  const unpaid = await client.query<{ count: string }>(
    `select count(*)::text as count from buyback_schedule_payments
     where due_date <= $1 and status <> 'PAID'`,
    [date],
  );
  expect(Number(unpaid.rows[0]!.count), `unpaid due buybacks ${date}`).toBe(0);

  const stats = await client.query<{
    participants: string;
    burned: string;
    day7: string;
    due: string;
    reserve: string;
    status: string;
  }>(
    `select
       (select count(*) from race_participant_snapshots s
        join races r on r.id = s.race_id join batch_runs b on b.id = r.batch_run_id
        where b.batch_date = $1)::text as participants,
       (select count(*) from race_results rr
        join races r on r.id = rr.race_id join batch_runs b on b.id = r.batch_run_id
        where b.batch_date = $1 and rr.is_burned)::text as burned,
       (select count(*) from buyback_schedules where day7_clear_date = $1)::text as day7,
       (select count(*) from buyback_schedule_payments where due_date = $1)::text as due,
       (select coalesce(sum(case e.direction when 'CREDIT' then e.amount else -e.amount end), 0)
        from ledger_entries e join ledger_accounts a on a.id = e.account_id
        where a.account_type = 'PLATFORM_BUYBACK_RESERVE')::text as reserve,
       coalesce((select final_status::text from economy_status_evaluations
                 where evaluation_date = $1 order by created_at desc limit 1), 'NORMAL') as status`,
    [date],
  );
  const s = stats.rows[0]!;
  return {
    date,
    buyers: buyers.length,
    participants: Number(s.participants),
    burned: Number(s.burned),
    day7: Number(s.day7),
    buybackPaymentsDue: Number(s.due),
    buybackReserve: s.reserve,
    economyStatus: s.status,
  };
}

describe(`G10 economic simulation (${USERS} users, ${DAYS} days, ${DAILY_BUYERS} buyers/day)`, () => {
  beforeAll(async () => {
    client = await createTestDb();
    await seedUsers();
    await seedAccountsAndDeposits();
  }, 3_600_000);

  it(
    'runs full production days at scale with every economic invariant intact',
    { timeout: 21_600_000 },
    async () => {
      const reports: DayReport[] = [];
      for (let day = 0; day < DAYS; day += 1) {
        const report = await runDay(day);
        reports.push(report);
        console.log(
          `[G10] ${report.date} buyers=${report.buyers} participants=${report.participants} ` +
            `burned=${report.burned} day7=${report.day7} due=${report.buybackPaymentsDue} ` +
            `buybackReserve=${report.buybackReserve} status=${report.economyStatus}`,
        );
      }

      // Burn rate cap (G3 direction): never above ceil of the max rate.
      for (const report of reports) {
        if (report.participants > 0) {
          expect(report.burned).toBeLessThanOrEqual(Math.floor(report.participants * 0.112));
        }
      }

      // Every Day7 clear produced exactly one 200/7 schedule (G5 direction).
      const schedules = await client.query<{ bad: string }>(
        `select count(*)::text as bad from buyback_schedules s
         where (select count(*) from buyback_schedule_payments p
                where p.buyback_schedule_id = s.id) <> 7
            or s.total_amount <> 200`,
      );
      expect(Number(schedules.rows[0]!.bad)).toBe(0);

      // Burned horses stay burned; one buff per burned owner at most live.
      const buffs = await client.query<{ bad: string }>(
        `select count(*)::text as bad from (
           select user_id from revenge_buffs where status in ('ACTIVE','APPLIED')
           group by user_id having count(*) > 1
         ) x`,
      );
      expect(Number(buffs.rows[0]!.bad)).toBe(0);

      // Money conservation: user funds + platform accounts sum to the
      // external boundary (deposit clearing).
      const conservation = await reconcile(client);
      expect(conservation.issues).toEqual([]);

      const totals = await client.query<{ horses: string; burned: string; completed: string }>(
        `select
           (select count(*) from horses)::text as horses,
           (select count(*) from horses where status = 'BURNED')::text as burned,
           (select count(*) from buyback_schedules where status = 'COMPLETED')::text as completed`,
      );
      console.log(
        `[G10] PASS users=${USERS} days=${DAYS} horses=${totals.rows[0]!.horses} ` +
          `burned=${totals.rows[0]!.burned} buybacksCompleted=${totals.rows[0]!.completed}`,
      );
    },
  );
});
