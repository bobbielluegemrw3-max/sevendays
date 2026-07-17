import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, expectDbError } from '@sevendays/database';
import { Money, addDays, mytWeekStart, mytWeekdayIndex, sha256Hex } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { getBalance, getPlatformAccountId, getUserAccountId, postTransaction } from '@sevendays/ledger';
import {
  createBatchRun,
  ensureJackpotDraw,
  loadJackpotSettings,
  pickJackpotWinners,
  resolveJackpotDrawIfDue,
} from '../src/index.js';

/**
 * 週次ジャックポット (V2実装-5, Decision 106/108):
 * 週=月曜MORNING〜日曜NIGHT・チケット=(effective_race_date, slot)帰属・
 * commit-reveal検証可能・原資=広告費口座のみ・不成立/中止は繰越なし。
 */

let client: SqlClient;

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

async function newHorse(ownerId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, 'BALANCED', 'COMMON', $3, 0.50, 'horse_generation_v1.0', $4, '{}'::jsonb)
     returning id`,
    [ownerId, `JP Test ${randomUUID().slice(0, 13)}`, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')],
  );
  return r.rows[0]!.id;
}

/** 調教確定=チケット1枚(V1形式の行で十分 — 集計は行数のみを見る)。 */
async function addTicket(userId: string, horseId: string, effectiveRaceDate: string, slot: 'MORNING' | 'NIGHT' = 'NIGHT'): Promise<void> {
  await client.query(
    `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date, slot)
     values ($1, $2, 'SPEED_TRAINING', $3, $3, $4::race_slot)`,
    [horseId, userId, effectiveRaceDate, slot],
  );
}

async function fundMarketingBudget(amount: string): Promise<void> {
  const clearing = await getPlatformAccountId(client, 'PLATFORM_DEPOSIT_CLEARING');
  const budget = await getPlatformAccountId(client, 'PLATFORM_MARKETING_BUDGET');
  await postTransaction(client, {
    type: 'ADMIN_ADJUSTMENT',
    idempotencyKey: `test-fund-marketing:${randomUUID()}`,
    entries: [
      { accountId: clearing, direction: 'DEBIT', amount: Money.of(amount) },
      { accountId: budget, direction: 'CREDIT', amount: Money.of(amount) },
    ],
  });
}

async function setJackpotSettings(value: { enabled: boolean; prize_usdt: string; winners: number }): Promise<void> {
  await client.query(`update system_settings set value = $2 where key = $1`, ['jackpot', JSON.stringify(value)]);
}

async function marketingBalance(): Promise<Money> {
  return Money.of(await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_MARKETING_BUDGET')));
}

/** テストごとに別の週を使う(週ユニーク)。base日を含む週の月曜と日曜を返す。 */
function weekOf(base: string): { start: string; sunday: string } {
  const start = mytWeekStart(base);
  return { start, sunday: addDays(start, 6) };
}

/** 解決は本物の日曜NIGHTバッチrunに紐付ける(FK)。(date,slot)冪等なので再取得も安全。 */
async function sundayNightRun(sunday: string): Promise<string> {
  return createBatchRun(client, sunday, 'NIGHT');
}

describe('jackpot draw lifecycle (Decision 106/108)', () => {
  it('ensureJackpotDraw creates one committed draw per week, idempotently and verifiably', async () => {
    const { start, sunday } = weekOf('2036-05-13');
    const id1 = await ensureJackpotDraw(client, { batchDate: '2036-05-13' });
    // 同じ週のどの日から呼んでも同じ抽選行
    const id2 = await ensureJackpotDraw(client, { batchDate: sunday });
    expect(id2).toBe(id1);

    const draw = await client.query<{ week_start_date: string; week_end_date: string; status: string; commit_hash: string; seed: string }>(
      `select d.week_start_date::text as week_start_date, d.week_end_date::text as week_end_date,
              d.status, rc.commit_hash, e.seed
       from jackpot_draws d
       join randomness_commits rc on rc.id = d.seed_commit_id
       join jackpot_seed_escrow e on e.draw_id = d.id
       where d.id = $1`,
      [id1],
    );
    const row = draw.rows[0]!;
    expect(row.week_start_date).toBe(start);
    expect(row.week_end_date).toBe(sunday);
    expect(mytWeekdayIndex(row.week_start_date)).toBe(0); // 月曜
    expect(mytWeekdayIndex(row.week_end_date)).toBe(6); // 日曜
    expect(row.status).toBe('COMMITTED');
    // commit-reveal: エスクロー済みシードがコミットと一致(誰でも後から検証できる)
    expect(sha256Hex(row.seed)).toBe(row.commit_hash.toLowerCase());
  });

  it('resolve is a no-op except on the Sunday NIGHT batch', async () => {
    const { start, sunday } = weekOf('2036-06-03');
    expect(await resolveJackpotDrawIfDue(client, { batchDate: start, slot: 'NIGHT', batchRunId: randomUUID() })).toBeNull();
    expect(await resolveJackpotDrawIfDue(client, { batchDate: sunday, slot: 'MORNING', batchRunId: randomUUID() })).toBeNull();
    const rows = await client.query<{ status: string }>(
      `select status from jackpot_draws where week_start_date = $1`,
      [start],
    );
    // no-opでは抽選行も作らない(週の作成は ensureJackpotDraw の役目)
    expect(rows.rows).toHaveLength(0);
  });

  it('disabled settings (the default) close the week as SKIPPED_DISABLED and freeze the row', async () => {
    const { sunday } = weekOf('2036-06-10');
    // 既定行は enabled=false(マイグレーション・弁護士ゲート/§7-5)
    const settings = await loadJackpotSettings(client);
    expect(settings.enabled).toBe(false);

    const result = await resolveJackpotDrawIfDue(client, { batchDate: sunday, slot: 'NIGHT', batchRunId: await sundayNightRun(sunday) });
    expect(result!.status).toBe('SKIPPED_DISABLED');
    expect(result!.winners).toHaveLength(0);

    // 再実行=同じ終端を報告するだけ(冪等)
    const again = await resolveJackpotDrawIfDue(client, { batchDate: sunday, slot: 'NIGHT', batchRunId: await sundayNightRun(sunday) });
    expect(again!.status).toBe('SKIPPED_DISABLED');

    // resolved後は行全体が凍結(DBガード)
    await expectDbError(
      client.query(`update jackpot_draws set status = 'PAID' where id = $1`, [result!.drawId]),
      'JACKPOT_DRAW_IMMUTABLE',
    );
  });

  it('a week with zero tickets is VOID_NO_TICKETS — no draw, no money movement, no carry-over', async () => {
    const { sunday } = weekOf('2036-06-17');
    await setJackpotSettings({ enabled: true, prize_usdt: '100.00', winners: 1 });
    const before = await marketingBalance();

    const result = await resolveJackpotDrawIfDue(client, { batchDate: sunday, slot: 'NIGHT', batchRunId: await sundayNightRun(sunday) });
    expect(result!.status).toBe('VOID_NO_TICKETS');
    expect(result!.totalTickets).toBe(0);
    expect((await marketingBalance()).toFixed8()).toBe(before.toFixed8());

    // reveal もしない(コミットは立ったまま)
    const commit = await client.query<{ reveal_seed: string | null }>(
      `select rc.reveal_seed from jackpot_draws d join randomness_commits rc on rc.id = d.seed_commit_id
       where d.id = $1`,
      [result!.drawId],
    );
    expect(commit.rows[0]!.reveal_seed).toBeNull();
  });

  it('pays the deterministic winner from the revealed seed, idempotently across re-runs', async () => {
    const { start, sunday } = weekOf('2036-07-08');
    await setJackpotSettings({ enabled: true, prize_usdt: '100.00', winners: 1 });
    await fundMarketingBudget('100');

    const userA = await newUser();
    const userB = await newUser();
    const horseA = await newHorse(userA);
    const horseB = await newHorse(userB);
    // A=3枚(週内3サイクル)・B=1枚。週外(翌週月曜)の確定は数えない
    await addTicket(userA, horseA, start);
    await addTicket(userA, horseA, addDays(start, 1));
    await addTicket(userA, horseA, addDays(start, 2), 'MORNING');
    await addTicket(userB, horseB, sunday);
    await addTicket(userB, horseB, addDays(sunday, 1)); // 翌週分 — 対象外

    const budgetBefore = await marketingBalance();
    const result = await resolveJackpotDrawIfDue(client, { batchDate: sunday, slot: 'NIGHT', batchRunId: await sundayNightRun(sunday) });
    expect(result!.status).toBe('PAID');
    expect(result!.totalTickets).toBe(4);
    expect(result!.winners).toHaveLength(1);

    // 当選者は revealed seed から誰でも再計算できる
    const revealed = await client.query<{ reveal_seed: string; commit_hash: string }>(
      `select rc.reveal_seed, rc.commit_hash from jackpot_draws d
       join randomness_commits rc on rc.id = d.seed_commit_id where d.id = $1`,
      [result!.drawId],
    );
    const seed = revealed.rows[0]!.reveal_seed;
    expect(sha256Hex(seed)).toBe(revealed.rows[0]!.commit_hash.toLowerCase());
    const entries = [
      { userId: userA, tickets: 3 },
      { userId: userB, tickets: 1 },
    ].sort((a, b) => (a.userId < b.userId ? -1 : 1));
    const expected = pickJackpotWinners(seed, entries, 1);
    expect(result!.winners[0]!.userId).toBe(expected[0]!.userId);
    expect(result!.winners[0]!.ticketIndex).toBe(expected[0]!.ticketIndex);

    // 台帳: 広告費 −100 → 当選者 +100・当選行・通知
    const winnerId = result!.winners[0]!.userId;
    expect(budgetBefore.sub(await marketingBalance()).toFixed8()).toBe('100.00000000');
    const winnerAvailable = Money.of(await getBalance(client, await getUserAccountId(client, winnerId, 'USER_AVAILABLE')));
    expect(winnerAvailable.toFixed8()).toBe('100.00000000');
    const notif = await client.query<{ n: string }>(
      `select count(*)::text as n from notifications
       where user_id = $1 and notification_type = 'JACKPOT_WON'`,
      [winnerId],
    );
    expect(notif.rows[0]!.n).toBe('1');

    // 再実行: 二重払いなし・同じ当選者を報告
    const again = await resolveJackpotDrawIfDue(client, { batchDate: sunday, slot: 'NIGHT', batchRunId: await sundayNightRun(sunday) });
    expect(again!.status).toBe('PAID');
    expect(again!.winners[0]!.userId).toBe(winnerId);
    expect(budgetBefore.sub(await marketingBalance()).toFixed8()).toBe('100.00000000');

    // 当選行は不変(更新拒否)
    await expectDbError(
      client.query(`update jackpot_winners set amount = 1 where draw_id = $1`, [result!.drawId]),
      'IMMUTABLE_RECORD',
    );
  });

  it('cancels the week when the marketing budget cannot cover the prize (no partial payout, no carry-over)', async () => {
    // 前テストの「翌週分」チケットと重ならない離れた週を使う
    const { start, sunday } = weekOf('2036-08-12');
    await setJackpotSettings({ enabled: true, prize_usdt: '100.00', winners: 1 });
    // 前テストで残高は0に戻っている(差分でも確認)
    const before = await marketingBalance();
    expect(before.lt(Money.of('100'))).toBe(true);

    const user = await newUser();
    const horse = await newHorse(user);
    await addTicket(user, horse, start);

    const result = await resolveJackpotDrawIfDue(client, { batchDate: sunday, slot: 'NIGHT', batchRunId: await sundayNightRun(sunday) });
    expect(result!.status).toBe('CANCELLED_BUDGET');
    expect(result!.totalTickets).toBe(1);
    expect(result!.winners).toHaveLength(0);
    expect((await marketingBalance()).toFixed8()).toBe(before.toFixed8());
  });
});

describe('pickJackpotWinners (pure, verifiable)', () => {
  const entries = [
    { userId: '00000000-0000-4000-8000-000000000001', tickets: 3 },
    { userId: '00000000-0000-4000-8000-000000000002', tickets: 1 },
    { userId: '00000000-0000-4000-8000-000000000003', tickets: 6 },
  ];

  it('is deterministic for the same seed and ticket list', () => {
    const a = pickJackpotWinners('seed-abc', entries, 1);
    const b = pickJackpotWinners('seed-abc', entries, 1);
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
    expect(a[0]!.ticketIndex).toBeGreaterThanOrEqual(0);
    expect(a[0]!.ticketIndex).toBeLessThan(10);
  });

  it('maps the winning ticket index into the cumulative count walk', () => {
    const picks = pickJackpotWinners('seed-walk', entries, 1);
    const idx = picks[0]!.ticketIndex;
    const expectedUser = idx < 3 ? entries[0]!.userId : idx < 4 ? entries[1]!.userId : entries[2]!.userId;
    expect(picks[0]!.userId).toBe(expectedUser);
  });

  it('draws distinct users for multiple winners and caps at the distinct-user count', () => {
    const two = pickJackpotWinners('seed-multi', entries, 2);
    expect(two).toHaveLength(2);
    expect(new Set(two.map((w) => w.userId)).size).toBe(2);
    const all = pickJackpotWinners('seed-multi', entries, 10);
    expect(all).toHaveLength(3); // 実在ユーザー数が上限
  });

  it('returns nothing for an empty ticket list', () => {
    expect(pickJackpotWinners('seed-empty', [], 1)).toEqual([]);
  });
});
