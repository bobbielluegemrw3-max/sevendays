import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { buildApiRegistry, sendNightlyBroadcast, raceStartMessage, type AuthContext, type PushTransport } from '../src/index.js';

/**
 * Webプッシュ(Decision 084)。送信は必ずスタブのトランスポート — 実ネットワークに出ない。
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

function asUser(userId: string): AuthContext {
  return { kind: 'user', userId };
}

async function call(
  method: 'GET' | 'POST',
  path: string,
  auth: AuthContext,
  options: { body?: unknown } = {},
) {
  return registry.dispatch(client, { method, path, auth, body: options.body, idempotencyKey: null });
}

function sub(endpoint: string) {
  return { endpoint, p256dh: 'p256dh-key', auth: 'auth-secret' };
}

describe('push subscriptions', () => {
  it('subscribe upserts by endpoint and re-enables a disabled subscription', async () => {
    const user = await newUser();
    const endpoint = `https://push.example/${randomUUID()}`;

    const first = await call('POST', '/api/v1/push/subscribe', asUser(user), { body: sub(endpoint) });
    expect(first.status).toBe(200);

    await client.query(`update push_subscriptions set disabled_at = now(), fail_count = 5 where endpoint = $1`, [endpoint]);

    const again = await call('POST', '/api/v1/push/subscribe', asUser(user), {
      body: { endpoint, p256dh: 'rotated', auth: 'rotated-secret' },
    });
    expect(again.status).toBe(200);

    const row = await client.query<{ user_id: string; p256dh: string; disabled_at: string | null; fail_count: number; n: string }>(
      `select user_id, p256dh, disabled_at, fail_count,
              (select count(*) from push_subscriptions where endpoint = $1)::text as n
       from push_subscriptions where endpoint = $1`,
      [endpoint],
    );
    expect(row.rows[0]!.n).toBe('1');
    expect(row.rows[0]!.user_id).toBe(user);
    expect(row.rows[0]!.p256dh).toBe('rotated');
    expect(row.rows[0]!.disabled_at).toBeNull();
    expect(row.rows[0]!.fail_count).toBe(0);
  });

  it('an endpoint reused by another user moves to the new owner (device handover)', async () => {
    const alice = await newUser();
    const bob = await newUser();
    const endpoint = `https://push.example/${randomUUID()}`;
    await call('POST', '/api/v1/push/subscribe', asUser(alice), { body: sub(endpoint) });
    await call('POST', '/api/v1/push/subscribe', asUser(bob), { body: sub(endpoint) });
    const row = await client.query<{ user_id: string }>(
      `select user_id from push_subscriptions where endpoint = $1`, [endpoint],
    );
    expect(row.rows[0]!.user_id).toBe(bob);
  });

  it('unsubscribe disables own subscription and rejects unknown endpoints', async () => {
    const user = await newUser();
    const endpoint = `https://push.example/${randomUUID()}`;
    await call('POST', '/api/v1/push/subscribe', asUser(user), { body: sub(endpoint) });

    const ok = await call('POST', '/api/v1/push/unsubscribe', asUser(user), { body: { endpoint } });
    expect(ok.status).toBe(200);
    const row = await client.query<{ disabled_at: string | null }>(
      `select disabled_at from push_subscriptions where endpoint = $1`, [endpoint],
    );
    expect(row.rows[0]!.disabled_at).not.toBeNull();

    const missing = await call('POST', '/api/v1/push/unsubscribe', asUser(user), {
      body: { endpoint: `https://push.example/${randomUUID()}` },
    });
    expect(missing.status).toBe(404);
  });

  it('public-key endpoint answers (null when VAPID env is not set)', async () => {
    const user = await newUser();
    const res = await call('GET', '/api/v1/push/public-key', asUser(user));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('public_key');
  });
});

describe('nightly broadcast', () => {
  function stubTransport(log: string[], goneEndpoints: Set<string>): PushTransport {
    return {
      send(subscription) {
        log.push(subscription.endpoint);
        if (goneEndpoints.has(subscription.endpoint)) return Promise.resolve({ ok: false, gone: true });
        return Promise.resolve({ ok: true });
      },
    };
  }

  it('sends once per broadcast key, disables gone subscriptions, and is idempotent', async () => {
    const user = await newUser();
    const alive = `https://push.example/${randomUUID()}`;
    const gone = `https://push.example/${randomUUID()}`;
    await call('POST', '/api/v1/push/subscribe', asUser(user), { body: sub(alive) });
    await call('POST', '/api/v1/push/subscribe', asUser(user), { body: sub(gone) });

    const key = `race-start:test-${randomUUID()}`;
    const log: string[] = [];
    const transport = stubTransport(log, new Set([gone]));

    const first = await sendNightlyBroadcast(client, { broadcastKey: key, message: raceStartMessage(), transport });
    expect(first.skipped).toBe(false);
    expect(log).toContain(alive);
    expect(log).toContain(gone);
    expect(first.disabled).toBe(1);

    const goneRow = await client.query<{ disabled_at: string | null }>(
      `select disabled_at from push_subscriptions where endpoint = $1`, [gone],
    );
    expect(goneRow.rows[0]!.disabled_at).not.toBeNull();

    // 再実行(バッチのリトライ)では送信されない
    const before = log.length;
    const second = await sendNightlyBroadcast(client, { broadcastKey: key, message: raceStartMessage(), transport });
    expect(second.skipped).toBe(true);
    expect(log.length).toBe(before);

    // 無効化済みの購読は次のブロードキャストの対象外
    const key2 = `race-start:test-${randomUUID()}`;
    const log2: string[] = [];
    await sendNightlyBroadcast(client, { broadcastKey: key2, message: raceStartMessage(), transport: stubTransport(log2, new Set()) });
    expect(log2).not.toContain(gone);
  });

  it('onlyUserId restricts delivery to that user (CS newsletter TEST mode)', async () => {
    const admin = await newUser();
    const other = await newUser();
    const adminEndpoint = `https://push.example/${randomUUID()}`;
    const otherEndpoint = `https://push.example/${randomUUID()}`;
    await call('POST', '/api/v1/push/subscribe', asUser(admin), { body: sub(adminEndpoint) });
    await call('POST', '/api/v1/push/subscribe', asUser(other), { body: sub(otherEndpoint) });

    const log: string[] = [];
    const result = await sendNightlyBroadcast(client, {
      broadcastKey: `cs-test:${randomUUID()}`,
      message: { title: 'お知らせ', body: 'テスト', url: '/dashboard' },
      transport: stubTransport(log, new Set()),
      onlyUserId: admin,
    });
    expect(result.skipped).toBe(false);
    expect(log).toContain(adminEndpoint);
    expect(log).not.toContain(otherEndpoint);
  });
});
