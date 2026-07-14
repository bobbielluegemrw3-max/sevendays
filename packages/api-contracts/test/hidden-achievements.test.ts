import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { evaluateHiddenBadges } from '../src/hidden/achievements.js';

/**
 * 隠し実績エンジン(EASTER_EGG_PLAN.md)。不変の記録(item_usages が SETTLED +
 * races の条件)から、コスメティックな称号を決定論的に判定する。
 * 経済・settlement には一切触れない読み取り専用ロジックの単体テスト。
 */

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@ach.dev`],
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

/** 条件つきレースを1つ作る(batch_run + randomness_commit + race)。 */
async function newRace(date: string, weather: string, track: string, surface: string): Promise<string> {
  const b = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0')
     on conflict do nothing returning id`,
    [date],
  );
  const batchId = b.rows[0]?.id
    ?? (await client.query<{ id: string }>(`select id from batch_runs where batch_date = $1`, [date])).rows[0]!.id;
  const commit = await client.query<{ id: string }>(
    `insert into randomness_commits (reference_type, reference_id, commit_hash)
     values ('race', $1, $2) returning id`,
    [randomUUID(), randomUUID().replaceAll('-', '')],
  );
  const r = await client.query<{ id: string }>(
    `insert into races (batch_run_id, race_engine_version, seed_commit_id, status, weather, track_condition, surface)
     values ($1, 'race_v1.0', $2, 'FINALIZED', $3::weather, $4::track_condition, $5::surface) returning id`,
    [batchId, commit.rows[0]!.id, weather, track, surface],
  );
  return r.rows[0]!.id;
}

/** SETTLED のアイテム使用を1件記録する。 */
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

describe('hidden achievements (EASTER_EGG_PLAN.md)', () => {
  it('rain chain: rain item x rainy weather x survived, 3 times -> 雨読みの三重奏', async () => {
    const u = await newUser();
    const h = await newHorse(u);

    // 2回では未獲得
    for (let i = 0; i < 2; i += 1) {
      const race = await newRace(`2041-01-0${i + 1}`, 'RAIN', 'SOFT', 'DIRT');
      await useItem(u, h, 'rain_hood', race, `2041-01-0${i + 1}`, 'SURVIVED');
    }
    expect((await evaluateHiddenBadges(client, u)).map((b) => b.key)).not.toContain('rain_reader');

    // 3回目(storm_cloakでもRAIN適性・STORMもwet)で獲得
    const race3 = await newRace('2041-01-03', 'STORM', 'HEAVY', 'DIRT');
    await useItem(u, h, 'storm_cloak', race3, '2041-01-03', 'SURVIVED');
    const earned = await evaluateHiddenBadges(client, u);
    expect(earned.map((b) => b.key)).toContain('rain_reader');
    // 雰囲気テキストは返るが、獲得条件(3回/雨)は一切露出しない
    const rain = earned.find((b) => b.key === 'rain_reader')!;
    expect(rain.name).toBe('雨読みの三重奏');
    expect(rain.flavor).not.toMatch(/3|三|回|雨アイテム|rain_hood/);
  });

  it('BURNED や 条件不一致 はカウントしない', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    // 雨アイテムだが晴れ(不一致)/ 雨だがBURN(生存でない)/ 別アイテム
    const sunny = await newRace('2041-02-01', 'SUNNY', 'FAST', 'TURF');
    await useItem(u, h, 'rain_hood', sunny, '2041-02-01', 'SURVIVED'); // 条件不一致
    const wet = await newRace('2041-02-02', 'RAIN', 'SOFT', 'DIRT');
    await useItem(u, h, 'rain_hood', wet, '2041-02-02', 'BURNED'); // 生存でない
    const wet2 = await newRace('2041-02-03', 'RAIN', 'SOFT', 'DIRT');
    await useItem(u, h, 'sugar_cube', wet2, '2041-02-03', 'SURVIVED'); // 雨適性でない
    expect((await evaluateHiddenBadges(client, u)).map((b) => b.key)).not.toContain('rain_reader');
  });

  it('meta badge: rain+sun+mud の3称号を揃えると 全天候の賢者', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    let day = 1;
    const run = async (item: string, w: string, t: string, sf: string) => {
      const d = `2041-03-${String(day).padStart(2, '0')}`;
      const race = await newRace(d, w, t, sf);
      await useItem(u, h, item, race, d, 'SURVIVED');
      day += 1;
    };
    for (let i = 0; i < 3; i += 1) await run('rain_hood', 'RAIN', 'SOFT', 'DIRT');
    for (let i = 0; i < 3; i += 1) await run('sunny_visor', 'SUNNY', 'FAST', 'TURF');
    for (let i = 0; i < 3; i += 1) await run('mud_guards', 'CLOUDY', 'HEAVY', 'DIRT');

    const keys = (await evaluateHiddenBadges(client, u)).map((b) => b.key);
    expect(keys).toEqual(expect.arrayContaining(['rain_reader', 'sun_basker', 'mud_general', 'all_weather_sage']));
  });

  it('legacy: burn-drop アイテムで生存 -> 遺志を継ぐ者', async () => {
    const u = await newUser();
    const h = await newHorse(u);
    const race = await newRace('2041-04-01', 'SUNNY', 'GOOD', 'TURF');
    await useItem(u, h, 'spirit_roar', race, '2041-04-01', 'SURVIVED');
    expect((await evaluateHiddenBadges(client, u)).map((b) => b.key)).toContain('legacy_bearer');
  });

  it('何も条件を満たさないユーザーは空(0件)', async () => {
    const u = await newUser();
    expect(await evaluateHiddenBadges(client, u)).toEqual([]);
  });
});
