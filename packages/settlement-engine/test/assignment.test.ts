import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money, verifyCommitReveal } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  ensureUserAccounts,
  getBalance,
  getPlatformAccountId,
  reconcile,
  LedgerError,
} from '@sevendays/ledger';
import { generateHorse } from '@sevendays/race-engine';
import type { PriceTablePolicy } from '@sevendays/economy-engine';
import {
  AssignmentError,
  createPurchaseSession,
  cancelPurchaseSession,
  lockSessionsIntoBatch,
  refundUnassignedSessions,
  buildHorseQueue,
  buildBuyerQueue,
  executeAssignment,
  executeReserveAllocations,
  marketTiebreakScore,
} from '../src/index.js';

let client: SqlClient;

const ALGO = 'assignment_algorithm_v1.0';
const GEN = 'horse_generation_v1.0';

const PRICE_TABLE: PriceTablePolicy = {
  prices: {
    0: '100.00', 1: '110.00', 2: '121.00', 3: '133.10',
    4: '146.41', 5: '161.05', 6: '177.16',
  },
  buyback_total: '200.00',
  purchase_lock_amount: '177.16',
};

beforeAll(async () => {
  client = await createTestDb();
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  return r.rows[0]!.id;
}

async function fund(userId: string, amount: string): Promise<void> {
  await depositConfirmation(client, {
    userId,
    amount: Money.of(amount),
    idempotencyKey: randomUUID(),
  });
}

async function newListedHorse(
  sellerId: string,
  currentDay: number,
  batchRunId: string,
  listedAt: string,
): Promise<{ horseId: string; listingId: string }> {
  const horse = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, last_listed_at)
     values ($1, $2, $3, 'BALANCED', 'COMMON', $4, 0.5, $5, $6, $7, $8)
     returning id`,
    [
      sellerId, currentDay, `Assign Test ${randomUUID().slice(0, 13)}`,
      randomUUID().replaceAll('-', ''), GEN, randomUUID().replaceAll('-', ''),
      JSON.stringify({ speed: 75, power: 75, stamina: 75, recovery: 75, luck: 75 }),
      listedAt,
    ],
  );
  const horseId = horse.rows[0]!.id;
  const listing = await client.query<{ id: string }>(
    `insert into market_listings (horse_id, seller_user_id, listed_at, listing_price, current_day,
                                  batch_run_id, deterministic_market_tiebreak_score)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      horseId, sellerId, listedAt, PRICE_TABLE.prices[String(currentDay)], currentDay,
      batchRunId, marketTiebreakScore(batchRunId, horseId, ALGO),
    ],
  );
  return { horseId, listingId: listing.rows[0]!.id };
}

let batchCounter = 0;
async function newBatch(): Promise<string> {
  batchCounter += 1;
  const r = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version)
     values ($1, 'batch_v1.0') returning id`,
    [`2035-01-${String(batchCounter).padStart(2, '0')}`],
  );
  return r.rows[0]!.id;
}

async function setMarketplace(state: string): Promise<void> {
  await client.query(`update marketplace_status set state = $1::marketplace_state where id = true`, [state]);
}

describe('purchase sessions', () => {
  it('locks 177.16 immediately; idempotent replay returns the same session', async () => {
    const user = await newUser();
    await fund(user, '200');
    const key = randomUUID();

    const first = await createPurchaseSession(client, { userId: user, idempotencyKey: key });
    const replay = await createPurchaseSession(client, { userId: user, idempotencyKey: key });
    expect(first.alreadyExists).toBe(false);
    expect(replay.alreadyExists).toBe(true);
    expect(replay.sessionId).toBe(first.sessionId);

    const accounts = await ensureUserAccounts(client, user);
    expect(await getBalance(client, accounts.available)).toBe('22.84000000');
    expect(await getBalance(client, accounts.locked)).toBe('177.16000000');
  });

  it('rejects insufficient balance atomically (no orphan session)', async () => {
    const user = await newUser();
    await fund(user, '100');
    await expect(
      createPurchaseSession(client, { userId: user, idempotencyKey: randomUUID() }),
    ).rejects.toThrow(LedgerError);
    const sessions = await client.query<{ count: string }>(
      `select count(*)::text as count from purchase_sessions where user_id = $1`,
      [user],
    );
    expect(sessions.rows[0]!.count).toBe('0');
  });

  it('allows >10 concurrent sessions; only the 1000 sanity ceiling rejects (Decision 096)', async () => {
    const user = await newUser();
    await fund(user, '2000');
    // 旧Decision 051の10件上限は撤廃 — 11件目も普通に作れる
    for (let i = 0; i < 11; i += 1) {
      await createPurchaseSession(client, { userId: user, idempotencyKey: randomUUID() });
    }
    // 安全天井(1000)は残る: PENDING行を直接積んで境界を検証(台帳は通さない)
    await client.query(
      `insert into purchase_sessions (user_id, locked_amount, funds_locked, idempotency_key)
       select $1, 177.16, true, 'cap-seed:' || g from generate_series(1, 989) g`,
      [user],
    );
    await expect(
      createPurchaseSession(client, { userId: user, idempotencyKey: randomUUID() }),
    ).rejects.toThrow(AssignmentError);
    // 擬似行は台帳ロックを持たない — 後続テストの全体refundに巻き込まれる前に撤去
    await client.query(`delete from purchase_sessions where idempotency_key like 'cap-seed:%'`);
  });

  it('rejects when marketplace is locked', async () => {
    const user = await newUser();
    await fund(user, '200');
    await setMarketplace('MARKET_LOCKED');
    try {
      await expect(
        createPurchaseSession(client, { userId: user, idempotencyKey: randomUUID() }),
      ).rejects.toThrow('Marketplace');
    } finally {
      await setMarketplace('OPEN');
    }
  });

  it('cancel refunds fully before batch lock; forbidden after', async () => {
    const user = await newUser();
    await fund(user, '200');
    const { sessionId } = await createPurchaseSession(client, {
      userId: user,
      idempotencyKey: randomUUID(),
    });
    await cancelPurchaseSession(client, { sessionId, userId: user });
    const accounts = await ensureUserAccounts(client, user);
    expect(await getBalance(client, accounts.available)).toBe('200.00000000');

    // second session, locked into a batch -> not cancellable
    const second = await createPurchaseSession(client, { userId: user, idempotencyKey: randomUUID() });
    const batch = await newBatch();
    await lockSessionsIntoBatch(client, batch);
    await expect(
      cancelPurchaseSession(client, { sessionId: second.sessionId, userId: user }),
    ).rejects.toThrow('locked into a batch');
    // clean up: expire it so later tests are unaffected
    await refundUnassignedSessions(client, batch);
  });
});

describe('deterministic queues', () => {
  it('horse queue: listed_at asc -> day desc -> tiebreak desc -> uuid asc; buyer queue: created_at asc', async () => {
    const batch = await newBatch();
    const seller = await newUser();
    // older listing wins regardless of day; same-time ties by day desc
    const older = await newListedHorse(seller, 2, batch, '2035-06-01T00:00:00Z');
    const newerHigh = await newListedHorse(seller, 6, batch, '2035-06-02T00:00:00Z');
    const newerLow = await newListedHorse(seller, 3, batch, '2035-06-02T00:00:00Z');

    const queue = await buildHorseQueue(client, batch, ALGO);
    const ours = queue.filter((q) =>
      [older.horseId, newerHigh.horseId, newerLow.horseId].includes(q.horseId),
    );
    expect(ours.map((q) => q.horseId)).toEqual([older.horseId, newerHigh.horseId, newerLow.horseId]);

    // determinism: identical output on rebuild
    const rebuilt = await buildHorseQueue(client, batch, ALGO);
    expect(rebuilt.map((q) => q.horseId)).toEqual(queue.map((q) => q.horseId));

    // buyer queue ordered by creation time
    const buyerA = await newUser();
    const buyerB = await newUser();
    await fund(buyerA, '200');
    await fund(buyerB, '200');
    const sessionA = await createPurchaseSession(client, { userId: buyerA, idempotencyKey: randomUUID() });
    const sessionB = await createPurchaseSession(client, { userId: buyerB, idempotencyKey: randomUUID() });
    await lockSessionsIntoBatch(client, batch);
    const buyers = await buildBuyerQueue(client, batch, ALGO);
    const ourBuyers = buyers.filter((b) => [sessionA.sessionId, sessionB.sessionId].includes(b.sessionId));
    expect(ourBuyers.map((b) => b.sessionId)).toEqual([sessionA.sessionId, sessionB.sessionId]);

    // clean up pending sessions/listings for later tests
    await refundUnassignedSessions(client, batch);
    await client.query(`update market_listings set status = 'UNASSIGNED' where batch_run_id = $1`, [batch]);
  });
});

describe('assignment execution', () => {
  it('P2P first: fee 0, price by current_day, refund of the difference, ownership after ledger, buff APPLIED', async () => {
    const batch = await newBatch();
    const seller = await newUser();
    const day3 = await newListedHorse(seller, 3, batch, '2035-07-01T00:00:00Z'); // 133.10, older -> first

    const buyer = await newUser();
    await fund(buyer, '200');
    // buyer holds an ACTIVE revenge buff
    await client.query(
      `insert into revenge_buffs (user_id, buff_rarity, buff_bonus_score, buff_policy_version, deterministic_buff_roll)
       values ($1, 'R', 7, 'buff_policy_v1.0', 'roll-a')`,
      [buyer],
    );
    const session = await createPurchaseSession(client, { userId: buyer, idempotencyKey: randomUUID() });
    await lockSessionsIntoBatch(client, batch);

    const result = await executeAssignment(client, {
      batchRunId: batch,
      assignmentAlgorithmVersion: ALGO,
      priceTable: PRICE_TABLE,
      allowDay0Mint: true,
      dailyDay0MintLimit: 100,
      horseGenerationVersion: GEN,
    });
    expect(result.p2pAssignments).toBe(1);
    expect(result.day0Mints).toBe(0); // P2P has priority

    // Decision 069: seller receives the price minus the 2% fee
    // (133.10 x 0.98 = 130.438).
    const sellerAccounts = await ensureUserAccounts(client, seller);
    expect(await getBalance(client, sellerAccounts.available)).toBe('130.43800000');
    // buyer: 200 - 177.16 lock + (177.16 - 133.10) refund = 66.90; locked 0
    const buyerAccounts = await ensureUserAccounts(client, buyer);
    expect(await getBalance(client, buyerAccounts.available)).toBe('66.90000000');
    expect(await getBalance(client, buyerAccounts.locked)).toBe('0.00000000');

    // ownership transferred; current_day unchanged (assignment never increments)
    const horse = await client.query<{ owner_user_id: string; current_day: number }>(
      `select owner_user_id, current_day from horses where id = $1`,
      [day3.horseId],
    );
    expect(horse.rows[0]!.owner_user_id).toBe(buyer);
    expect(horse.rows[0]!.current_day).toBe(3);

    // assignment SETTLED with ledger reference; session ASSIGNED with refund recorded
    const assignment = await client.query<{ status: string; ledger_transaction_id: string | null }>(
      `select status::text as status, ledger_transaction_id from ownership_assignments where purchase_session_id = $1`,
      [session.sessionId],
    );
    expect(assignment.rows[0]!.status).toBe('SETTLED');
    expect(assignment.rows[0]!.ledger_transaction_id).not.toBeNull();
    const ps = await client.query<{ status: string; assigned_price: string; refund_amount: string }>(
      `select status::text as status, assigned_price::text as assigned_price, refund_amount::text as refund_amount
       from purchase_sessions where id = $1`,
      [session.sessionId],
    );
    expect(ps.rows[0]!.status).toBe('ASSIGNED');
    expect(Money.of(ps.rows[0]!.assigned_price).eq('133.10')).toBe(true);
    expect(Money.of(ps.rows[0]!.refund_amount).eq('44.06')).toBe(true);

    // buff moved ACTIVE -> APPLIED, bound to the received horse (Decision 057)
    const buff = await client.query<{ status: string; applied_horse_id: string }>(
      `select status::text as status, applied_horse_id from revenge_buffs where user_id = $1`,
      [buyer],
    );
    expect(buff.rows[0]!.status).toBe('APPLIED');
    expect(buff.rows[0]!.applied_horse_id).toBe(day3.horseId);

    // idempotent re-run: nothing changes
    const rerun = await executeAssignment(client, {
      batchRunId: batch,
      assignmentAlgorithmVersion: ALGO,
      priceTable: PRICE_TABLE,
      allowDay0Mint: true,
      dailyDay0MintLimit: 100,
      horseGenerationVersion: GEN,
    });
    expect(rerun.p2pAssignments + rerun.day0Mints).toBe(0);
    expect(await getBalance(client, buyerAccounts.available)).toBe('66.90000000');
  });

  it('Day0 Mint fallback: verifiable commit-reveal mint, reserve allocation, refund 75.16', async () => {
    const batch = await newBatch();
    const buyer = await newUser();
    await fund(buyer, '200');
    const session = await createPurchaseSession(client, { userId: buyer, idempotencyKey: randomUUID() });
    await lockSessionsIntoBatch(client, batch);

    const mintRevenue = await getPlatformAccountId(client, 'PLATFORM_MINT_REVENUE');
    const revenueBefore = await getBalance(client, mintRevenue);

    const result = await executeAssignment(client, {
      batchRunId: batch,
      assignmentAlgorithmVersion: ALGO,
      priceTable: PRICE_TABLE,
      allowDay0Mint: true,
      dailyDay0MintLimit: 100,
      horseGenerationVersion: GEN,
    });
    expect(result.day0Mints).toBe(1);

    // Decision 069: mint charge 102 (100 + 2 fee) -> refund 75.16;
    // buyer: 22.84 + 75.16 refund = 98.00
    const buyerAccounts = await ensureUserAccounts(client, buyer);
    expect(await getBalance(client, buyerAccounts.available)).toBe('98.00000000');

    // minted horse: owned by buyer, Day0, generation verifiable via commit-reveal
    const assignment = await client.query<{ horse_id: string }>(
      `select horse_id from ownership_assignments where purchase_session_id = $1`,
      [session.sessionId],
    );
    const horseId = assignment.rows[0]!.horse_id;
    const horse = await client.query<{
      owner_user_id: string; current_day: number; mint_seed_hash: string;
      horse_type: string; name: string;
    }>(
      `select owner_user_id, current_day, mint_seed_hash, horse_type::text as horse_type, name
       from horses where id = $1`,
      [horseId],
    );
    expect(horse.rows[0]!.owner_user_id).toBe(buyer);
    expect(horse.rows[0]!.current_day).toBe(0);

    const commit = await client.query<{ commit_hash: string; reveal_seed: string }>(
      `select commit_hash, reveal_seed from randomness_commits
       where reference_type = 'MINT' and reference_id = $1`,
      [horseId],
    );
    expect(verifyCommitReveal(commit.rows[0]!.reveal_seed, commit.rows[0]!.commit_hash)).toBe(true);
    // regenerate from the revealed seed -> identical horse (replayable mint)
    const regenerated = generateHorse({
      mintSeed: commit.rows[0]!.reveal_seed,
      horseUuid: horseId,
      userUuid: buyer,
      version: GEN,
    });
    expect(regenerated.horseType).toBe(horse.rows[0]!.horse_type);

    // mint revenue +100, then Step 26 allocates it to reserves
    expect(await getBalance(client, mintRevenue)).toBe(
      Money.of(revenueBefore).add('100').toFixed8(),
    );
    const allocations = await executeReserveAllocations(client, batch);
    expect(allocations).toBe(1);
    expect(Money.of(await getBalance(client, mintRevenue)).eq(revenueBefore)).toBe(true);
    // replay-safe
    expect(await executeReserveAllocations(client, batch)).toBe(0);
  });

  it('respects the daily mint limit and expires the rest with a full refund', async () => {
    const batch = await newBatch();
    const buyerA = await newUser();
    const buyerB = await newUser();
    await fund(buyerA, '200');
    await fund(buyerB, '200');
    await createPurchaseSession(client, { userId: buyerA, idempotencyKey: randomUUID() });
    await createPurchaseSession(client, { userId: buyerB, idempotencyKey: randomUUID() });
    await lockSessionsIntoBatch(client, batch);

    const result = await executeAssignment(client, {
      batchRunId: batch,
      assignmentAlgorithmVersion: ALGO,
      priceTable: PRICE_TABLE,
      allowDay0Mint: true,
      dailyDay0MintLimit: 1, // only one mint allowed today
      horseGenerationVersion: GEN,
    });
    expect(result.day0Mints).toBe(1);
    expect(result.unassigned).toBe(1);

    const expired = await refundUnassignedSessions(client, batch);
    expect(expired).toBe(1);
    const statuses = await client.query<{ status: string; count: string }>(
      `select status::text as status, count(*)::text as count from purchase_sessions
       where batch_run_id = $1 group by status order by status`,
      [batch],
    );
    const map = new Map(statuses.rows.map((r) => [r.status, Number(r.count)]));
    expect(map.get('ASSIGNED')).toBe(1);
    expect(map.get('EXPIRED')).toBe(1);

    // the expired buyer got the full 200 back
    const balances = await Promise.all(
      [buyerA, buyerB].map(async (u) => {
        const accounts = await ensureUserAccounts(client, u);
        return getBalance(client, accounts.available);
      }),
    );
    expect(balances).toContain('200.00000000'); // expired buyer fully refunded
    expect(balances).toContain('98.00000000'); // minted buyer paid 102 (Decision 069)

    // ledger stays perfectly balanced through the whole suite
    await executeReserveAllocations(client, batch);
    const report = await reconcile(client);
    expect(report.issues).toEqual([]);
  });

  it('crash-resume (F-H): interrupted settlement resumes to the identical outcome, no stuck funds', async () => {
    const batch = await newBatch();
    const seller = await newUser();
    const listing = await newListedHorse(seller, 3, batch, '2035-08-01T00:00:00Z'); // 133.10

    const buyer = await newUser();
    await fund(buyer, '200');
    const session = await createPurchaseSession(client, { userId: buyer, idempotencyKey: randomUUID() });
    await lockSessionsIntoBatch(client, batch);

    // Simulate a crash mid-settlement: assignment row exists and the ledger
    // settlement is posted, but refund/ownership/listing/session were never
    // reached (the exact window found in the audit).
    const { assignmentSettlement } = await import('@sevendays/ledger');
    const crashed = await client.query<{ id: string }>(
      `insert into ownership_assignments
         (batch_run_id, purchase_session_id, market_listing_id, horse_id, buyer_user_id, seller_user_id, assigned_price)
       values ($1, $2, $3, $4, $5, $6, 133.10) returning id`,
      [batch, session.sessionId, listing.listingId, listing.horseId, buyer, seller],
    );
    await assignmentSettlement(client, {
      buyerUserId: buyer,
      sellerUserId: seller,
      price: Money.of('133.10'),
      idempotencyKey: `assign:${session.sessionId}`,
      referenceType: 'ownership_assignment',
      referenceId: crashed.rows[0]!.id,
    });
    // crash state: buyer has 22.84 available, 44.06 stranded in locked
    const buyerAccounts = await ensureUserAccounts(client, buyer);
    expect(await getBalance(client, buyerAccounts.locked)).toBe('44.06000000');

    // a second buyer joins the same batch: must NOT be given the crashed horse
    const buyer2 = await newUser();
    await fund(buyer2, '200');
    await createPurchaseSession(client, { userId: buyer2, idempotencyKey: randomUUID() });
    await lockSessionsIntoBatch(client, batch);

    const result = await executeAssignment(client, {
      batchRunId: batch,
      assignmentAlgorithmVersion: ALGO,
      priceTable: PRICE_TABLE,
      allowDay0Mint: false,
      dailyDay0MintLimit: 0,
      horseGenerationVersion: GEN,
    });
    // buyer1 resumed onto its recorded horse; buyer2 found no inventory
    expect(result.p2pAssignments).toBe(1);
    expect(result.unassigned).toBe(1);

    // resume completed everything: refund released, ownership moved, no double-pay
    expect(await getBalance(client, buyerAccounts.locked)).toBe('0.00000000');
    expect(await getBalance(client, buyerAccounts.available)).toBe('66.90000000'); // 22.84 + 44.06
    const sellerAccounts = await ensureUserAccounts(client, seller);
    expect(await getBalance(client, sellerAccounts.available)).toBe('130.43800000'); // exactly once (133.10 - 2% fee)
    const horse = await client.query<{ owner_user_id: string }>(
      `select owner_user_id from horses where id = $1`,
      [listing.horseId],
    );
    expect(horse.rows[0]!.owner_user_id).toBe(buyer);
    const ps = await client.query<{ status: string; refund_amount: string }>(
      `select status::text as status, refund_amount::text as refund_amount
       from purchase_sessions where id = $1`,
      [session.sessionId],
    );
    expect(ps.rows[0]!.status).toBe('ASSIGNED');
    expect(Money.of(ps.rows[0]!.refund_amount).eq('44.06')).toBe(true);

    await refundUnassignedSessions(client, batch);
    const report = await reconcile(client);
    expect(report.issues).toEqual([]);
  });

  it('mint disabled -> everything refunds (Day0 exists only as fallback)', async () => {
    const batch = await newBatch();
    const buyer = await newUser();
    await fund(buyer, '200');
    await createPurchaseSession(client, { userId: buyer, idempotencyKey: randomUUID() });
    await lockSessionsIntoBatch(client, batch);

    const result = await executeAssignment(client, {
      batchRunId: batch,
      assignmentAlgorithmVersion: ALGO,
      priceTable: PRICE_TABLE,
      allowDay0Mint: false,
      dailyDay0MintLimit: 0,
      horseGenerationVersion: GEN,
    });
    expect(result.p2pAssignments).toBe(0);
    expect(result.day0Mints).toBe(0);
    expect(result.unassigned).toBe(1);

    await refundUnassignedSessions(client, batch);
    const accounts = await ensureUserAccounts(client, buyer);
    expect(await getBalance(client, accounts.available)).toBe('200.00000000');
    expect(await getBalance(client, accounts.locked)).toBe('0.00000000');
  });
});
