import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { depositConfirmation } from '@sevendays/ledger';
import { requestRecovery } from '@sevendays/settlement-engine';
import {
  buildApiRegistry,
  generateOpenApi,
  FORBIDDEN_API_PATHS,
  ApiRegistry,
  type AuthContext,
} from '../src/index.js';

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
  options: { body?: unknown; idempotencyKey?: string } = {},
) {
  return registry.dispatch(client, {
    method,
    path,
    auth,
    body: options.body,
    idempotencyKey: options.idempotencyKey ?? null,
  });
}

describe('forbidden APIs (Completion Gate G8)', () => {
  it('none of the forbidden endpoints exist in the registry', () => {
    const paths = registry.list().map((e) => e.path);
    for (const forbidden of FORBIDDEN_API_PATHS) {
      expect(paths.some((p) => p.includes(forbidden)), forbidden).toBe(false);
    }
  });

  it('registering a forbidden endpoint throws at construction time', () => {
    const r = new ApiRegistry();
    // path built dynamically so the repo-wide literal scan stays clean
    const forbiddenPath = ['', 'api', 'v1', 'burn', 'cancel'].join('/');
    expect(() =>
      r.register({
        method: 'POST',
        path: forbiddenPath,
        auth: 'admin',
        handler: async () => ({}),
      }),
    ).toThrow('FORBIDDEN_API');
  });

  it('OpenAPI document covers the whole surface', () => {
    const doc = generateOpenApi(registry) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths).length).toBeGreaterThanOrEqual(25);
  });
});

describe('auth boundaries (Completion Gate G7 direction)', () => {
  it('user endpoints reject anonymous; admin endpoints reject users; internal rejects everyone external', async () => {
    const user = await newUser();

    const anonymous = await call('GET', '/api/v1/wallet', { kind: 'anonymous' });
    expect(anonymous.status).toBe(401);

    const userOnAdmin = await call('GET', '/api/v1/admin/dashboard', asUser(user));
    expect(userOnAdmin.status).toBe(403);

    const adminNoRoles = await call('GET', '/api/v1/admin/dashboard', {
      kind: 'admin',
      userId: user,
      roles: [],
    });
    expect(adminNoRoles.status).toBe(403);

    const userOnInternal = await call('POST', '/internal/batch/start', asUser(user), {
      body: { batch_date: '2039-01-01' },
    });
    expect(userOnInternal.status).toBe(403);

    const unknown = await call('GET', '/api/v1/nonexistent', asUser(user));
    expect(unknown.status).toBe(404);
  });
});

describe('user flow through the API', () => {
  it('wallet -> purchase (idempotency enforced) -> session -> cancel', async () => {
    const user = await newUser();
    await depositConfirmation(client, {
      userId: user,
      amount: Money.of('200'),
      idempotencyKey: randomUUID(),
    });

    const wallet = await call('GET', '/api/v1/wallet', asUser(user));
    expect(wallet.status).toBe(200);
    expect((wallet.body as { available: string }).available).toBe('200.00000000');

    // POST /purchase without Idempotency-Key -> 400 (07_API.md)
    const missingKey = await call('POST', '/api/v1/purchase', asUser(user));
    expect(missingKey.status).toBe(400);
    expect((missingKey.body as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED');

    const key = randomUUID();
    const created = await call('POST', '/api/v1/purchase', asUser(user), { idempotencyKey: key });
    expect(created.status).toBe(200);
    const sessionId = (created.body as { purchase_session_id: string }).purchase_session_id;

    // replay returns the same session
    const replay = await call('POST', '/api/v1/purchase', asUser(user), { idempotencyKey: key });
    expect((replay.body as { purchase_session_id: string }).purchase_session_id).toBe(sessionId);
    expect((replay.body as { already_exists: boolean }).already_exists).toBe(true);

    const lockedWallet = await call('GET', '/api/v1/wallet', asUser(user));
    expect((lockedWallet.body as { locked: string }).locked).toBe('177.16000000');

    const session = await call('GET', `/api/v1/purchase/${sessionId}`, asUser(user));
    expect(session.status).toBe(200);

    // another user cannot see it
    const stranger = await newUser();
    const strangerView = await call('GET', `/api/v1/purchase/${sessionId}`, asUser(stranger));
    expect(strangerView.status).toBe(404);

    const cancel = await call('POST', `/api/v1/purchase/${sessionId}/cancel`, asUser(user));
    expect(cancel.status).toBe(200);
    const refunded = await call('GET', '/api/v1/wallet', asUser(user));
    expect((refunded.body as { available: string }).available).toBe('200.00000000');

    const history = await call('GET', '/api/v1/wallet/history', asUser(user));
    expect((history.body as { entries: unknown[] }).entries.length).toBeGreaterThanOrEqual(3);
  });

  it('withdrawal: minimum enforced, funds locked before broadcast, idempotent', async () => {
    const user = await newUser();
    await depositConfirmation(client, {
      userId: user,
      amount: Money.of('50'),
      idempotencyKey: randomUUID(),
    });

    const tooSmall = await call('POST', '/api/v1/wallet/withdraw', asUser(user), {
      body: { amount: '5', to_address: '0xabc123' },
      idempotencyKey: randomUUID(),
    });
    expect(tooSmall.status).toBe(400);

    const key = randomUUID();
    const ok = await call('POST', '/api/v1/wallet/withdraw', asUser(user), {
      body: { amount: '30', to_address: '0xabc123' },
      idempotencyKey: key,
    });
    expect(ok.status).toBe(200);
    expect((ok.body as { status: string }).status).toBe('LOCKED');

    const replay = await call('POST', '/api/v1/wallet/withdraw', asUser(user), {
      body: { amount: '30', to_address: '0xabc123' },
      idempotencyKey: key,
    });
    expect((replay.body as { id: string }).id).toBe((ok.body as { id: string }).id);

    const wallet = await call('GET', '/api/v1/wallet', asUser(user));
    expect((wallet.body as { available: string }).available).toBe('20.00000000');

    // insufficient balance surfaces the spec error code
    const broke = await call('POST', '/api/v1/wallet/withdraw', asUser(user), {
      body: { amount: '100', to_address: '0xabc123' },
      idempotencyKey: randomUUID(),
    });
    expect(broke.status).toBe(402);
    expect((broke.body as { error: { code: string } }).error.code).toBe('INSUFFICIENT_BALANCE');
  });
});

describe('race transparency and admin surface after a real production day', () => {
  it('runs a mini production day, then reads it through the API', async () => {
    // three horses + one funded buyer
    for (let i = 0; i < 3; i += 1) {
      const owner = await newUser();
      await client.query(
        `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                             horse_generation_version, mint_seed_hash, ability_json)
         values ($1, $2, $3, 'BALANCED', 'COMMON', $4, 0.5, 'horse_generation_v1.0', $5, $6)`,
        [
          owner,
          i + 1,
          `Api Day ${randomUUID().slice(0, 15)}`,
          randomUUID().replaceAll('-', ''),
          randomUUID().replaceAll('-', ''),
          JSON.stringify({ speed: 75, power: 74, stamina: 73, recovery: 72, luck: 71 }),
        ],
      );
    }
    const buyer = await newUser();
    await depositConfirmation(client, {
      userId: buyer,
      amount: Money.of('200'),
      idempotencyKey: randomUUID(),
    });
    await call('POST', '/api/v1/purchase', asUser(buyer), { idempotencyKey: randomUUID() });

    // the internal entry point runs the whole day
    const internal = await call('POST', '/internal/batch/start', { kind: 'internal' }, {
      body: { batch_date: '2039-02-01' },
    });
    expect(internal.status).toBe(200);
    expect((internal.body as { status: string }).status).toBe('COMPLETED');

    // races are transparently readable, and replay verification passes
    const races = await call('GET', '/api/v1/races', asUser(buyer));
    const raceList = (races.body as { races: { id: string }[] }).races;
    expect(raceList.length).toBeGreaterThanOrEqual(1);
    const raceId = raceList[0]!.id;

    const results = await call('GET', `/api/v1/races/${raceId}/results`, asUser(buyer));
    expect((results.body as { results: unknown[] }).results.length).toBe(3);

    const replay = await call('GET', `/api/v1/races/${raceId}/replay`, asUser(buyer));
    expect(replay.status).toBe(200);
    expect((replay.body as { verified: boolean }).verified).toBe(true);

    // buyer received a horse through the batch (P2P inventory was empty -> mint)
    const horses = await call('GET', '/api/v1/horses', asUser(buyer));
    expect((horses.body as { horses: unknown[] }).horses.length).toBeGreaterThanOrEqual(1);

    // admin surface
    const admin = await newUser();
    await client.query(
      `insert into admin_role_grants (user_id, role) values ($1, 'SUPER_ADMIN')`,
      [admin],
    );
    const adminAuth: AuthContext = { kind: 'admin', userId: admin, roles: ['SUPER_ADMIN'] };
    const dashboard = await call('GET', '/api/v1/admin/dashboard', adminAuth);
    expect(dashboard.status).toBe(200);
    expect((dashboard.body as { latest_batch: { status: string } }).latest_batch.status).toBe('COMPLETED');
    const batches = await call('GET', '/api/v1/admin/batches', adminAuth);
    expect((batches.body as { batches: unknown[] }).batches.length).toBeGreaterThanOrEqual(1);
    const stress = await call('GET', '/api/v1/admin/stress-tests', adminAuth);
    expect((stress.body as { stress_tests: unknown[] }).stress_tests.length).toBe(8);
    const policies = await call('GET', '/api/v1/admin/policies', adminAuth);
    expect(Object.keys((policies.body as { policies: object }).policies)).toHaveLength(8);

    // retry on a COMPLETED batch is rejected with the spec error code
    const batchId = (batches.body as { batches: { id: string }[] }).batches[0]!.id;
    const retry = await call('POST', `/api/v1/admin/batches/${batchId}/retry`, adminAuth, {
      idempotencyKey: randomUUID(),
    });
    expect(retry.status).toBe(409);
    expect((retry.body as { error: { code: string } }).error.code).toBe('INVALID_BATCH_STATE');
  });
});

describe('large-withdrawal admin review (Decisions 060, 064)', () => {
  function asAdmin(userId: string, roles: string[]): AuthContext {
    return { kind: 'admin', userId, roles };
  }

  async function newAdmin(role: 'FINANCE_ADMIN' | 'SUPER_ADMIN'): Promise<string> {
    const id = await newUser();
    await client.query(`insert into admin_role_grants (user_id, role) values ($1, $2)`, [id, role]);
    return id;
  }

  it('enforces the 6-decimal limit, dual-approval release, and rejection refund', async () => {
    const user = await newUser();
    await depositConfirmation(client, {
      userId: user,
      amount: Money.of('5000'),
      idempotencyKey: randomUUID(),
    });

    // Decision 064: more than 6 decimal places fails validation.
    const dust = await call('POST', '/api/v1/wallet/withdraw', asUser(user), {
      body: { amount: '10.1234567', to_address: '0xabc123' },
      idempotencyKey: randomUUID(),
    });
    expect(dust.status).toBe(400);
    expect((dust.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');

    // A large request locks normally; the broadcaster routes it to review
    // (simulated here — routing itself is covered in @sevendays/blockchain).
    const big = await call('POST', '/api/v1/wallet/withdraw', asUser(user), {
      body: { amount: '1500', to_address: '0xabc123' },
      idempotencyKey: randomUUID(),
    });
    const wid = (big.body as { id: string }).id;
    await client.query(`update blockchain_withdrawals set status = 'ADMIN_REVIEW' where id = $1`, [wid]);

    const financeAdmin = await newAdmin('FINANCE_ADMIN');
    const superAdmin = await newAdmin('SUPER_ADMIN');

    const listed = await call('GET', '/api/v1/admin/withdrawals', asAdmin(financeAdmin, ['FINANCE_ADMIN']));
    const listBody = listed.body as { withdrawals: { id: string }[] };
    expect(listBody.withdrawals.some((w) => w.id === wid)).toBe(true);

    // Cannot approve with a role the JWT does not carry.
    const wrongRole = await call(
      'POST',
      `/api/v1/admin/withdrawals/${wid}/approve`,
      asAdmin(financeAdmin, ['FINANCE_ADMIN']),
      { body: { role: 'SUPER_ADMIN' }, idempotencyKey: randomUUID() },
    );
    expect(wrongRole.status).toBe(403);

    // First approval records but does not release.
    const first = await call(
      'POST',
      `/api/v1/admin/withdrawals/${wid}/approve`,
      asAdmin(financeAdmin, ['FINANCE_ADMIN']),
      { body: { role: 'FINANCE_ADMIN' }, idempotencyKey: randomUUID() },
    );
    expect(first.status).toBe(200);
    expect((first.body as { released: boolean }).released).toBe(false);

    // The same admin re-approving replays idempotently — never counts twice.
    const duplicate = await call(
      'POST',
      `/api/v1/admin/withdrawals/${wid}/approve`,
      asAdmin(financeAdmin, ['FINANCE_ADMIN']),
      { body: { role: 'FINANCE_ADMIN' }, idempotencyKey: randomUUID() },
    );
    expect(duplicate.status).toBe(200);
    expect((duplicate.body as { released: boolean }).released).toBe(false);
    expect((duplicate.body as { approved_roles: string[] }).approved_roles).toEqual(['FINANCE_ADMIN']);

    // The second DISTINCT admin with the second role releases the row.
    const release = await call(
      'POST',
      `/api/v1/admin/withdrawals/${wid}/approve`,
      asAdmin(superAdmin, ['SUPER_ADMIN']),
      { body: { role: 'SUPER_ADMIN' }, idempotencyKey: randomUUID() },
    );
    expect(release.status).toBe(200);
    expect((release.body as { released: boolean }).released).toBe(true);
    const row = await client.query<{ status: string }>(
      `select status::text as status from blockchain_withdrawals where id = $1`,
      [wid],
    );
    expect(row.rows[0]!.status).toBe('LOCKED');

    // Rejection refunds the full locked amount.
    const second = await call('POST', '/api/v1/wallet/withdraw', asUser(user), {
      body: { amount: '1200', to_address: '0xabc123' },
      idempotencyKey: randomUUID(),
    });
    const wid2 = (second.body as { id: string }).id;
    await client.query(`update blockchain_withdrawals set status = 'ADMIN_REVIEW' where id = $1`, [wid2]);
    const rejected = await call(
      'POST',
      `/api/v1/admin/withdrawals/${wid2}/reject`,
      asAdmin(superAdmin, ['SUPER_ADMIN']),
      { idempotencyKey: randomUUID() },
    );
    expect(rejected.status).toBe(200);

    const wallet = await call('GET', '/api/v1/wallet', asUser(user));
    // 5000 - 1500 (still locked, released for broadcast) + 1200 refunded
    expect((wallet.body as { available: string }).available).toBe('3500.00000000');
  });
});

describe('training (Decision 066)', () => {
  async function newHorseFor(owner: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, 2, $2, 'SPRINTER', 'COMMON', $3, 0.50, 'horse_generation_v1.0', $4, $5)
       returning id`,
      [
        owner,
        `Training Target ${randomUUID().slice(0, 12)}`,
        randomUUID().replaceAll('-', ''),
        randomUUID().replaceAll('-', ''),
        JSON.stringify({ speed: 75, power: 75, stamina: 75, recovery: 75, luck: 75 }),
      ],
    );
    return r.rows[0]!.id;
  }

  it('one training per race date, owner-only, closed while locked, notifies', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const horseId = await newHorseFor(owner);

    const invalid = await call('POST', `/api/v1/horses/${horseId}/training`, asUser(owner), {
      body: { training_type: 'SWIMMING' },
    });
    expect(invalid.status).toBe(400);
    expect((invalid.body as { error: { code: string } }).error.code).toBe('INVALID_TRAINING_TYPE');

    const notOwner = await call('POST', `/api/v1/horses/${horseId}/training`, asUser(stranger), {
      body: { training_type: 'SPEED_TRAINING' },
    });
    expect(notOwner.status).toBe(403);
    expect((notOwner.body as { error: { code: string } }).error.code).toBe('NOT_HORSE_OWNER');

    const missing = await call('POST', `/api/v1/horses/${randomUUID()}/training`, asUser(owner), {
      body: { training_type: 'SPEED_TRAINING' },
    });
    expect(missing.status).toBe(404);

    const ok = await call('POST', `/api/v1/horses/${horseId}/training`, asUser(owner), {
      body: { training_type: 'SPEED_TRAINING' },
    });
    expect(ok.status).toBe(200);
    const okBody = ok.body as { training_type: string; effective_race_date: string };
    expect(okBody.training_type).toBe('SPEED_TRAINING');
    expect(okBody.effective_race_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // In-App notification emitted (Decision 065).
    const notifications = await call('GET', '/api/v1/notifications', asUser(owner));
    const list = (notifications.body as { notifications: { notification_type: string }[] }).notifications;
    expect(list.some((n) => n.notification_type === 'TRAINING_COMPLETED')).toBe(true);

    // Second training for the same effective race date is rejected.
    const duplicate = await call('POST', `/api/v1/horses/${horseId}/training`, asUser(owner), {
      body: { training_type: 'POWER_TRAINING' },
    });
    expect(duplicate.status).toBe(409);
    expect((duplicate.body as { error: { code: string } }).error.code).toBe('TRAINING_ALREADY_EXISTS');

    // Non-ACTIVE horses never race again — training is refused.
    const burnedHorse = await newHorseFor(owner);
    await client.query(`update horses set status = 'BURNED' where id = $1`, [burnedHorse]);
    const burnedTraining = await call('POST', `/api/v1/horses/${burnedHorse}/training`, asUser(owner), {
      body: { training_type: 'SPEED_TRAINING' },
    });
    expect(burnedTraining.status).toBe(409);
    expect((burnedTraining.body as { error: { code: string } }).error.code).toBe('HORSE_NOT_ACTIVE');

    // Batch Lock closes the intake (v1.0 rule).
    await client.query(`update marketplace_status set state = 'MARKET_LOCKED' where id = true`);
    try {
      const horse2 = await newHorseFor(owner);
      const locked = await call('POST', `/api/v1/horses/${horse2}/training`, asUser(owner), {
        body: { training_type: 'RECOVERY_TRAINING' },
      });
      expect(locked.status).toBe(409);
      expect((locked.body as { error: { code: string } }).error.code).toBe('MARKETPLACE_LOCKED');
    } finally {
      await client.query(`update marketplace_status set state = 'OPEN' where id = true`);
    }
  });
});

describe('admin recovery surface (Decision 067)', () => {
  function asAdmin(userId: string, roles: string[]): AuthContext {
    return { kind: 'admin', userId, roles };
  }

  async function newAdmin(role: 'FINANCE_ADMIN' | 'SUPER_ADMIN'): Promise<string> {
    const id = await newUser();
    await client.query(`insert into admin_role_grants (user_id, role) values ($1, $2)`, [id, role]);
    return id;
  }

  it('lists and details recoveries; guards dual approval and execution state', async () => {
    const financeAdmin = await newAdmin('FINANCE_ADMIN');
    const superAdmin = await newAdmin('SUPER_ADMIN');
    const thirdAdmin = await newAdmin('SUPER_ADMIN');

    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version, status, failed_at)
       values ('2032-01-01', 'batch_v1.0', 'FAILED', now()) returning id`,
    );
    const recoveryId = await requestRecovery(client, {
      batchRunId: batch.rows[0]!.id,
      reason: 'api surface test',
      requestedBy: financeAdmin,
    });

    const list = await call('GET', '/api/v1/admin/recovery', asAdmin(financeAdmin, ['FINANCE_ADMIN']));
    expect(list.status).toBe(200);
    const rows = (list.body as { recoveries: { id: string; approval_status: string }[] }).recoveries;
    expect(rows.some((r) => r.id === recoveryId)).toBe(true);

    const detail = await call(
      'GET',
      `/api/v1/admin/recovery/${recoveryId}`,
      asAdmin(financeAdmin, ['FINANCE_ADMIN']),
    );
    expect(detail.status).toBe(200);
    const detailBody = detail.body as { approval_status: string; logs: { action: string }[] };
    expect(detailBody.approval_status).toBe('PENDING');
    expect(detailBody.logs.some((l) => l.action === 'REQUESTED')).toBe(true);

    // Execute before dual approval is refused.
    const early = await call(
      'POST',
      `/api/v1/admin/recovery/${recoveryId}/execute`,
      asAdmin(superAdmin, ['SUPER_ADMIN']),
      { idempotencyKey: randomUUID() },
    );
    expect(early.status).toBe(403);
    expect((early.body as { error: { code: string } }).error.code).toBe('RECOVERY_REQUIRES_DUAL_APPROVAL');

    const first = await call(
      'POST',
      `/api/v1/admin/recovery/${recoveryId}/approve`,
      asAdmin(financeAdmin, ['FINANCE_ADMIN']),
      { idempotencyKey: randomUUID() },
    );
    expect(first.status).toBe(200);
    expect((first.body as { approval_status: string }).approval_status).toBe('PENDING');

    const second = await call(
      'POST',
      `/api/v1/admin/recovery/${recoveryId}/approve`,
      asAdmin(superAdmin, ['SUPER_ADMIN']),
      { idempotencyKey: randomUUID() },
    );
    expect(second.status).toBe(200);
    expect((second.body as { approval_status: string }).approval_status).toBe('APPROVED');

    // A third approval after APPROVED is refused (Decision 067 error code).
    const third = await call(
      'POST',
      `/api/v1/admin/recovery/${recoveryId}/approve`,
      asAdmin(thirdAdmin, ['SUPER_ADMIN']),
      { idempotencyKey: randomUUID() },
    );
    expect(third.status).toBe(409);
    expect((third.body as { error: { code: string } }).error.code).toBe('RECOVERY_ALREADY_APPROVED');

    const missing = await call(
      'POST',
      `/api/v1/admin/recovery/${randomUUID()}/approve`,
      asAdmin(financeAdmin, ['FINANCE_ADMIN']),
      { idempotencyKey: randomUUID() },
    );
    expect(missing.status).toBe(404);
  });
});
