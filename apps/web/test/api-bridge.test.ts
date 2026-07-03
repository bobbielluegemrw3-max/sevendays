import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { createTestDb } from '@sevendays/database';
import { Money, type SqlClient } from '@sevendays/shared';
import { depositConfirmation } from '@sevendays/ledger';
import { buildAuthContext, dispatchBridge } from '../lib/api-bridge';

/**
 * The web app's auth boundary, end to end against a real schema: token
 * verification, first-login user provisioning, admin role resolution, and
 * full dispatch plumbing (body, idempotency key, error envelope).
 */

const JWT_SECRET = 'test-jwt-secret-for-web-bridge-0001';
const WRONG_SECRET = 'wrong-secret-wrong-secret-wrong-01';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

async function signToken(sub: string, email: string, secret = JWT_SECRET): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

describe('buildAuthContext', () => {
  it('anonymous without a token; anonymous on a bad signature', async () => {
    expect((await buildAuthContext(client, null, JWT_SECRET)).kind).toBe('anonymous');
    const forged = await signToken(randomUUID(), 'x@test.dev', WRONG_SECRET);
    expect((await buildAuthContext(client, forged, JWT_SECRET)).kind).toBe('anonymous');
  });

  it('provisions the users row on first login (users.id = auth.uid)', async () => {
    const uid = randomUUID();
    const token = await signToken(uid, 'first-login@test.dev');
    const auth = await buildAuthContext(client, token, JWT_SECRET);
    expect(auth).toEqual({ kind: 'user', userId: uid });

    const row = await client.query<{ email: string }>(`select email from users where id = $1`, [uid]);
    expect(row.rows[0]!.email).toBe('first-login@test.dev');

    // Second login: idempotent, still a plain user.
    const again = await buildAuthContext(client, token, JWT_SECRET);
    expect(again.kind).toBe('user');
  });

  it('verifies ES256 tokens via JWKS (new Supabase signing keys)', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'test-key';
    jwk.alg = 'ES256';
    jwk.use = 'sig';
    const jwks = createLocalJWKSet({ keys: [jwk] });

    const uid = randomUUID();
    const token = await new SignJWT({ email: 'es256@test.dev' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject(uid)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    const auth = await buildAuthContext(client, token, JWT_SECRET, { jwks });
    expect(auth).toEqual({ kind: 'user', userId: uid });

    // A token signed by a DIFFERENT key is rejected.
    const { privateKey: wrongKey } = await generateKeyPair('ES256');
    const forged = await new SignJWT({ email: 'forged@test.dev' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject(randomUUID())
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(wrongKey);
    expect((await buildAuthContext(client, forged, JWT_SECRET, { jwks })).kind).toBe('anonymous');
  });

  it('survives a stale email collision instead of locking the new user out', async () => {
    const email = `${randomUUID()}@collision.dev`;
    // A previous owner of this email address still holds it in users
    // (they changed address in Supabase; the email was re-registered).
    const stale = await client.query<{ id: string }>(
      `insert into users (email) values ($1) returning id`,
      [email],
    );

    const uid = randomUUID();
    const token = await signToken(uid, email);
    const auth = await buildAuthContext(client, token, JWT_SECRET);
    expect(auth).toEqual({ kind: 'user', userId: uid });

    const mine = await client.query<{ email: string }>(`select email from users where id = $1`, [uid]);
    expect(mine.rows[0]!.email).toBe(email); // verified owner gets the email

    const tombstoned = await client.query<{ email: string }>(`select email from users where id = $1`, [
      stale.rows[0]!.id,
    ]);
    expect(tombstoned.rows[0]!.email.startsWith('moved+')).toBe(true);
  });

  it('resolves active admin grants into an admin context', async () => {
    const uid = randomUUID();
    const token = await signToken(uid, 'admin@test.dev');
    await buildAuthContext(client, token, JWT_SECRET); // provision
    await client.query(`insert into admin_role_grants (user_id, role) values ($1, 'FINANCE_ADMIN')`, [uid]);

    const auth = await buildAuthContext(client, token, JWT_SECRET);
    expect(auth).toEqual({ kind: 'admin', userId: uid, roles: ['FINANCE_ADMIN'] });

    // Revoked grants stop counting.
    await client.query(`update admin_role_grants set revoked_at = now() where user_id = $1`, [uid]);
    expect((await buildAuthContext(client, token, JWT_SECRET)).kind).toBe('user');
  });
});

describe('dispatchBridge', () => {
  it('serves the whole user flow through the bridge (auth -> registry -> DB)', async () => {
    const uid = randomUUID();
    const token = await signToken(uid, 'flow@test.dev');

    // Unauthenticated -> 401 envelope.
    const anon = await dispatchBridge(client, { method: 'GET', path: '/api/v1/me' }, JWT_SECRET);
    expect(anon.status).toBe(401);

    // Authenticated -> /me reflects the provisioned row.
    const me = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/me', accessToken: token },
      JWT_SECRET,
    );
    expect(me.status).toBe(200);
    expect((me.body as { email: string }).email).toBe('flow@test.dev');

    // POST body + Idempotency-Key plumbing: fund then withdraw.
    await depositConfirmation(client, { userId: uid, amount: Money.of('50'), idempotencyKey: randomUUID() });
    const key = randomUUID();
    const withdraw = await dispatchBridge(
      client,
      {
        method: 'POST',
        path: '/api/v1/wallet/withdraw',
        body: { amount: '30', to_address: '0x4444444444444444444444444444444444444444' },
        idempotencyKey: key,
        accessToken: token,
      },
      JWT_SECRET,
    );
    expect(withdraw.status).toBe(200);
    expect((withdraw.body as { status: string }).status).toBe('LOCKED');

    // Missing Idempotency-Key is rejected by the registry.
    const missingKey = await dispatchBridge(
      client,
      {
        method: 'POST',
        path: '/api/v1/wallet/withdraw',
        body: { amount: '10', to_address: '0x4444444444444444444444444444444444444444' },
        accessToken: token,
      },
      JWT_SECRET,
    );
    expect(missingKey.status).toBe(400);
  });

  it('enforces the admin boundary end to end', async () => {
    const uid = randomUUID();
    const token = await signToken(uid, 'boundary@test.dev');

    const denied = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/admin/dashboard', accessToken: token },
      JWT_SECRET,
    );
    expect(denied.status).toBe(403);

    await client.query(`insert into admin_role_grants (user_id, role) values ($1, 'SUPER_ADMIN')`, [uid]);
    const allowed = await dispatchBridge(
      client,
      { method: 'GET', path: '/api/v1/admin/dashboard', accessToken: token },
      JWT_SECRET,
    );
    expect(allowed.status).toBe(200);
  });

  it('internal endpoints are unreachable through the web bridge', async () => {
    const uid = randomUUID();
    const token = await signToken(uid, 'internal-probe@test.dev');
    await buildAuthContext(client, token, JWT_SECRET); // provision the users row
    await client.query(`insert into admin_role_grants (user_id, role) values ($1, 'SUPER_ADMIN')`, [uid]);
    const probe = await dispatchBridge(
      client,
      { method: 'POST', path: '/internal/batch/start', accessToken: token, idempotencyKey: randomUUID() },
      JWT_SECRET,
    );
    expect(probe.status).toBe(403); // even a SUPER_ADMIN never gets 'internal' auth
  });
});
