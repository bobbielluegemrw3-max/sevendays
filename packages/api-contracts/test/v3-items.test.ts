import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { activatePolicy } from '@sevendays/economy-engine';
import { depositConfirmation } from '@sevendays/ledger';
import { hiddenPreferencesV2, resolveTrainingItemV3, resolveTrainingRollV2 } from '@sevendays/race-engine';
import { buildApiRegistry, type AuthContext } from '../src/index.js';

/**
 * カタログV2 API (V2実装-6 / IT2-5, Decision 109):
 * シーズンゲート・TRAINING添付(確定即最終)・RACE備え(params/取消)・即時適用。
 */

let client: SqlClient;
const registry = buildApiRegistry();

beforeAll(async () => {
  client = await createTestDb();
  await activatePolicy(client, 'race_engine_versions', 'race_engine_v2.0');
  // テストネットリセット相当: V3カタログを有効化(§7チェックリスト)
  await client.query(`update item_catalog set active = true where item_class <> 'V1'`);
});

async function newUser(funded = true): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  const id = r.rows[0]!.id;
  if (funded) {
    await depositConfirmation(client, { userId: id, amount: Money.of('100'), idempotencyKey: randomUUID() });
  }
  return id;
}

async function newHorse(ownerId: string, horseType = 'SPRINTER'): Promise<{ id: string; dnaHash: string }> {
  const dnaHash = randomUUID().replaceAll('-', '');
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, total_value)
     values ($1, $2, $3::horse_type, 'COMMON', $4, 0.5, 'horse_generation_v1.0', $5, '{}'::jsonb, 55)
     returning id`,
    [ownerId, `V3 API ${randomUUID().slice(0, 12)}`, horseType, dnaHash, randomUUID().replaceAll('-', '')],
  );
  return { id: r.rows[0]!.id, dnaHash };
}

function asUser(userId: string): AuthContext {
  return { kind: 'user', userId };
}

async function post(userId: string, path: string, body: unknown) {
  return registry.dispatch(client, { method: 'POST', path, auth: asUser(userId), body, idempotencyKey: null });
}

async function buy(userId: string, itemKey: string) {
  const res = await post(userId, '/api/v1/items/purchase', { item_key: itemKey, quantity: 1 });
  expect(res.status).toBe(200);
}

function errCode(res: { body: unknown }): string {
  return (res.body as { error: { code: string } }).error.code;
}

describe('catalog V3 APIs (Decision 109)', () => {
  it('serves only the V3 catalog in a V2 season and blocks legacy purchases', async () => {
    const user = await newUser();
    const catalog = await registry.dispatch(client, {
      method: 'GET', path: '/api/v1/items/catalog', auth: asUser(user), body: null, idempotencyKey: null,
    });
    const body = catalog.body as {
      engine_v2: boolean;
      items: { key: string; item_class: string; sellable: boolean }[];
    };
    expect(body.engine_v2).toBe(true);
    expect(body.items).toHaveLength(35); // 販売30+非売5(図鑑表示・非売はsellable=false)
    expect(body.items.filter((i) => i.sellable)).toHaveLength(30);
    expect(body.items.every((i) => i.item_class !== 'V1')).toBe(true);

    const legacy = await post(user, '/api/v1/items/purchase', { item_key: 'sugar_cube', quantity: 1 });
    expect(legacy.status).toBeGreaterThanOrEqual(400);
  });

  it('attaches a TRAINING item on confirm: rolled bonus, final, kind=TRAINING usage', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'POWER');
    await buy(user, 'royal_banquet');

    const res = await post(user, `/api/v1/horses/${horse.id}/training`, {
      menus: ['HILL', 'WOOD'],
      item_key: 'royal_banquet',
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      delta: number; synergy: number; item_key: string; item_bonus: number;
      effective_race_date: string; slot: string;
    };
    expect(body.item_key).toBe('royal_banquet');
    expect(body.item_bonus).toBeGreaterThanOrEqual(3);
    expect(body.item_bonus).toBeLessThanOrEqual(5);

    // 決定論: 同じサイクルシードから誰でも再計算できる
    const prefs = hiddenPreferencesV2(horse.dnaHash, 'POWER');
    const roll = resolveTrainingRollV2({
      dnaHash: horse.dnaHash, horseType: 'POWER', menus: ['HILL', 'WOOD'],
      rollSeed: `${horse.id}:${body.effective_race_date}:${body.slot}`,
    });
    const expected = resolveTrainingItemV3('royal_banquet', `${horse.id}:${body.effective_race_date}:${body.slot}`, {
      menus: ['HILL', 'WOOD'], favoriteMenu: prefs.favorite, lv: 0,
      roll: { delta: roll.delta, synergy: roll.synergy },
    });
    expect(body.item_bonus).toBe(expected.itemBonus);

    const row = await client.query<{ item_key_v3: string; item_bonus_v3: string }>(
      `select item_key_v3, item_bonus_v3::text as item_bonus_v3 from training_sessions where horse_id = $1`,
      [horse.id],
    );
    expect(row.rows[0]!.item_key_v3).toBe('royal_banquet');
    expect(Number(row.rows[0]!.item_bonus_v3)).toBe(expected.itemBonus);

    const usage = await client.query<{ usage_kind: string; status: string }>(
      `select usage_kind, status from item_usages where horse_id = $1`,
      [horse.id],
    );
    expect(usage.rows[0]!.usage_kind).toBe('TRAINING');
    expect(usage.rows[0]!.status).toBe('PENDING');

    // TRAINING添付は取り消せない(確定即最終 107)— cancel は RACE系のみ
    const cancel = await post(user, `/api/v1/horses/${horse.id}/item/cancel`, {});
    expect(cancel.status).toBeGreaterThanOrEqual(400);
    expect(errCode(cancel)).toBe('ITEM_USAGE_NOT_FOUND');
  });

  it('refuses an ineligible attach without consuming the unit', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'SPRINTER');
    await buy(user, 'pool_float');
    const res = await post(user, `/api/v1/horses/${horse.id}/training`, {
      menus: ['HILL'],
      item_key: 'pool_float', // POOL専用 — メニュー不一致
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(errCode(res)).toBe('ITEM_NOT_ELIGIBLE');
    const unit = await client.query<{ status: string }>(
      `select status from user_items where user_id = $1 and item_key = 'pool_float'`,
      [user],
    );
    expect(unit.rows[0]!.status).toBe('AVAILABLE');
    // 調教も確定していない(添付検証は確定前)
    const training = await client.query(`select 1 from training_sessions where horse_id = $1`, [horse.id]);
    expect(training.rows).toHaveLength(0);
  });

  it('applies a RACE prep item to the next cycle; DUAL needs groups; cancellable before freeze', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'BALANCED');
    await buy(user, 'full_harness');

    const missing = await post(user, `/api/v1/horses/${horse.id}/item`, { item_key: 'full_harness' });
    expect(missing.status).toBeGreaterThanOrEqual(400);
    expect(errCode(missing)).toBe('ITEM_PARAMS_REQUIRED');

    const res = await post(user, `/api/v1/horses/${horse.id}/item`, {
      item_key: 'full_harness',
      weather_group: 'RAIN_GROUP',
      track_group: 'MUD_GROUP',
    });
    expect(res.status).toBe(200);
    const body = res.body as { slot: string; effective_race_date: string };
    expect(['MORNING', 'NIGHT']).toContain(body.slot);

    const usage = await client.query<{ usage_kind: string; params_json: { weatherGroup: string } }>(
      `select usage_kind, params_json from item_usages where horse_id = $1 and status = 'PENDING'`,
      [horse.id],
    );
    expect(usage.rows[0]!.usage_kind).toBe('RACE');
    expect(usage.rows[0]!.params_json.weatherGroup).toBe('RAIN_GROUP');

    // 同サイクルへの2個目は拒否
    await buy(user, 'rain_cape');
    const second = await post(user, `/api/v1/horses/${horse.id}/item`, { item_key: 'rain_cape' });
    expect(second.status).toBeGreaterThanOrEqual(400);
    expect(errCode(second)).toBe('ITEM_ALREADY_APPLIED');

    // 凍結前なら取消できて在庫に戻る
    const cancel = await post(user, `/api/v1/horses/${horse.id}/item/cancel`, {});
    expect(cancel.status).toBe(200);
    const unit = await client.query<{ status: string }>(
      `select status from user_items where user_id = $1 and item_key = 'full_harness'`,
      [user],
    );
    expect(unit.rows[0]!.status).toBe('AVAILABLE');
  });

  it('rejects rolling TRAINING items on the race-item API (attach-only)', async () => {
    const user = await newUser();
    const horse = await newHorse(user);
    await buy(user, 'carrot_cube');
    const res = await post(user, `/api/v1/horses/${horse.id}/item`, { item_key: 'carrot_cube' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(errCode(res)).toBe('ITEM_TRAINING_ATTACH_ONLY');
  });

  it('aeon sand applies instantly: unit consumed, decay shield +2', async () => {
    const user = await newUser(false);
    const horse = await newHorse(user);
    // 非売ドロップ: Burn経由でしか入手できない — テストでは直接付与
    await client.query(
      `insert into user_items (user_id, item_key, unit_price, source) values ($1, 'aeon_sand', 0, 'BURN_DROP')`,
      [user],
    );
    const res = await post(user, `/api/v1/horses/${horse.id}/item`, { item_key: 'aeon_sand' });
    expect(res.status).toBe(200);
    expect((res.body as { decay_shield_added: number }).decay_shield_added).toBe(2);
    const horseRow = await client.query<{ decay_shield_v2: number }>(
      `select decay_shield_v2 from horses where id = $1`,
      [horse.id],
    );
    expect(horseRow.rows[0]!.decay_shield_v2).toBe(2);
    const unit = await client.query<{ status: string }>(
      `select status from user_items where user_id = $1 and item_key = 'aeon_sand'`,
      [user],
    );
    expect(unit.rows[0]!.status).toBe('CONSUMED');
  });
});
