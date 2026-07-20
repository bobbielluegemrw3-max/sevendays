import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb, expectDbError } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { activatePolicy } from '@sevendays/economy-engine';
import { depositConfirmation } from '@sevendays/ledger';
import {
  applyTotalValueGainV2,
  hiddenPreferencesV2,
  resolveTrainingItemV3,
  resolveTrainingRollV2,
} from '@sevendays/race-engine';
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

describe('post-attach to a confirmed roll (Decision 113)', () => {
  it('attaches after confirm: same-seed bonus, total value applied, then final', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'POWER');
    const confirm = await post(user, `/api/v1/horses/${horse.id}/training`, { menus: ['HILL', 'WOOD'] });
    expect(confirm.status).toBe(200);
    const c = confirm.body as {
      delta: number; synergy: number; total_value: number;
      effective_race_date: string; slot: string;
    };

    await buy(user, 'royal_banquet');
    const res = await post(user, `/api/v1/horses/${horse.id}/training`, { item_key: 'royal_banquet' });
    expect(res.status).toBe(200);
    const body = res.body as {
      item_key: string; item_bonus: number; total_value: number;
      effective_race_date: string; slot: string;
    };
    expect(body.effective_race_date).toBe(c.effective_race_date);
    expect(body.slot).toBe(c.slot);

    // 決定論: 確定時と同一のサイクルシード+保存済みロールから再計算できる
    const prefs = hiddenPreferencesV2(horse.dnaHash, 'POWER');
    const expected = resolveTrainingItemV3(
      'royal_banquet',
      `${horse.id}:${c.effective_race_date}:${c.slot}`,
      {
        menus: ['HILL', 'WOOD'], favoriteMenu: prefs.favorite, lv: 0,
        roll: { delta: c.delta, synergy: c.synergy },
      },
    );
    expect(body.item_bonus).toBe(expected.itemBonus);
    // Decision 112: 上乗せは添付の瞬間に総合値へ反映
    expect(body.total_value).toBe(applyTotalValueGainV2(c.total_value, body.item_bonus));
    const horseRow = await client.query<{ total_value: string }>(
      `select total_value::text as total_value from horses where id = $1`,
      [horse.id],
    );
    expect(Number(horseRow.rows[0]!.total_value)).toBe(body.total_value);

    const row = await client.query<{ item_key_v3: string; item_bonus_v3: string }>(
      `select item_key_v3, item_bonus_v3::text as item_bonus_v3 from training_sessions where horse_id = $1`,
      [horse.id],
    );
    expect(row.rows[0]!.item_key_v3).toBe('royal_banquet');
    expect(Number(row.rows[0]!.item_bonus_v3)).toBe(body.item_bonus);
    const usage = await client.query<{ usage_kind: string; status: string }>(
      `select usage_kind, status from item_usages where horse_id = $1`,
      [horse.id],
    );
    expect(usage.rows[0]!.usage_kind).toBe('TRAINING');
    expect(usage.rows[0]!.status).toBe('PENDING');
    const unit = await client.query<{ status: string }>(
      `select status from user_items where user_id = $1 and item_key = 'royal_banquet'`,
      [user],
    );
    expect(unit.rows[0]!.status).toBe('APPLIED');

    // 1サイクル1個 — 二重添付は拒否
    await buy(user, 'carrot_cube');
    const again = await post(user, `/api/v1/horses/${horse.id}/training`, { item_key: 'carrot_cube' });
    expect(again.status).toBeGreaterThanOrEqual(400);
    expect(errCode(again)).toBe('ITEM_ALREADY_ATTACHED');

    // DBレベルでも添付済みは不変(付け替え・取り外し不可 — 20260720010000)
    await expectDbError(
      client.query(`update training_sessions set item_key_v3 = 'carrot_cube' where horse_id = $1`, [horse.id]),
      'TRAINING_ITEM_FINAL',
    );
    await expectDbError(
      client.query(
        `update training_sessions
            set item_key_v3 = null, item_bonus_v3 = null, item_user_item_id = null
          where horse_id = $1`,
        [horse.id],
      ),
      'TRAINING_ITEM_FINAL',
    );
  });

  it('refuses attach without a confirmed roll, on menu mismatch, and after freeze', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'ENDURANCE');
    await buy(user, 'royal_banquet');

    // 未確定 — まず調教の確定が必要
    const early = await post(user, `/api/v1/horses/${horse.id}/training`, { item_key: 'royal_banquet' });
    expect(early.status).toBeGreaterThanOrEqual(400);
    expect(errCode(early)).toBe('TRAINING_NOT_CONFIRMED');

    const confirm = await post(user, `/api/v1/horses/${horse.id}/training`, { menus: ['POOL', 'REST'] });
    expect(confirm.status).toBe(200);

    // 確定済みメニューで適格判定(HILL専用はPOOL+RESTの確定に付かない)
    await buy(user, 'hill_manual');
    const mismatch = await post(user, `/api/v1/horses/${horse.id}/training`, { item_key: 'hill_manual' });
    expect(mismatch.status).toBeGreaterThanOrEqual(400);
    expect(errCode(mismatch)).toBe('ITEM_NOT_ELIGIBLE');
    const hillUnit = await client.query<{ status: string }>(
      `select status from user_items where user_id = $1 and item_key = 'hill_manual'`,
      [user],
    );
    expect(hillUnit.rows[0]!.status).toBe('AVAILABLE');

    // スナップショット凍結後は添付不可
    await client.query(
      `update training_sessions set snapshot_included_at = now() where horse_id = $1`,
      [horse.id],
    );
    const frozen = await post(user, `/api/v1/horses/${horse.id}/training`, { item_key: 'royal_banquet' });
    expect(frozen.status).toBeGreaterThanOrEqual(400);
    expect(errCode(frozen)).toBe('TRAINING_FROZEN');
  });

  it('GET /horses/:id returns the folded-in V2 extras (roll, race item, shield) correctly', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'POWER');
    const confirm = await post(user, `/api/v1/horses/${horse.id}/training`, { menus: ['HILL', 'WOOD'] });
    expect(confirm.status).toBe(200);
    const c = confirm.body as { slot: string; effective_race_date: string };
    await buy(user, 'royal_banquet');
    const attach = await post(user, `/api/v1/horses/${horse.id}/training`, { item_key: 'royal_banquet' });
    expect(attach.status).toBe(200);
    await buy(user, 'rain_cape');
    const prep = await post(user, `/api/v1/horses/${horse.id}/item`, { item_key: 'rain_cape' });
    expect(prep.status).toBe(200);
    await client.query(
      `insert into user_items (user_id, item_key, unit_price, source) values ($1, 'aeon_sand', 0, 'BURN_DROP')`,
      [user],
    );
    const shield = await post(user, `/api/v1/horses/${horse.id}/item`, { item_key: 'aeon_sand' });
    expect(shield.status).toBe(200);

    const detail = await registry.dispatch(client, {
      method: 'GET', path: `/api/v1/horses/${horse.id}`, auth: asUser(user), body: null, idempotencyKey: null,
    });
    expect(detail.status).toBe(200);
    const d = detail.body as {
      engine_v2: boolean;
      training_v2: { menus: string[]; delta: number; item_bonus: number; item_key: string | null; slot: string } | null;
      race_item_v2: { item_key: string; slot: string } | null;
      decay_shield_v2: number;
      training_v2_row?: unknown;
      race_item_v2_row?: unknown;
    };
    expect(d.engine_v2).toBe(true);
    expect(d.training_v2).not.toBeNull();
    expect(d.training_v2!.menus).toEqual(['HILL', 'WOOD']);
    expect(d.training_v2!.item_key).toBe('royal_banquet');
    expect(d.training_v2!.item_bonus).toBeGreaterThanOrEqual(3);
    expect(d.training_v2!.slot).toBe(c.slot);
    expect(typeof d.training_v2!.delta).toBe('number');
    expect(d.race_item_v2).not.toBeNull();
    expect(d.race_item_v2!.item_key).toBe('rain_cape');
    expect(d.decay_shield_v2).toBe(2);
    // 畳み込み用の生フィールドはレスポンスに漏れない
    expect(d.training_v2_row).toBeUndefined();
    expect(d.race_item_v2_row).toBeUndefined();
  });

  it('refuses attach while the target batch is running', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'BALANCED');
    const confirm = await post(user, `/api/v1/horses/${horse.id}/training`, { menus: ['GATE', 'GATE'] });
    expect(confirm.status).toBe(200);
    const c = confirm.body as { effective_race_date: string; slot: string };

    await buy(user, 'carrot_cube');
    await client.query(
      `insert into batch_runs (batch_date, slot, batch_algorithm_version, status)
       values ($1, $2::race_slot, 'batch_v2.0', 'RUNNING')`,
      [c.effective_race_date, c.slot],
    );
    try {
      const blocked = await post(user, `/api/v1/horses/${horse.id}/training`, { item_key: 'carrot_cube' });
      expect(blocked.status).toBeGreaterThanOrEqual(400);
      expect(errCode(blocked)).toBe('BATCH_IN_PROGRESS');
    } finally {
      await client.query(
        `delete from batch_runs where batch_date = $1 and slot = $2::race_slot`,
        [c.effective_race_date, c.slot],
      );
    }
  });
});
