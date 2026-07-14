import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { computeHiddenLooks } from '../src/hidden/looks.js';

/**
 * 隠し演出ルック(真夜中の馬・黄金の夜・EASTER_EGG_PLAN.md)。
 * 不変の記録(予約時刻・レースシードのcommit_hash・生存)から、コスメティックな
 * ルックフラグを決定論的に判定する読み取り専用ロジックの単体テスト。
 */

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`, [`${randomUUID()}@look.dev`],
  );
  return r.rows[0]!.id;
}

async function newHorse(userId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, 'BALANCED', 'COMMON', $3, 1.00, 'horse_generation_v1.0', $4, $5) returning id`,
    [userId, `H ${randomUUID().slice(0, 8)}`, randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''), JSON.stringify({ speed: 70, power: 70, stamina: 70, recovery: 70, luck: 70 })],
  );
  return r.rows[0]!.id;
}

/** Day0新規発行の割当を、指定UTC時刻の予約から作る。 */
async function mintFromReservation(userId: string, horseId: string, reservedAtUtc: string): Promise<void> {
  const ps = await client.query<{ id: string }>(
    `insert into purchase_sessions (user_id, locked_amount, status, created_at, idempotency_key)
     values ($1, 177.16, 'ASSIGNED', $2, $3) returning id`,
    [userId, reservedAtUtc, `look:${randomUUID()}`],
  );
  const b = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ('2042-01-01', 'batch_v1.0')
     on conflict do nothing returning id`,
  );
  const batchId = b.rows[0]?.id
    ?? (await client.query<{ id: string }>(`select id from batch_runs where batch_date = '2042-01-01'`)).rows[0]!.id;
  await client.query(
    `insert into ownership_assignments (batch_run_id, purchase_session_id, market_listing_id, horse_id,
                                        buyer_user_id, assigned_price, status)
     values ($1, $2, null, $3, $4, 100, 'PENDING')`,
    [batchId, ps.rows[0]!.id, horseId, userId],
  );
}

/** 指定seedのレースで、その馬が生存 or BURN した結果を記録する。 */
async function raceWithSeed(userId: string, horseId: string, seed: string, burned: boolean, date: string): Promise<void> {
  const commitHash = createHash('sha256').update(seed).digest('hex');
  const b = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0')
     on conflict do nothing returning id`, [date],
  );
  const batchId = b.rows[0]?.id
    ?? (await client.query<{ id: string }>(`select id from batch_runs where batch_date = $1`, [date])).rows[0]!.id;
  const commit = await client.query<{ id: string }>(
    `insert into randomness_commits (reference_type, reference_id, commit_hash, reveal_seed)
     values ('RACE', $1, $2, $3) returning id`,
    [randomUUID(), commitHash, seed],
  );
  const race = await client.query<{ id: string }>(
    `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
     values ($1, 'race_v1.0', $2, 'FINALIZED') returning id`,
    [batchId, commit.rows[0]!.id],
  );
  await client.query(
    `insert into race_results (race_id, horse_id, final_score, deterministic_tiebreak_score, final_rank, is_burned)
     values ($1, $2, 100, 0, 1, $3)`,
    [race.rows[0]!.id, horseId, burned],
  );
}

/** commit_hash が '77' で始まる seed をブルートフォースで見つける(テスト固定)。 */
function goldenSeed(): string {
  for (let i = 0; i < 100000; i += 1) {
    const s = `golden-${i}`;
    if (createHash('sha256').update(s).digest('hex').startsWith('77')) return s;
  }
  throw new Error('no golden seed found');
}
/** '77' で始まらない seed。 */
function plainSeed(): string {
  for (let i = 0; i < 100000; i += 1) {
    const s = `plain-${i}`;
    if (!createHash('sha256').update(s).digest('hex').startsWith('77')) return s;
  }
  throw new Error('no plain seed found');
}

describe('hidden looks (EASTER_EGG_PLAN.md)', () => {
  it('真夜中の馬: 予約が 02:22 MYT(=18:22 UTC前日)なら night_variant', async () => {
    const u = await newUser();
    const nightH = await newHorse(u);
    const dayH = await newHorse(u);
    // 02:22 MYT = 前日 18:22 UTC
    await mintFromReservation(u, nightH, '2042-01-14T18:22:30.000Z');
    // 02:23 MYT(1分ズレ)は対象外
    await mintFromReservation(u, dayH, '2042-01-14T18:23:00.000Z');

    const looks = await computeHiddenLooks(client, [nightH, dayH]);
    expect(looks.get(nightH)!.nightVariant).toBe(true);
    expect(looks.get(dayH)!.nightVariant).toBe(false);
  });

  it('黄金の夜: seed hash が秘密パターンの夜に生存した馬は golden_star', async () => {
    const u = await newUser();
    const gold = await newHorse(u);
    const plain = await newHorse(u);
    const burnedInGold = await newHorse(u);

    await raceWithSeed(u, gold, goldenSeed(), false, '2042-02-01'); // 黄金の夜に生存
    await raceWithSeed(u, plain, plainSeed(), false, '2042-02-02'); // 普通の夜に生存
    await raceWithSeed(u, burnedInGold, goldenSeed(), true, '2042-02-03'); // 黄金の夜だがBURN

    const looks = await computeHiddenLooks(client, [gold, plain, burnedInGold]);
    expect(looks.get(gold)!.goldenStar).toBe(true);
    expect(looks.get(plain)!.goldenStar).toBe(false);
    expect(looks.get(burnedInGold)!.goldenStar).toBe(false);
  });

  it('該当なしは両フラグ false・空配列は空Map', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    const looks = await computeHiddenLooks(client, [h]);
    expect(looks.get(h)).toEqual({ nightVariant: false, goldenStar: false });
    expect((await computeHiddenLooks(client, [])).size).toBe(0);
  });
});
