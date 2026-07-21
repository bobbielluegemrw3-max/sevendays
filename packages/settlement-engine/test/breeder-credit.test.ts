import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { notifyBreedersOfChampion } from '../src/champion/breeder-credit.js';

/**
 * 施策D (FUN_V3): 育成者クレジット。
 * 育てた馬がチャンピオンになったら、過去の育成者(現所有者を除く)に貢献%込みで通知。
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
async function newHorse(ownerId: string, name: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, 7, $2, 'BALANCED', 'COMMON', $3, 0, 'v1', $4, '{}') returning id`,
    [ownerId, name, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')],
  );
  return r.rows[0]!.id;
}
async function train(horseId: string, userId: string, delta: string, date: string): Promise<void> {
  // V2行は menus_v2/per_menu_v2/synergy_v2/delta_v2/rests_decay_v2 すべて非null必須
  // (chk_training_v1_or_v2)。training_type は null。
  await client.query(
    `insert into training_sessions
       (horse_id, user_id, training_date, effective_race_date, slot,
        menus_v2, per_menu_v2, synergy_v2, delta_v2, rests_decay_v2)
     values ($1, $2, $3::date, $3::date, 'NIGHT', array['HILL'], '{}'::jsonb, 0, $4, false)`,
    [horseId, userId, date, delta],
  );
}

describe('notifyBreedersOfChampion (施策D)', () => {
  it('過去の育成者に貢献%込みで通知し、現所有者には送らない', async () => {
    const past = await newUser(); // 過去の育成者(売却済み)
    const owner = await newUser(); // 現所有者(自分でも育てた)
    const horse = await newHorse(owner, `Champ ${randomUUID().slice(0, 8)}`);
    // past が +15、owner が +5 → past の貢献は 75%
    await train(horse, past, '15.0', '2036-05-01');
    await train(horse, owner, '5.0', '2036-05-02');

    const sent = await notifyBreedersOfChampion(client, { horseId: horse, currentOwnerId: owner });
    expect(sent).toBe(1); // past のみ(owner は除外)

    const pastNotif = await client.query<{ payload_json: { pct: number; horse_id: string } }>(
      `select payload_json from notifications where user_id = $1 and notification_type = 'BREEDER_CHAMPION'`,
      [past],
    );
    expect(pastNotif.rows).toHaveLength(1);
    expect(pastNotif.rows[0]!.payload_json.pct).toBe(75);
    expect(pastNotif.rows[0]!.payload_json.horse_id).toBe(horse);

    // 現所有者には届かない
    const ownerNotif = await client.query(
      `select 1 from notifications where user_id = $1 and notification_type = 'BREEDER_CHAMPION'`,
      [owner],
    );
    expect(ownerNotif.rows).toHaveLength(0);
  });

  it('冪等: 同じ馬で再実行しても二重送信しない', async () => {
    const past = await newUser();
    const owner = await newUser();
    const horse = await newHorse(owner, `Champ ${randomUUID().slice(0, 8)}`);
    await train(horse, past, '10.0', '2036-05-03');

    await notifyBreedersOfChampion(client, { horseId: horse, currentOwnerId: owner });
    await notifyBreedersOfChampion(client, { horseId: horse, currentOwnerId: owner });

    const n = await client.query(
      `select 1 from notifications where user_id = $1 and notification_type = 'BREEDER_CHAMPION'`,
      [past],
    );
    expect(n.rows).toHaveLength(1); // dedupeKey で1件のまま
  });
});
