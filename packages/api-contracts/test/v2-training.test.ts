import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { batchDateFor } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { activatePolicy } from '@sevendays/economy-engine';
import { resolveTrainingRollV2 } from '@sevendays/race-engine';
import { buildApiRegistry, type AuthContext } from '../src/index.js';

/**
 * V2調教API (V2実装-4a, Decision 104/107):
 * menus 1〜2・確定の瞬間にロール・やり直し不可(確定即最終)・
 * 対象サイクル = 朝→夜→翌朝の順で未COMPLETEDの最初のレース。
 */

let client: SqlClient;
const registry = buildApiRegistry();

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

async function newHorse(ownerId: string, horseType = 'SPRINTER'): Promise<{ id: string; dnaHash: string }> {
  const dnaHash = randomUUID().replaceAll('-', '');
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, total_value)
     values ($1, $2, $3::horse_type, 'COMMON', $4, 0.5, 'horse_generation_v1.0', $5, '{}'::jsonb, 55)
     returning id`,
    [ownerId, `V2 Train ${randomUUID().slice(0, 12)}`, horseType, dnaHash, randomUUID().replaceAll('-', '')],
  );
  return { id: r.rows[0]!.id, dnaHash };
}

function asUser(userId: string): AuthContext {
  return { kind: 'user', userId };
}

async function train(userId: string, horseId: string, body: unknown) {
  return registry.dispatch(client, {
    method: 'POST',
    path: `/api/v1/horses/${horseId}/training`,
    auth: asUser(userId),
    body,
    idempotencyKey: null,
  });
}

describe('V2 menu training (Decisions 104/107)', () => {
  it('is gated until race_engine_v2.0 is the active engine', async () => {
    const user = await newUser();
    const horse = await newHorse(user);
    const res = await train(user, horse.id, { menus: ['HILL'] });
    expect(res.status).toBe(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('TRAINING_V2_NOT_AVAILABLE');
  });

  it('rolls at confirm (deterministic), is final, and the roll row cannot be deleted', async () => {
    await activatePolicy(client, 'race_engine_versions', 'race_engine_v2.0');

    const user = await newUser();
    const horse = await newHorse(user, 'SPRINTER');
    const res = await train(user, horse.id, { menus: ['HILL', 'SPAR'] });
    expect(res.status).toBe(200);
    const body = res.body as {
      menus: string[];
      delta: number;
      synergy: number;
      rests_decay: boolean;
      effective_race_date: string;
      slot: string;
      first_confirm: boolean;
    };
    expect(body.menus).toEqual(['HILL', 'SPAR']);
    expect(body.slot).toBe('MORNING'); // バッチ未実行の日は朝が次のレース
    expect(body.first_confirm).toBe(true);

    // ロールは決定論(馬×サイクルのシード)— 同じ入力から再計算できる=検証可能
    const expected = resolveTrainingRollV2({
      dnaHash: horse.dnaHash,
      horseType: 'SPRINTER',
      menus: ['HILL', 'SPAR'],
      rollSeed: `${horse.id}:${body.effective_race_date}:${body.slot}`,
    });
    expect(body.delta).toBe(expected.delta);
    expect(body.synergy).toBe(expected.synergy);

    // Decision 107: 同一サイクルへの再確定は拒否(ロールは最終)
    const again = await train(user, horse.id, { menus: ['POOL'] });
    expect(again.status).toBe(409);
    expect((again.body as { error: { code: string } }).error.code).toBe('TRAINING_ALREADY_EXISTS');

    // DBガード: V2行は削除も不可(TRAINING_FINAL)
    await expect(
      client.query(
        `delete from training_sessions where horse_id = $1 and menus_v2 is not null`,
        [horse.id],
      ),
    ).rejects.toThrow(/TRAINING_FINAL/);
  });

  it('targets the next uncompleted cycle: after the morning batch, training aims at NIGHT', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'ENDURANCE');
    const myt = batchDateFor(new Date());
    await client.query(
      `insert into batch_runs (batch_date, slot, batch_algorithm_version, status)
       values ($1, 'MORNING', 'batch_v1.0', 'COMPLETED')
       on conflict (batch_date, slot) do update set status = 'COMPLETED'`,
      [myt],
    );
    const res = await train(user, horse.id, { menus: ['REST'] });
    expect(res.status).toBe(200);
    const body = res.body as { slot: string; rests_decay: boolean; delta: number };
    expect(body.slot).toBe('NIGHT');
    expect(body.rests_decay).toBe(true);
    expect(body.delta).toBe(0);
  });

  it('rejects unknown menus and oversized combos', async () => {
    const user = await newUser();
    const horse = await newHorse(user);
    const bad = await train(user, horse.id, { menus: ['GALLOP'] });
    expect(bad.status).toBe(400);
    expect((bad.body as { error: { code: string } }).error.code).toBe('INVALID_TRAINING_TYPE');
    const three = await train(user, horse.id, { menus: ['HILL', 'POOL', 'GATE'] });
    expect(three.status).toBe(400);
  });

  it('keeps the V1 training_type path working (rollless redo untouched)', async () => {
    const user = await newUser();
    const horse = await newHorse(user, 'POWER');
    const res = await train(user, horse.id, { training_type: 'SPEED_TRAINING' });
    expect(res.status).toBe(200);
    const redo = await train(user, horse.id, { training_type: 'POWER_TRAINING' });
    expect(redo.status).toBe(200);
    expect((redo.body as { first_confirm: boolean }).first_confirm).toBe(false);
  });
});
