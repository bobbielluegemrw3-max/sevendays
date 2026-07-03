import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money, verifyCommitReveal } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  ensureUserAccounts,
  getBalance,
  reconcile,
} from '@sevendays/ledger';
import {
  runBatch,
  getMarketplaceState,
  createPurchaseSession,
  buildProductionHandlers,
} from '../src/index.js';

/**
 * THE full production day: every one of the 37 steps runs with the real
 * composition root against real Postgres — race, burns, day progression,
 * profit taking, assignment, reserve allocation, reports, stress tests,
 * tomorrow's economy status, audit snapshot, marketplace cycle.
 */

let client: SqlClient;
const DATE = '2038-01-01';

const owners: string[] = [];
const horses: string[] = [];
const buyers: string[] = [];

beforeAll(async () => {
  client = await createTestDb();

  // 12 ACTIVE horses on days 1..6 (two per day), separate owners, no referrers.
  for (let i = 0; i < 12; i += 1) {
    const owner = await newUser();
    owners.push(owner);
    const day = (i % 6) + 1;
    const r = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, $2, $3, $4::horse_type, 'COMMON', $5, 0.50, 'horse_generation_v1.0', $6, $7)
       returning id`,
      [
        owner,
        day,
        `Prod Day ${randomUUID().slice(0, 15)}`,
        ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'][i % 5],
        randomUUID().replaceAll('-', ''),
        randomUUID().replaceAll('-', ''),
        JSON.stringify({ speed: 70 + i, power: 72, stamina: 75, recovery: 74, luck: 70 }),
      ],
    );
    horses.push(r.rows[0]!.id);
  }

  // 3 funded buyers with open purchase sessions (created while OPEN).
  for (let i = 0; i < 3; i += 1) {
    const buyer = await newUser();
    buyers.push(buyer);
    await depositConfirmation(client, {
      userId: buyer,
      amount: Money.of('200'),
      idempotencyKey: randomUUID(),
    });
    await createPurchaseSession(client, { userId: buyer, idempotencyKey: randomUUID() });
  }
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  return r.rows[0]!.id;
}

describe('full production day (all 37 steps, real handlers)', () => {
  it('completes the daily settlement batch end to end', async () => {
    const result = await runBatch(client, {
      batchDate: DATE,
      handlers: buildProductionHandlers(),
    });
    expect(result.errorMessage, result.failedStepKey).toBeUndefined();
    expect(result.status).toBe('COMPLETED');
    expect(await getMarketplaceState(client)).toBe('OPEN');

    // all 37 steps completed
    const steps = await client.query<{ count: string }>(
      `select count(*)::text as count from batch_steps
       where batch_run_id = $1 and status = 'COMPLETED'`,
      [result.batchRunId],
    );
    expect(steps.rows[0]!.count).toBe('37');

    // --- race: finalized, seed revealed and publicly verifiable, escrow empty
    const race = await client.query<{ id: string; status: string; participant_count: number }>(
      `select id, status::text as status, participant_count from races where batch_run_id = $1`,
      [result.batchRunId],
    );
    expect(race.rows).toHaveLength(1); // one logical race (Decision 038)
    expect(race.rows[0]!.status).toBe('FINALIZED');
    expect(race.rows[0]!.participant_count).toBe(12);

    const commit = await client.query<{ commit_hash: string; reveal_seed: string }>(
      `select rc.commit_hash, rc.reveal_seed from randomness_commits rc
       join races r on r.seed_commit_id = rc.id where r.id = $1`,
      [race.rows[0]!.id],
    );
    expect(commit.rows[0]!.reveal_seed).not.toBeNull();
    expect(verifyCommitReveal(commit.rows[0]!.reveal_seed, commit.rows[0]!.commit_hash)).toBe(true);
    const escrow = await client.query<{ count: string }>(
      `select count(*)::text as count from race_seed_escrow where race_id = $1`,
      [race.rows[0]!.id],
    );
    expect(escrow.rows[0]!.count).toBe('0'); // seed no longer secret

    // --- burn: NORMAL 10% of 12 -> exactly 1, on the bottom rank
    const results = await client.query<{ burned: string; total: string }>(
      `select count(*) filter (where is_burned)::text as burned, count(*)::text as total
       from race_results where race_id = $1`,
      [race.rows[0]!.id],
    );
    expect(results.rows[0]!.total).toBe('12');
    expect(results.rows[0]!.burned).toBe('1');

    // --- day progression: survivors +1; day-6 survivors cleared to Day7
    const cleared = await client.query<{ count: string }>(
      `select count(*)::text as count from horses
       where id = any($1::uuid[]) and status = 'DAY7_CLEARED'`,
      [horses],
    );
    const schedules = await client.query<{ count: string }>(
      `select count(*)::text as count from buyback_schedules where horse_id = any($1::uuid[])`,
      [horses],
    );
    expect(schedules.rows[0]!.count).toBe(cleared.rows[0]!.count); // schedule per clear
    const burnedRow = await client.query<{ current_day: number }>(
      `select h.current_day from horses h
       join race_results r on r.horse_id = h.id
       where r.race_id = $1 and r.is_burned`,
      [race.rows[0]!.id],
    );
    // burned horse kept its pre-race day (spec: burn never increments)
    expect(burnedRow.rows[0]!.current_day).toBeLessThanOrEqual(6);

    // --- purchase sessions: all 3 settled or expired, none left pending
    const sessions = await client.query<{ status: string; count: string }>(
      `select status::text as status, count(*)::text as count from purchase_sessions
       where batch_run_id = $1 group by status`,
      [result.batchRunId],
    );
    const byStatus = new Map(sessions.rows.map((s) => [s.status, Number(s.count)]));
    expect(byStatus.get('PENDING_ASSIGNMENT') ?? 0).toBe(0);
    expect((byStatus.get('ASSIGNED') ?? 0) + (byStatus.get('EXPIRED') ?? 0)).toBe(3);
    expect(byStatus.get('ASSIGNED') ?? 0).toBeGreaterThanOrEqual(1);

    // --- settled assignments transferred ownership; P2P before Day0
    const assignments = await client.query<{
      market_listing_id: string | null;
      buyer_user_id: string;
      horse_id: string;
      assigned_price: string;
    }>(
      `select market_listing_id, buyer_user_id, horse_id, assigned_price::text as assigned_price
       from ownership_assignments where batch_run_id = $1 and status = 'SETTLED'`,
      [result.batchRunId],
    );
    for (const a of assignments.rows) {
      const owner = await client.query<{ owner_user_id: string }>(
        `select owner_user_id from horses where id = $1`,
        [a.horse_id],
      );
      expect(owner.rows[0]!.owner_user_id).toBe(a.buyer_user_id);
    }
    const mintCount = assignments.rows.filter((a) => a.market_listing_id === null).length;
    const p2pCount = assignments.rows.length - mintCount;
    const listings = await client.query<{ count: string }>(
      `select count(*)::text as count from market_listings where batch_run_id = $1`,
      [result.batchRunId],
    );
    // P2P priority: mints only happen after the listing inventory is exhausted
    if (mintCount > 0) {
      expect(p2pCount).toBe(Number(listings.rows[0]!.count));
    }

    // every minted horse has a verifiable commit-reveal record
    for (const a of assignments.rows.filter((x) => x.market_listing_id === null)) {
      const mintCommit = await client.query<{ commit_hash: string; reveal_seed: string }>(
        `select commit_hash, reveal_seed from randomness_commits
         where reference_type = 'MINT' and reference_id = $1`,
        [a.horse_id],
      );
      expect(verifyCommitReveal(mintCommit.rows[0]!.reveal_seed, mintCommit.rows[0]!.commit_hash)).toBe(true);
    }

    // --- reports, stress tests, tomorrow's status, audit snapshot
    const report = await client.query<{ count: string }>(
      `select count(*)::text as count from liquidity_reports where batch_run_id = $1`,
      [result.batchRunId],
    );
    expect(report.rows[0]!.count).toBe('1');
    const stress = await client.query<{ count: string }>(
      `select count(*)::text as count from stress_test_results where batch_run_id = $1`,
      [result.batchRunId],
    );
    expect(stress.rows[0]!.count).toBe('8');
    const evaluation = await client.query<{ final_status: string }>(
      `select final_status::text as final_status from economy_status_evaluations
       where evaluation_date = $1`,
      [DATE],
    );
    expect(['NORMAL', 'WATCH', 'WINTER', 'EMERGENCY']).toContain(evaluation.rows[0]!.final_status);
    const audit = await client.query<{ count: string }>(
      `select count(*)::text as count from audit_logs
       where action = 'DAILY_AUDIT_SNAPSHOT' and reference_id = $1`,
      [result.batchRunId],
    );
    expect(audit.rows[0]!.count).toBe('1');

    // --- the books balance perfectly after the whole day
    const reconciliation = await reconcile(client);
    expect(reconciliation.issues).toEqual([]);

    // --- funds: every buyer either owns a horse (paid its price) or was
    //     fully refunded; nothing is stuck in locked accounts
    for (const buyer of buyers) {
      const accounts = await ensureUserAccounts(client, buyer);
      expect(await getBalance(client, accounts.locked)).toBe('0.00000000');
    }
  }, 120_000);

  it('LAUNCH DAY (F-L): zero horses + first buyers — the batch completes and mints', async () => {
    // fresh database: no horses exist anywhere yet
    const launchDb = await createTestDb();
    const buyer = await (async () => {
      const r = await launchDb.query<{ id: string }>(
        `insert into users (email) values ($1) returning id`,
        [`${randomUUID()}@launch.test`],
      );
      return r.rows[0]!.id;
    })();
    await depositConfirmation(launchDb, {
      userId: buyer,
      amount: Money.of('200'),
      idempotencyKey: randomUUID(),
    });
    await createPurchaseSession(launchDb, { userId: buyer, idempotencyKey: randomUUID() });

    const result = await runBatch(launchDb, {
      batchDate: '2038-06-01',
      handlers: buildProductionHandlers(),
    });
    expect(result.errorMessage, result.failedStepKey).toBeUndefined();
    expect(result.status).toBe('COMPLETED');
    expect(await getMarketplaceState(launchDb)).toBe('OPEN');

    // the empty race is legal and finalized with zero participants
    const race = await launchDb.query<{ participant_count: number; status: string }>(
      `select participant_count, status::text as status from races
       where batch_run_id = $1`,
      [result.batchRunId],
    );
    expect(race.rows[0]!.participant_count).toBe(0);
    expect(race.rows[0]!.status).toBe('FINALIZED');

    // the first horse of the game was minted for the first buyer
    const horse = await launchDb.query<{ owner_user_id: string; current_day: number }>(
      `select owner_user_id, current_day from horses`,
    );
    expect(horse.rows).toHaveLength(1);
    expect(horse.rows[0]!.owner_user_id).toBe(buyer);
    expect(horse.rows[0]!.current_day).toBe(0);

    const reconciliation = await reconcile(launchDb);
    expect(reconciliation.issues).toEqual([]);
  }, 120_000);

  it('re-running the completed day is a perfect no-op', async () => {
    const before = await client.query<{ tx: string; horses_burned: string }>(
      `select (select count(*) from ledger_transactions)::text as tx,
              (select count(*) from horses where status = 'BURNED')::text as horses_burned`,
    );
    const rerun = await runBatch(client, { batchDate: DATE, handlers: buildProductionHandlers() });
    expect(rerun.status).toBe('COMPLETED');
    const after = await client.query<{ tx: string; horses_burned: string }>(
      `select (select count(*) from ledger_transactions)::text as tx,
              (select count(*) from horses where status = 'BURNED')::text as horses_burned`,
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
