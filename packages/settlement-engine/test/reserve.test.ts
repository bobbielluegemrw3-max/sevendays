import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { slideReservedHorsesAfterBurn } from '../src/economy/reserve.js';

/**
 * 施策C (FUN_V3): 非売指定のBURNスライド。
 * 保護中の馬が焼けたら、そのオーナーの最古のアクティブ馬へ保護を移す。
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
// 作成順(created_at)を制御するため明示的に指定できるようにする
async function newHorse(ownerId: string, createdAt: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, created_at)
     values ($1, 1, $2, 'BALANCED', 'COMMON', $3, 0, 'v1', $4, '{}', $5::timestamptz) returning id`,
    [ownerId, `R ${randomUUID().slice(0, 12)}`, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', ''), createdAt],
  );
  return r.rows[0]!.id;
}

describe('slideReservedHorsesAfterBurn (施策C)', () => {
  it('保護馬が焼けたら最古のアクティブ馬へスライドする', async () => {
    const u = await newUser();
    const oldest = await newHorse(u, '2036-04-01T00:00:00Z');
    const mid = await newHorse(u, '2036-04-02T00:00:00Z');
    const reserved = await newHorse(u, '2036-04-03T00:00:00Z');
    await client.query(`update users set reserved_horse_id = $1 where id = $2`, [reserved, u]);

    // reserved を焼く
    await client.query(`update horses set status = 'BURNED' where id = $1`, [reserved]);
    await slideReservedHorsesAfterBurn(client, [reserved]);

    const after = await client.query<{ rid: string | null }>(
      `select reserved_horse_id::text as rid from users where id = $1`,
      [u],
    );
    // 最古のアクティブ馬(oldest)へ。mid ではない。
    expect(after.rows[0]!.rid).toBe(oldest);
    void mid;
  });

  it('冪等: 焼けた馬を指していなければ何もしない', async () => {
    const u = await newUser();
    const a = await newHorse(u, '2036-04-01T00:00:00Z');
    const b = await newHorse(u, '2036-04-02T00:00:00Z');
    await client.query(`update users set reserved_horse_id = $1 where id = $2`, [a, u]);
    // b が焼けても、保護は a のまま(a は焼けていない)
    await client.query(`update horses set status = 'BURNED' where id = $1`, [b]);
    await slideReservedHorsesAfterBurn(client, [b]);
    const after = await client.query<{ rid: string | null }>(
      `select reserved_horse_id::text as rid from users where id = $1`,
      [u],
    );
    expect(after.rows[0]!.rid).toBe(a);
  });

  it('アクティブ馬が残っていなければ null になる', async () => {
    const u = await newUser();
    const only = await newHorse(u, '2036-04-01T00:00:00Z');
    await client.query(`update users set reserved_horse_id = $1 where id = $2`, [only, u]);
    await client.query(`update horses set status = 'BURNED' where id = $1`, [only]);
    await slideReservedHorsesAfterBurn(client, [only]);
    const after = await client.query<{ rid: string | null }>(
      `select reserved_horse_id::text as rid from users where id = $1`,
      [u],
    );
    expect(after.rows[0]!.rid).toBeNull();
  });
});
