import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  purchaseFundLock,
  day0MintSettlement,
  reserveAllocation,
  ensureUserAccounts,
  getBalance,
  getPlatformAccountId,
} from '@sevendays/ledger';
import { enqueueChampionCelebrations, payPendingCelebrations } from '../src/index.js';

/**
 * チャンピオン祝い金 (Decision 092)。
 * 財源はミント時のRESERVE_ALLOCATION(5.40/頭)— beforeAllでミントフローを
 * 流してPLATFORM_MLM_RESERVE(プール)を積む。支払いはDAY7_CLEAREDの
 * チャンピオン×7ティアのキューをFIFOで消化し、プール残高が上限。
 */

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

/** ミントフロー1周 = プールへ 5.40 USDT。 */
async function fundPool(times: number): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    const buyer = await newUser();
    await depositConfirmation(client, {
      userId: buyer,
      amount: Money.of('102'),
      idempotencyKey: randomUUID(),
    });
    await purchaseFundLock(client, { userId: buyer, amount: Money.of('102'), idempotencyKey: randomUUID() });
    await day0MintSettlement(client, { buyerUserId: buyer, idempotencyKey: randomUUID() });
    await reserveAllocation(client, { idempotencyKey: randomUUID() });
  }
}

async function poolBalance(): Promise<string> {
  return getBalance(client, await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE'));
}

async function newUser(referrerId?: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email, direct_referrer_user_id) values ($1, $2) returning id`,
    [`${randomUUID()}@test.dev`, referrerId ?? null],
  );
  return r.rows[0]!.id;
}

async function placeUnder(childId: string, parentId: string): Promise<void> {
  await client.query(`update users set placement_parent_user_id = $1 where id = $2`, [
    parentId,
    childId,
  ]);
}

/** ACTIVE馬(ティアボリューム用・Day0=100 USDT)。 */
async function newHorse(ownerId: string, typeIndex = 0): Promise<string> {
  const types = ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'];
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, $3::horse_type, 'COMMON', $4, 1.00, 'horse_generation_v1.0', $5, $6)
     returning id`,
    [
      ownerId,
      `Celeb Test ${randomUUID().slice(0, 12)}`,
      types[typeIndex % types.length],
      randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
      JSON.stringify({ speed: 70, power: 72, stamina: 75, recovery: 74, luck: 68 }),
    ],
  );
  return r.rows[0]!.id;
}

/** チャンピオン(挿入時にDAY7_CLEARED — UPDATEガードは挿入には効かない)。 */
async function newChampion(ownerId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, status, current_day)
     values ($1, $2, 'BALANCED', 'COMMON', $3, 1.00, 'horse_generation_v1.0', $4, $5, 'DAY7_CLEARED', 7)
     returning id`,
    [
      ownerId,
      `Champion ${randomUUID().slice(0, 12)}`,
      randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
      JSON.stringify({ speed: 70, power: 72, stamina: 75, recovery: 74, luck: 68 }),
    ],
  );
  return r.rows[0]!.id;
}

describe('champion celebrations (Decision 092)', () => {
  it('enqueues 7 tiers per champion and pays the qualified chain from the pool', async () => {
    await fundPool(4); // +21.60

    // Chain (top to bottom): A <- B <- C <- champion owner.
    // C: Tier 1 unconditional. B: needs T2 (org >= 10,000). A: T3 locked.
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    await placeUnder(b, a);
    await placeUnder(c, b);
    const owner = await newUser(c);
    await placeUnder(owner, c);

    // B's org volume: a placed member holding 100 Day0 horses = 10,000 -> T2.
    const bMember = await newUser(b);
    await placeUnder(bMember, b);
    for (let i = 0; i < 100; i += 1) await newHorse(bMember, i);

    const champion = await newChampion(owner);
    const enq = await enqueueChampionCelebrations(client, { batchDate: '2033-02-01' });
    expect(enq.championsEnqueued).toBe(1);

    const rows = await client.query<{ tier: number; amount: string; status: string }>(
      `select tier, amount::text as amount, status from support_celebrations
       where horse_id = $1 order by tier`,
      [champion],
    );
    expect(rows.rows.map((r) => r.tier)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.rows.map((r) => Number(r.amount))).toEqual([3, 2, 1, 1, 1, 1, 1]);

    const result = await payPendingCelebrations(client);
    // C: T1 3.00 / B: T2 2.00 paid; T3 has ancestor A but org < 20,000 ->
    // UNCLAIMED; T4-7 have no ancestors -> UNCLAIMED. Nothing carries over.
    expect(result.paid).toBe(2);
    expect(result.unclaimed).toBe(5);
    expect(result.carriedOver).toBe(0);

    const [accA, accB, accC] = await Promise.all([
      ensureUserAccounts(client, a),
      ensureUserAccounts(client, b),
      ensureUserAccounts(client, c),
    ]);
    expect(await getBalance(client, accC.available)).toBe('3.00000000');
    expect(await getBalance(client, accB.available)).toBe('2.00000000');
    expect(await getBalance(client, accA.available)).toBe('0');
    expect(await poolBalance()).toBe('16.60000000'); // 21.60 - 5.00

    // The celebration copy reached the paid ancestors (R3-compliant).
    const notif = await client.query<{ user_id: string; payload_json: { title: string } }>(
      `select user_id, payload_json from notifications
       where notification_type = 'SUPPORT_CELEBRATION_PAID' and user_id = any($1)`,
      [[a, b, c]],
    );
    expect(notif.rows.map((r) => r.user_id).sort()).toEqual([b, c].sort());
    expect(notif.rows[0]!.payload_json.title).toBe('あなたの組織からチャンピオンが誕生しました。');

    // Replay converges: no double pay, no new rows.
    const replayEnq = await enqueueChampionCelebrations(client, { batchDate: '2033-02-02' });
    expect(replayEnq.championsEnqueued).toBe(0);
    const replay = await payPendingCelebrations(client);
    expect(replay.paid).toBe(0);
    expect(await getBalance(client, accC.available)).toBe('3.00000000');
    expect(await poolBalance()).toBe('16.60000000');
  });

  it('carries over FIFO when the pool cannot cover, then pays after refunding', async () => {
    // Drain the pool to 0 for this scenario by paying it out via a synthetic
    // celebration chain? Simpler: compute what's left and consume it exactly.
    // Current pool = 16.60 (from the previous test). Build a chain that can
    // absorb it: sponsor S with T1 (3.00 per champion).
    const s = await newUser();
    const owner = await newUser(s);
    await placeUnder(owner, s);

    // 6 champions -> 6 x T1(3.00) = 18.00 > 16.60. Tiers 2-7 are UNCLAIMED
    // (no ancestors). FIFO pays 5 T1s (15.00); the 6th T1 halts the run, so
    // it AND the 6th champion's remaining tiers carry over unjudged (order
    // preservation: nothing after the halt is settled).
    for (let i = 0; i < 6; i += 1) await newChampion(owner);
    await enqueueChampionCelebrations(client, { batchDate: '2033-02-03' });
    const result = await payPendingCelebrations(client);
    expect(result.paid).toBe(5);
    expect(result.unclaimed).toBe(30); // champions 1-5 x tiers 2-7
    expect(result.carriedOver).toBe(7); // champion 6: t1 (no funds) + t2-7 (behind the halt)
    expect(await poolBalance()).toBe('1.60000000');

    const accS = await ensureUserAccounts(client, s);
    expect(await getBalance(client, accS.available)).toBe('15.00000000');

    // Pool refills (one mint flow = +5.40) -> the carried-over T1 pays and
    // the champion's remaining tiers settle as UNCLAIMED.
    await fundPool(1);
    const drained = await payPendingCelebrations(client);
    expect(drained.paid).toBe(1);
    expect(drained.unclaimed).toBe(6);
    expect(drained.carriedOver).toBe(0);
    expect(await getBalance(client, accS.available)).toBe('18.00000000');
    expect(await poolBalance()).toBe('4.00000000'); // 1.60 + 5.40 - 3.00

    const pending = await client.query<{ n: string }>(
      `select count(*)::text as n from support_celebrations where status = 'PENDING'`,
    );
    expect(pending.rows[0]!.n).toBe('0');
  });

  it('BANNED ancestors are UNCLAIMED and the money stays in the pool', async () => {
    const banned = await newUser();
    const owner = await newUser(banned);
    await placeUnder(owner, banned);
    await client.query(`update users set status = 'BANNED' where id = $1`, [banned]);

    const before = await poolBalance();
    await newChampion(owner);
    await enqueueChampionCelebrations(client, { batchDate: '2033-02-04' });
    const result = await payPendingCelebrations(client);
    expect(result.paid).toBe(0);
    expect(result.unclaimed).toBe(7);
    expect(await poolBalance()).toBe(before);
  });

  it('settled celebrations are immutable (DB guard)', async () => {
    const paidRow = await client.query<{ id: string }>(
      `select id from support_celebrations where status = 'PAID' limit 1`,
    );
    await expect(
      client.query(`update support_celebrations set status = 'PENDING' where id = $1`, [
        paidRow.rows[0]!.id,
      ]),
    ).rejects.toThrow(/SETTLED_CELEBRATION_IMMUTABLE/);
    await expect(
      client.query(`delete from support_celebrations where id = $1`, [paidRow.rows[0]!.id]),
    ).rejects.toThrow(/CELEBRATION_DELETE_FORBIDDEN/);
  });
});
