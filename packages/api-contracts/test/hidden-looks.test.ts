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
  // 黄金の夜は「その夜 viewer が所有していた」判定 → snapshot の所有者を入れる。
  await snapshot(race.rows[0]!.id, horseId, userId);
  await client.query(
    `insert into race_results (race_id, horse_id, final_score, deterministic_tiebreak_score, final_rank, is_burned)
     values ($1, $2, 100, 0, 1, $3)`,
    [race.rows[0]!.id, horseId, burned],
  );
}

/** 最小の参加スナップショット(所有者帰属の判定に必要)。 */
async function snapshot(raceId: string, horseId: string, ownerId: string): Promise<void> {
  await client.query(
    `insert into race_participant_snapshots
       (race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash,
        ability_snapshot_json, weather, track_condition, race_engine_version,
        liquidity_policy_version, price_table_version, race_seed_hash, snapshot_hash)
     values ($1, $2, $3, 3, 'BALANCED', 'COMMON', $4, '{}'::jsonb, 'RAIN', 'SOFT', 'race_v1.0',
             'liq_v1.0', 'price_v1.0', $5, $6)`,
    [raceId, horseId, ownerId, randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')],
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

    const looks = await computeHiddenLooks(client, [nightH, dayH], u);
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

    const looks = await computeHiddenLooks(client, [gold, plain, burnedInGold], u);
    expect(looks.get(gold)!.goldenStar).toBe(true);
    expect(looks.get(plain)!.goldenStar).toBe(false);
    expect(looks.get(burnedInGold)!.goldenStar).toBe(false);
  });

  it('該当なしは全フラグ空・空配列は空Map', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    const lk = (await computeHiddenLooks(client, [h], u)).get(h)!;
    expect(lk.nightVariant).toBe(false);
    expect(lk.goldenStar).toBe(false);
    expect(lk.colorVariant).toBeNull();
    expect((await computeHiddenLooks(client, [], u)).size).toBe(0);
  });

  it('原色ルート: 雨アイテムを雨で3回生存 → その馬が青に染まる', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    for (let i = 1; i <= 3; i += 1) {
      const d = `2043-01-0${i}`;
      const race = await raceCond(d, 'RAIN', 'SOFT', 'DIRT');
      await useItem(u, h, 'rain_hood', race, d, 'SURVIVED');
    }
    expect((await computeHiddenLooks(client, [h], u)).get(h)!.colorVariant).toBe('blue');
  });

  it('原色ルート: 2回では未達(色なし)', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    for (let i = 1; i <= 2; i += 1) {
      const d = `2043-02-0${i}`;
      const race = await raceCond(d, 'RAIN', 'SOFT', 'DIRT');
      await useItem(u, h, 'rain_hood', race, d, 'SURVIVED');
    }
    expect((await computeHiddenLooks(client, [h], u)).get(h)!.colorVariant).toBeNull();
  });

  it('原色ルート: Burnドロップで1回生存 → 黒(最優先)', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    const race = await raceCond('2043-03-01', 'SUNNY', 'GOOD', 'TURF');
    await useItem(u, h, 'spirit_roar', race, '2043-03-01', 'SURVIVED');
    expect((await computeHiddenLooks(client, [h], u)).get(h)!.colorVariant).toBe('black');
  });

  it('帰属修正(churn): 他人が2回・自分が1回では、自分視点で色は付かない', async () => {
    // 馬が売買で持ち主を跨いでも、積み重ねは「その人自身の行動」だけで数える。
    const owner1 = await newUser();
    const owner2 = await newUser();
    const h = await newHorse(owner1);
    // owner1 が雨で2回
    for (let i = 1; i <= 2; i += 1) {
      const d = `2043-04-0${i}`;
      const race = await raceCond(d, 'RAIN', 'SOFT', 'DIRT');
      await useItem(owner1, h, 'rain_hood', race, d, 'SURVIVED');
    }
    // 売却で owner2 に。owner2 は雨で1回
    const d3 = '2043-04-03';
    const race3 = await raceCond(d3, 'RAIN', 'SOFT', 'DIRT');
    await useItem(owner2, h, 'rain_hood', race3, d3, 'SURVIVED');

    // owner2 視点: 自分の分は1回だけ → 色は付かない(他人の2回は化けない)
    expect((await computeHiddenLooks(client, [h], owner2)).get(h)!.colorVariant).toBeNull();
    // owner1 視点でも自分の分は2回 → まだ付かない
    expect((await computeHiddenLooks(client, [h], owner1)).get(h)!.colorVariant).toBeNull();
    // owner2 がさらに2回積めば、owner2 自身の3回で色が付く
    for (let i = 4; i <= 5; i += 1) {
      const d = `2043-04-0${i}`;
      const race = await raceCond(d, 'RAIN', 'SOFT', 'DIRT');
      await useItem(owner2, h, 'rain_hood', race, d, 'SURVIVED');
    }
    expect((await computeHiddenLooks(client, [h], owner2)).get(h)!.colorVariant).toBe('blue');
  });
});

/* ---- 原色ルート用のヘルパー(条件つきレース + SETTLED item_usage) ---------- */
async function raceCond(date: string, weather: string, track: string, surface: string): Promise<string> {
  const b = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0')
     on conflict do nothing returning id`, [date],
  );
  const batchId = b.rows[0]?.id
    ?? (await client.query<{ id: string }>(`select id from batch_runs where batch_date = $1`, [date])).rows[0]!.id;
  const commit = await client.query<{ id: string }>(
    `insert into randomness_commits (reference_type, reference_id, commit_hash)
     values ('RACE', $1, $2) returning id`,
    [randomUUID(), randomUUID().replaceAll('-', '')],
  );
  const r = await client.query<{ id: string }>(
    `insert into races (batch_run_id, race_engine_version, seed_commit_id, status, weather, track_condition, surface)
     values ($1, 'race_v1.0', $2, 'FINALIZED', $3::weather, $4::track_condition, $5::surface) returning id`,
    [batchId, commit.rows[0]!.id, weather, track, surface],
  );
  return r.rows[0]!.id;
}
async function useItem(
  userId: string, horseId: string, itemKey: string, raceId: string, date: string, outcome: 'SURVIVED' | 'BURNED',
): Promise<void> {
  const ui = await client.query<{ id: string }>(
    `insert into user_items (user_id, item_key, unit_price, source, status)
     values ($1, $2, 2, 'PURCHASE', 'CONSUMED') returning id`,
    [userId, itemKey],
  );
  await client.query(
    `insert into item_usages (user_item_id, horse_id, user_id, item_key, unit_price, effective_race_date,
                              status, race_id, settled_outcome)
     values ($1, $2, $3, $4, 2, $5, 'SETTLED', $6, $7)`,
    [ui.rows[0]!.id, horseId, userId, itemKey, date, raceId, outcome],
  );
}
