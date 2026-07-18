import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money, batchDateFor } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { activatePolicy } from '@sevendays/economy-engine';
import { depositConfirmation } from '@sevendays/ledger';
import { runMarketPostBatch } from '../src/market/post-batch.js';

/**
 * Decision 110: V2の自動プール予約(金額指定)。
 * 残高が設定額に満たなければ残高まで切り下げ・102未満はスキップ・
 * 手動プールは上書きしない・金額未設定はSINGLE予約のまま(経路温存)。
 */

let client: SqlClient;
const today = batchDateFor(new Date());

beforeAll(async () => {
  client = await createTestDb();
  await activatePolicy(client, 'race_engine_versions', 'race_engine_v2.0');
  await client.query(
    `insert into batch_runs (batch_date, slot, batch_algorithm_version, status)
     values ($1, 'MORNING', 'batch_v1.0', 'COMPLETED')`,
    [today],
  );
});

async function newUser(balance: string, autoPoolAmount: number | null): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@user.sevendays`],
  );
  const id = r.rows[0]!.id;
  if (Number(balance) > 0) {
    await depositConfirmation(client, { userId: id, amount: Money.of(balance), idempotencyKey: randomUUID() });
  }
  await client.query(
    `insert into user_trade_settings (user_id, auto_list, auto_reserve, auto_reserve_max, auto_pool_amount)
     values ($1, true, true, 1, $2)`,
    [id, autoPoolAmount],
  );
  return id;
}

async function poolOf(userId: string) {
  const r = await client.query<{ id: string; locked_amount: string; status: string }>(
    `select id, locked_amount::text as locked_amount, status::text as status
     from purchase_sessions where user_id = $1 and session_mode = 'POOL'`,
    [userId],
  );
  return r.rows;
}

describe('V2 auto pool sweep (Decision 110)', () => {
  it('arms a pool of min(setting, balance), idempotently; unset users keep legacy singles', async () => {
    const pooled = await newUser('300', 500); // 残高300 < 設定500 → 300で張る
    const legacy = await newUser('400', null); // 未設定 → SINGLE予約のまま
    const broke = await newUser('50', 500); // 102未満 → スキップ

    const first = await runMarketPostBatch(client, today, 'MORNING', true);
    expect(first.autoReserveUsers).toBeGreaterThanOrEqual(2); // pooled + legacy

    const pools = await poolOf(pooled);
    expect(pools).toHaveLength(1);
    expect(Number(pools[0]!.locked_amount)).toBe(300);
    const notif = await client.query<{ n: number }>(
      `select count(*)::int as n from notifications
       where user_id = $1 and notification_type = 'AUTO_POOL_RESERVED'`,
      [pooled],
    );
    expect(notif.rows[0]!.n).toBe(1);

    // 未設定ユーザーはSINGLE(177.16ロック)の従来経路
    const singles = await client.query<{ n: number }>(
      `select count(*)::int as n from purchase_sessions
       where user_id = $1 and session_mode = 'SINGLE' and status = 'PENDING_ASSIGNMENT'`,
      [legacy],
    );
    expect(singles.rows[0]!.n).toBe(1);

    // 102未満はプールを張らない
    expect(await poolOf(broke)).toHaveLength(0);

    // 再実行: 冪等(プール1本のまま・通知も増えない)
    await runMarketPostBatch(client, today, 'MORNING', true);
    expect(await poolOf(pooled)).toHaveLength(1);
    const notifAgain = await client.query<{ n: number }>(
      `select count(*)::int as n from notifications
       where user_id = $1 and notification_type = 'AUTO_POOL_RESERVED'`,
      [pooled],
    );
    expect(notifAgain.rows[0]!.n).toBe(1);
  });

  it('releases stale PENDING usages whose race completed without them (stuck-unit sweep)', async () => {
    const user = await newUser('0', null);
    const horse = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, 'Stale Test', 'BALANCED', 'COMMON', $2, 0.5, 'horse_generation_v1.0', $3, '{}'::jsonb)
       returning id`,
      [user, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')],
    );
    const horseId = horse.rows[0]!.id;
    const unit = await client.query<{ id: string }>(
      `insert into user_items (user_id, item_key, unit_price, source)
       values ($1, 'rain_cape', 2, 'PURCHASE') returning id`,
      [user],
    );
    const unitId = unit.rows[0]!.id;
    await client.query(`update user_items set status = 'APPLIED' where id = $1`, [unitId]);
    // 完了済みサイクル(today MORNING)を狙ったPENDING = レースを走らずスタック
    await client.query(
      `insert into item_usages (user_item_id, horse_id, user_id, item_key, unit_price,
                                effective_race_date, slot, usage_kind)
       values ($1, $2, $3, 'rain_cape', 2, $4, 'MORNING', 'RACE')`,
      [unitId, horseId, user, today],
    );
    // 未来サイクル(today NIGHT・バッチ未完了)向けは掃除されないことも同時に確認
    const unit2 = await client.query<{ id: string }>(
      `insert into user_items (user_id, item_key, unit_price, source)
       values ($1, 'sun_visor', 2, 'PURCHASE') returning id`,
      [user],
    );
    await client.query(`update user_items set status = 'APPLIED' where id = $1`, [unit2.rows[0]!.id]);
    await client.query(
      `insert into item_usages (user_item_id, horse_id, user_id, item_key, unit_price,
                                effective_race_date, slot, usage_kind)
       values ($1, $2, $3, 'sun_visor', 2, $4, 'NIGHT', 'RACE')`,
      [unit2.rows[0]!.id, horseId, user, today],
    );

    const result = await runMarketPostBatch(client, today, 'MORNING', true);
    expect(result.staleUsagesReleased).toBeGreaterThanOrEqual(1);

    const released = await client.query<{ status: string }>(
      `select status from user_items where id = $1`,
      [unitId],
    );
    expect(released.rows[0]!.status).toBe('AVAILABLE');
    const staleUsage = await client.query<{ status: string }>(
      `select status from item_usages where user_item_id = $1`,
      [unitId],
    );
    expect(staleUsage.rows[0]!.status).toBe('CANCELLED');

    // 未来サイクル向けは無傷
    const future = await client.query<{ status: string }>(
      `select status from item_usages where user_item_id = $1`,
      [unit2.rows[0]!.id],
    );
    expect(future.rows[0]!.status).toBe('PENDING');
  });

  it('never overrides a manually created live pool', async () => {
    const user = await newUser('2000', 500);
    // 手動プール(1000)を先に作る
    const { createOrUpdatePoolSession } = await import('@sevendays/settlement-engine');
    await createOrUpdatePoolSession(client, {
      userId: user,
      amount: '1000',
      idempotencyKey: `manual:${user}`,
    });

    await runMarketPostBatch(client, today, 'MORNING', true);
    const pools = await poolOf(user);
    expect(pools).toHaveLength(1);
    expect(Number(pools[0]!.locked_amount)).toBe(1000); // 手動の金額のまま
  });
});
