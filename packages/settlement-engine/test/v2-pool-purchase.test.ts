import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  ensureUserAccounts,
  getBalance,
  reconcile,
} from '@sevendays/ledger';
import type { PriceTablePolicy } from '@sevendays/economy-engine';
import {
  AssignmentError,
  cancelPurchaseSession,
  createOrUpdatePoolSession,
  executeAssignment,
  executeReserveAllocations,
  lockSessionsIntoBatch,
  marketTiebreakScore,
} from '../src/index.js';

/**
 * プール購入 (V2実装-3a, Decision 103):
 * 「◯◯$厩舎」— 予算まるごとロック → P2P優先(Decision 100抽選順)→
 * 買えない出品は次の買い手へスキップ → ミント充填 → 余り(<102)自動返金。
 */

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
  await depositConfirmation(client, { userId, amount: Money.of(amount), idempotencyKey: randomUUID() });
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
      sellerId, currentDay, `Pool Test ${randomUUID().slice(0, 13)}`,
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
    [`2037-01-${String(batchCounter).padStart(2, '0')}`],
  );
  return r.rows[0]!.id;
}

function executeInput(batchRunId: string) {
  return {
    batchRunId,
    assignmentAlgorithmVersion: ALGO,
    priceTable: PRICE_TABLE,
    allowDay0Mint: true,
    dailyDay0MintLimit: 100,
    horseGenerationVersion: GEN,
  };
}

describe('pool sessions (create / edit / cancel)', () => {
  it('locks the whole budget; editing the live pool locks/releases exactly the difference', async () => {
    const user = await newUser();
    await fund(user, '2000');
    const accounts = await ensureUserAccounts(client, user);

    const created = await createOrUpdatePoolSession(client, {
      userId: user, amount: '1000', idempotencyKey: randomUUID(),
    });
    expect(created.alreadyExists).toBe(false);
    expect(await getBalance(client, accounts.locked)).toBe('1000.00000000');

    // 同一キーのリプレイは同じ結果
    const up = await createOrUpdatePoolSession(client, {
      userId: user, amount: '1500', idempotencyKey: randomUUID(),
    });
    expect(up.sessionId).toBe(created.sessionId);
    expect(up.alreadyExists).toBe(true);
    expect(await getBalance(client, accounts.locked)).toBe('1500.00000000');

    const down = await createOrUpdatePoolSession(client, {
      userId: user, amount: '200', idempotencyKey: randomUUID(),
    });
    expect(down.sessionId).toBe(created.sessionId);
    expect(await getBalance(client, accounts.locked)).toBe('200.00000000');
    expect(await getBalance(client, accounts.available)).toBe('1800.00000000');

    // キャンセルで全額返金
    await cancelPurchaseSession(client, { sessionId: created.sessionId, userId: user });
    expect(await getBalance(client, accounts.locked)).toBe('0.00000000');
    expect(await getBalance(client, accounts.available)).toBe('2000.00000000');
  });

  it('rejects a budget below one cheapest horse (102)', async () => {
    const user = await newUser();
    await fund(user, '500');
    await expect(
      createOrUpdatePoolSession(client, { userId: user, amount: '101.99', idempotencyKey: randomUUID() }),
    ).rejects.toThrow(AssignmentError);
  });
});

describe('pool allocation (P2P first, skip rule, mint fill, remainder return)', () => {
  it('turns a 500 budget into listings + refund below the mint charge', async () => {
    const batchRunId = await newBatch();
    const seller = await newUser();
    // 出品順(listed_at ASC): Day6 177.16 → Day3 133.10 → Day1 110.00
    await newListedHorse(seller, 6, batchRunId, '2037-01-01T01:00:00Z');
    await newListedHorse(seller, 3, batchRunId, '2037-01-01T02:00:00Z');
    await newListedHorse(seller, 1, batchRunId, '2037-01-01T03:00:00Z');

    const buyer = await newUser();
    await fund(buyer, '500');
    const pool = await createOrUpdatePoolSession(client, {
      userId: buyer, amount: '500', idempotencyKey: randomUUID(),
    });
    await lockSessionsIntoBatch(client, batchRunId);

    const result = await executeAssignment(client, executeInput(batchRunId));
    // 177.16 + 133.10 + 110.00 = 420.26 → 残り 79.74 < 102 なのでミントなし・返金
    expect(result.p2pAssignments).toBe(3);
    expect(result.day0Mints).toBe(0);
    expect(result.unassigned).toBe(0);

    const session = await client.query<{ status: string; assigned_price: string; refund_amount: string }>(
      `select status::text as status, assigned_price::text as assigned_price,
              refund_amount::text as refund_amount
       from purchase_sessions where id = $1`,
      [pool.sessionId],
    );
    expect(session.rows[0]!.status).toBe('ASSIGNED');
    expect(Money.of(session.rows[0]!.assigned_price).eq('420.26')).toBe(true);
    expect(Money.of(session.rows[0]!.refund_amount).eq('79.74')).toBe(true);

    const owned = await client.query<{ n: number }>(
      `select count(*)::int as n from horses where owner_user_id = $1`,
      [buyer],
    );
    expect(owned.rows[0]!.n).toBe(3);

    const accounts = await ensureUserAccounts(client, buyer);
    expect(await getBalance(client, accounts.locked)).toBe('0.00000000');
    expect(await getBalance(client, accounts.available)).toBe('79.74000000');

    // 冪等: 再実行しても割当・台帳は変わらない
    await executeAssignment(client, executeInput(batchRunId));
    const owned2 = await client.query<{ n: number }>(
      `select count(*)::int as n from horses where owner_user_id = $1`,
      [buyer],
    );
    expect(owned2.rows[0]!.n).toBe(3);
    expect(await getBalance(client, accounts.available)).toBe('79.74000000');

    const report = await reconcile(client);
    expect(report.issues).toEqual([]);
  });

  it('skips an unaffordable listing to the next buyer and fills with mints (Decision 103)', async () => {
    const batchRunId = await newBatch();
    const seller = await newUser();
    // 先頭: Day6 177.16 / 次: Day1 110.00
    await newListedHorse(seller, 6, batchRunId, '2037-01-02T01:00:00Z');
    await newListedHorse(seller, 1, batchRunId, '2037-01-02T02:00:00Z');

    // 予算120(先頭を買えない→ミント充填)と予算400(両方買える)。
    // どちらの抽選順でも: 出品2頭は必ず売れ、ミントは各1頭ずつ、余りは18 / 10.84。
    const small = await newUser();
    await fund(small, '120');
    const smallPool = await createOrUpdatePoolSession(client, {
      userId: small, amount: '120', idempotencyKey: randomUUID(),
    });
    const big = await newUser();
    await fund(big, '400');
    const bigPool = await createOrUpdatePoolSession(client, {
      userId: big, amount: '400', idempotencyKey: randomUUID(),
    });
    await lockSessionsIntoBatch(client, batchRunId);

    const result = await executeAssignment(client, executeInput(batchRunId));
    expect(result.p2pAssignments).toBe(2); // 出品はチャンスを失わない
    expect(result.day0Mints).toBe(2);
    expect(result.unassigned).toBe(0);

    const rows = await client.query<{ id: string; refund_amount: string; assigned_price: string }>(
      `select id, refund_amount::text as refund_amount, assigned_price::text as assigned_price
       from purchase_sessions where id in ($1, $2)`,
      [smallPool.sessionId, bigPool.sessionId],
    );
    const byId = new Map(rows.rows.map((r) => [r.id, r]));
    // small: ミント1頭(102)+ 余り18 / big: 177.16 + 110.00 + ミント102 = 389.16 + 余り10.84
    expect(Money.of(byId.get(smallPool.sessionId)!.refund_amount).eq('18')).toBe(true);
    expect(Money.of(byId.get(smallPool.sessionId)!.assigned_price).eq('102')).toBe(true);
    expect(Money.of(byId.get(bigPool.sessionId)!.refund_amount).eq('10.84')).toBe(true);
    expect(Money.of(byId.get(bigPool.sessionId)!.assigned_price).eq('389.16')).toBe(true);

    // ミント馬は総合値(40〜75)を持って生まれる(V2 Decision 101との結線)
    const minted = await client.query<{ total_value: string }>(
      `select total_value::text as total_value from horses
       where owner_user_id in ($1, $2) and total_value is not null`,
      [small, big],
    );
    expect(minted.rows.length).toBe(2);
    for (const m of minted.rows) {
      expect(Number(m.total_value)).toBeGreaterThanOrEqual(40);
      expect(Number(m.total_value)).toBeLessThanOrEqual(75);
    }

    // 準備金配分(Step 26)もプールのミントぶん実行できる
    const allocations = await executeReserveAllocations(client, batchRunId);
    expect(allocations).toBe(2);

    const report = await reconcile(client);
    expect(report.issues).toEqual([]);
  });
});
