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
import { computeStarterT1Rate, enqueueChampionCelebrations, payPendingCelebrations } from '../src/index.js';

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
    // Decision 099: C's org volume is 0 (the champion is not ACTIVE), so the
    // tier-1 amount is the starter-rate MAX 8.00; tiers 2-7 are unchanged.
    expect(rows.rows.map((r) => Number(r.amount))).toEqual([8, 2, 1, 1, 1, 1, 1]);

    const result = await payPendingCelebrations(client);
    // C: T1 8.00 / B: T2 2.00 paid; T3 has ancestor A but org < 20,000 ->
    // UNCLAIMED; T4-7 have no ancestors -> UNCLAIMED. Nothing carries over.
    expect(result.paid).toBe(2);
    expect(result.unclaimed).toBe(5);
    expect(result.carriedOver).toBe(0);

    const [accA, accB, accC] = await Promise.all([
      ensureUserAccounts(client, a),
      ensureUserAccounts(client, b),
      ensureUserAccounts(client, c),
    ]);
    expect(await getBalance(client, accC.available)).toBe('8.00000000');
    expect(await getBalance(client, accB.available)).toBe('2.00000000');
    expect(await getBalance(client, accA.available)).toBe('0');
    expect(await poolBalance()).toBe('11.60000000'); // 21.60 - 10.00

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
    expect(await getBalance(client, accC.available)).toBe('8.00000000');
    expect(await poolBalance()).toBe('11.60000000');
  });

  it('carries over FIFO when the pool cannot cover, then pays after refunding', async () => {
    // Current pool = 11.60 (from the previous test). Build a chain that can
    // absorb it: sponsor S at the starter-rate FLOOR — a placed member holding
    // 500 Day0 horses gives S org volume 50,000, so T1 = 3.00 (Decision 099
    // floor = the pre-099 amount; also pins this test's arithmetic).
    const s = await newUser();
    const owner = await newUser(s);
    await placeUnder(owner, s);
    const sMember = await newUser(s);
    await placeUnder(sMember, s);
    for (let i = 0; i < 500; i += 1) await newHorse(sMember, i);

    // 6 champions -> 6 x T1(3.00) = 18.00 > 11.60. Tiers 2-7 are UNCLAIMED
    // (no ancestors). FIFO pays 3 T1s (9.00); the 4th T1 halts the run, so
    // it AND everything behind it carries over unjudged (order preservation).
    for (let i = 0; i < 6; i += 1) await newChampion(owner);
    await enqueueChampionCelebrations(client, { batchDate: '2033-02-03' });
    const result = await payPendingCelebrations(client);
    expect(result.paid).toBe(3);
    expect(result.unclaimed).toBe(18); // champions 1-3 x tiers 2-7
    expect(result.carriedOver).toBe(21); // champions 4-6: everything behind the halt
    expect(await poolBalance()).toBe('2.60000000');

    const accS = await ensureUserAccounts(client, s);
    expect(await getBalance(client, accS.available)).toBe('9.00000000');

    // Pool refills (two mint flows = +10.80) -> the carried-over T1s pay and
    // the champions' remaining tiers settle as UNCLAIMED.
    await fundPool(2);
    const drained = await payPendingCelebrations(client);
    expect(drained.paid).toBe(3);
    expect(drained.unclaimed).toBe(18);
    expect(drained.carriedOver).toBe(0);
    expect(await getBalance(client, accS.available)).toBe('18.00000000');
    expect(await poolBalance()).toBe('4.40000000'); // 2.60 + 10.80 - 9.00

    const pending = await client.query<{ n: string }>(
      `select count(*)::text as n from support_celebrations where status = 'PENDING'`,
    );
    expect(pending.rows[0]!.n).toBe('0');
  });

  it('starter rate (Decision 099): the tier-1 amount follows the ancestor org volume', async () => {
    // P's org: a placed member holding 200 Day0 horses = 20,000 -> 150000/20000 = 7.50.
    const p = await newUser();
    const owner = await newUser(p);
    await placeUnder(owner, p);
    const pMember = await newUser(p);
    await placeUnder(pMember, p);
    for (let i = 0; i < 200; i += 1) await newHorse(pMember, i);

    const champion = await newChampion(owner);
    await enqueueChampionCelebrations(client, { batchDate: '2033-02-05' });
    const row = await client.query<{ amount: string }>(
      `select amount::text as amount from support_celebrations where horse_id = $1 and tier = 1`,
      [champion],
    );
    expect(Number(row.rows[0]!.amount)).toBe(7.5);
    // 額は起票時に確定 — 後から組織が変わっても行は不変(DBガードで担保)。
  });

  it('computeStarterT1Rate: clamp(150000/org, 3, 8) in exact cents math', () => {
    expect(computeStarterT1Rate('0')).toBe('8.00');
    expect(computeStarterT1Rate('100.00')).toBe('8.00');
    expect(computeStarterT1Rate('18750.00')).toBe('8.00'); // 150000/18750 = 8 ちょうど
    expect(computeStarterT1Rate('20000.00')).toBe('7.50');
    expect(computeStarterT1Rate('40000.00')).toBe('3.75');
    expect(computeStarterT1Rate('43000.00')).toBe('3.49'); // 3.4883… → half-up
    expect(computeStarterT1Rate('50000.00')).toBe('3.00'); // 下限到達
    expect(computeStarterT1Rate('600000.00')).toBe('3.00'); // 下限で固定
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
