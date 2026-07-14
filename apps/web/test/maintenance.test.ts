import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { buildAuthContext, dispatchBridge } from '../lib/api-bridge';
import { getMaintenanceState, invalidateMaintenanceCache } from '../lib/maintenance';

/**
 * メンテナンスモード(Decision 098)の境界:
 * ONの間、一般ユーザー/匿名のディスパッチは503 MAINTENANCE・管理者は素通り。
 * 切替は管理者APIのみ(監査行つき)・一般ユーザーには403。
 */

const JWT_SECRET = 'test-jwt-secret-for-maintenance-01';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

afterEach(async () => {
  // 後続テストを汚さない: 常にOFFへ戻す(キャッシュも破棄)。
  await client.query(
    `update system_settings set value = '{"enabled": false, "message": ""}'::jsonb where key = 'maintenance'`,
  );
  invalidateMaintenanceCache();
});

async function signToken(sub: string, email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(JWT_SECRET));
}

async function makeUser(): Promise<string> {
  const uid = randomUUID();
  const token = await signToken(uid, `${uid}@mnt.dev`);
  await buildAuthContext(client, token, JWT_SECRET); // provision
  return token;
}

async function makeAdmin(): Promise<{ token: string; uid: string }> {
  const uid = randomUUID();
  const token = await signToken(uid, `${uid}@mnt-admin.dev`);
  await buildAuthContext(client, token, JWT_SECRET); // provision
  await client.query(`insert into admin_role_grants (user_id, role) values ($1, 'SUPER_ADMIN')`, [uid]);
  return { token, uid };
}

async function setMaintenance(enabled: boolean, message = ''): Promise<void> {
  await client.query(
    `update system_settings set value = jsonb_build_object('enabled', $1::boolean, 'message', $2::text)
     where key = 'maintenance'`,
    [enabled, message],
  );
  invalidateMaintenanceCache();
}

describe('maintenance mode (Decision 098)', () => {
  it('migration seeds the flag OFF', async () => {
    const state = await getMaintenanceState(client);
    expect(state).toEqual({ enabled: false, message: '' });
  });

  it('blocks user and anonymous dispatch with 503, admins pass through', async () => {
    const userToken = await makeUser();
    const { token: adminToken } = await makeAdmin();

    // OFF: user traffic flows normally.
    const before = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/me', accessToken: userToken },
      JWT_SECRET,
    );
    expect(before.status).toBe(200);

    await setMaintenance(true, '02:00頃まで');

    // User: 503 with the operator message.
    const blocked = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/me', accessToken: userToken },
      JWT_SECRET,
    );
    expect(blocked.status).toBe(503);
    expect((blocked.body as { error: { code: string; message: string } }).error.code).toBe('MAINTENANCE');
    expect((blocked.body as { error: { message: string } }).error.message).toBe('02:00頃まで');

    // Anonymous: 503 as well (LP data calls included).
    const anon = await dispatchBridge(client, { method: 'GET', path: '/api/v1/me' }, JWT_SECRET);
    expect(anon.status).toBe(503);

    // Admin: full access — /me and admin endpoints both work.
    const adminMe = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/me', accessToken: adminToken },
      JWT_SECRET,
    );
    expect(adminMe.status).toBe(200);
    const adminDash = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/admin/dashboard', accessToken: adminToken },
      JWT_SECRET,
    );
    expect(adminDash.status).toBe(200);

    await setMaintenance(false);
    const after = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/me', accessToken: userToken },
      JWT_SECRET,
    );
    expect(after.status).toBe(200);
  });

  it('admin toggles via the API with an audit row; users get 403', async () => {
    const { token: adminToken, uid } = await makeAdmin();
    const userToken = await makeUser();

    const denied = await dispatchBridge(
      client,
      { method: 'POST', path: '/api/v1/admin/maintenance', body: { enabled: true }, accessToken: userToken },
      JWT_SECRET,
    );
    expect(denied.status).toBe(403);

    const on = await dispatchBridge(
      client,
      {
        method: 'POST',
        path: '/api/v1/admin/maintenance',
        body: { enabled: true, message: 'アップグレード作業中' },
        accessToken: adminToken,
      },
      JWT_SECRET,
    );
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ enabled: true, message: 'アップグレード作業中' });
    invalidateMaintenanceCache();

    const status = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/admin/maintenance', accessToken: adminToken },
      JWT_SECRET,
    );
    expect(status.status).toBe(200);
    expect((status.body as { enabled: boolean }).enabled).toBe(true);

    const auditRow = await client.query<{ action: string; actor_id: string }>(
      `select action, actor_id from audit_logs
       where action = 'MAINTENANCE_ENABLED' and reference_type = 'system_settings'
       order by created_at desc limit 1`,
    );
    expect(auditRow.rows[0]?.actor_id).toBe(uid);

    // 遮断はキャッシュ破棄後に即効く(実運用はTTL10秒以内)。
    const blocked = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/me', accessToken: userToken },
      JWT_SECRET,
    );
    expect(blocked.status).toBe(503);
  });
});
