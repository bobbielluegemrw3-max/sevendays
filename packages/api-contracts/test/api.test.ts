import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { depositConfirmation, getPlatformAccountId, postTransaction } from '@sevendays/ledger';
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

    // The session list shows the user's OWN sessions (UI fix, 2026-07-04).
    const list = await call('GET', '/api/v1/purchase', asUser(user));
    expect(list.status).toBe(200);
    const sessions = (list.body as { sessions: { id: string }[] }).sessions;
    expect(sessions.some((s) => s.id === sessionId)).toBe(true);

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
    const horseOwners: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const owner = await newUser();
      horseOwners.push(owner);
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
    // Capitalize the buyback reserve for the three synthetic horses: in
    // production every horse enters via a mint that funds its own coverage;
    // horses inserted out of thin air would otherwise trip the Decision 069
    // mint coverage gate (which is exactly its job).
    await postTransaction(client, {
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey: `test:capitalize:${randomUUID()}`,
      entries: [
        {
          accountId: await getPlatformAccountId(client, 'PLATFORM_DEPOSIT_CLEARING'),
          direction: 'DEBIT',
          amount: Money.of('1000'),
        },
        {
          accountId: await getPlatformAccountId(client, 'PLATFORM_BUYBACK_RESERVE'),
          direction: 'CREDIT',
          amount: Money.of('1000'),
        },
      ],
    });

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

    // あなたのレース記録(オーナー指示 2026-07-10): 買い手には新規発行の入手が見える
    const record = await call('GET', '/api/v1/daily-derby/my-results/latest', asUser(buyer));
    expect(record.status).toBe(200);
    const rec = record.body as {
      date: string | null;
      dates: string[];
      burned: unknown[];
      survived: unknown[];
      sold: unknown[];
      bought: { is_mint: boolean; counterpart: string | null; price: string }[];
    };
    expect(rec.date).toBe('2039-02-01');
    expect(rec.dates).toContain('2039-02-01');
    expect(rec.bought.length).toBeGreaterThanOrEqual(1);
    expect(rec.bought[0]!.is_mint).toBe(true);
    expect(rec.bought[0]!.counterpart).toBeNull();
    // 出走した馬のオーナーには、その馬がBURNまたは生存のどちらかで必ず1件見える
    const ownerRecord = await call(
      'GET',
      '/api/v1/daily-derby/my-results/2039-02-01',
      asUser(horseOwners[0]!),
    );
    const oRec = ownerRecord.body as { burned: unknown[]; survived: unknown[] };
    expect(oRec.burned.length + oRec.survived.length).toBe(1);
    // 不正な日付は 400
    const badDate = await call('GET', '/api/v1/daily-derby/my-results/not-a-date', asUser(buyer));
    expect(badDate.status).toBe(400);

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

describe('wallet linking (Decision 072)', () => {
  it('links a wallet with a fresh signed proof; rejects reuse, forgery, and stale proofs', async () => {
    const { privateKeyToAccount } = await import('viem/accounts');
    const { buildWalletLinkMessage } = await import('@sevendays/blockchain');
    const wallet = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    );

    const user = await newUser();
    const message = buildWalletLinkMessage(user, new Date().toISOString());
    const signature = await wallet.signMessage({ message });

    const linked = await call('POST', '/api/v1/account/link-wallet', asUser(user), {
      body: { address: wallet.address, message, signature },
    });
    expect(linked.status).toBe(200);
    expect((linked.body as { linked: string }).linked).toBe(wallet.address.toLowerCase());

    const list = await call('GET', '/api/v1/account/wallets', asUser(user));
    expect(
      (list.body as { wallets: { wallet_address: string }[] }).wallets.map((w) => w.wallet_address),
    ).toEqual([wallet.address.toLowerCase()]);

    // One wallet = one account: a second account cannot claim it.
    const thief = await newUser();
    const thiefMessage = buildWalletLinkMessage(thief, new Date().toISOString());
    const thiefSignature = await wallet.signMessage({ message: thiefMessage });
    const stolen = await call('POST', '/api/v1/account/link-wallet', asUser(thief), {
      body: { address: wallet.address, message: thiefMessage, signature: thiefSignature },
    });
    expect(stolen.status).toBe(409);
    expect((stolen.body as { error: { code: string } }).error.code).toBe('WALLET_ALREADY_LINKED');

    // Forged signature (message signed by a different key) is rejected.
    const otherKey = privateKeyToAccount(
      '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
    );
    const forged = await call('POST', '/api/v1/account/link-wallet', asUser(thief), {
      body: {
        address: wallet.address,
        message: thiefMessage,
        signature: await otherKey.signMessage({ message: thiefMessage }),
      },
    });
    expect(forged.status).toBe(400);

    // Stale proof (issued 20 minutes ago) is rejected.
    const stale = buildWalletLinkMessage(user, new Date(Date.now() - 20 * 60_000).toISOString());
    const staleAttempt = await call('POST', '/api/v1/account/link-wallet', asUser(user), {
      body: { address: wallet.address, message: stale, signature: await wallet.signMessage({ message: stale }) },
    });
    expect(staleAttempt.status).toBe(400);

    // Unlink works and is idempotent-ish (second call 404s).
    const unlink = await call('POST', '/api/v1/account/unlink-wallet', asUser(user), {
      body: { address: wallet.address },
    });
    expect(unlink.status).toBe(200);
    const again = await call('POST', '/api/v1/account/unlink-wallet', asUser(user), {
      body: { address: wallet.address },
    });
    expect(again.status).toBe(404);
  });
});

describe('support bonus network (Decision 074)', () => {
  async function referredUser(sponsorId: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `insert into users (email, direct_referrer_user_id) values ($1, $2) returning id`,
      [`${randomUUID()}@test.dev`, sponsorId],
    );
    return r.rows[0]!.id;
  }

  it('summary exposes the referral code, tier status and pool count', async () => {
    const sponsor = await newUser();
    await referredUser(sponsor);
    await referredUser(sponsor);

    const res = await call('GET', '/api/v1/support/summary', asUser(sponsor));
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.referral_code).toMatch(/^[0-9a-f]{12}$/);
    expect(body.unlocked_tiers).toBe(1); // no referral volume yet
    expect(body.max_tiers).toBe(7);
    expect(body.pool_count).toBe(2);
    expect(body.tier_amounts).toEqual(['3.00', '2.00', '1.00', '1.00', '1.00', '1.00', '1.00']);
  });

  it('MetaMask-first members display as a masked wallet, not the synthetic email', async () => {
    const sponsor = await newUser();
    const walletUid = randomUUID();
    await client.query(
      `insert into users (id, email, direct_referrer_user_id) values ($1, $2, $3)`,
      [walletUid, `${walletUid}@user.sevendays`, sponsor],
    );
    await client.query(`insert into user_wallets (user_id, wallet_address) values ($1, $2)`, [
      walletUid,
      '0xabcdef1234567890abcdef1234567890abcdef12',
    ]);
    const pool = await call('GET', '/api/v1/support/pool', asUser(sponsor));
    const member = (pool.body as { members: { user_id: string; display: string }[] }).members.find(
      (m) => m.user_id === walletUid,
    );
    expect(member?.display).toBe('0xabcd…ef12');
  });

  it('place: sponsor-only, in-scope-only, one-shot', async () => {
    const sponsor = await newUser();
    const memberA = await referredUser(sponsor);
    const memberB = await referredUser(sponsor);
    const stranger = await newUser();

    // A stranger cannot place someone else's referral.
    const forbidden = await call('POST', '/api/v1/support/place', asUser(stranger), {
      body: { user_id: memberA, parent_user_id: stranger },
    });
    expect(forbidden.status).toBe(403);

    // The sponsor places A directly under themself (unlimited width).
    const placeA = await call('POST', '/api/v1/support/place', asUser(sponsor), {
      body: { user_id: memberA, parent_user_id: sponsor },
    });
    expect(placeA.status).toBe(200);

    // Replay converges quietly.
    const replay = await call('POST', '/api/v1/support/place', asUser(sponsor), {
      body: { user_id: memberA, parent_user_id: sponsor },
    });
    expect(replay.status).toBe(200);

    // Out-of-scope parent (a stranger's node) is rejected.
    const outOfScope = await call('POST', '/api/v1/support/place', asUser(sponsor), {
      body: { user_id: memberB, parent_user_id: stranger },
    });
    expect(outOfScope.status).toBe(400);

    // B goes under A (depth placement inside the sponsor's subtree).
    const placeB = await call('POST', '/api/v1/support/place', asUser(sponsor), {
      body: { user_id: memberB, parent_user_id: memberA },
    });
    expect(placeB.status).toBe(200);

    // Placement is permanent — a second, different placement is refused.
    const change = await call('POST', '/api/v1/support/place', asUser(sponsor), {
      body: { user_id: memberB, parent_user_id: sponsor },
    });
    expect(change.status).toBe(409);

    // The pool drained and the network shows both tiers.
    const pool = await call('GET', '/api/v1/support/pool', asUser(sponsor));
    expect((pool.body as { members: unknown[] }).members).toHaveLength(0);
    const network = await call('GET', '/api/v1/support/network', asUser(sponsor));
    const nodes = (network.body as { nodes: { user_id: string; tier: number }[] }).nodes;
    expect(nodes.find((n) => n.user_id === memberA)?.tier).toBe(1);
    expect(nodes.find((n) => n.user_id === memberB)?.tier).toBe(2);

    // Audit rows exist for both placements.
    const audit = await client.query<{ count: string }>(
      `select count(*)::text as count from placement_audit
       where user_id = any($1) and action = 'PLACE'`,
      [[memberA, memberB]],
    );
    expect(audit.rows[0]!.count).toBe('2');
  });

  it('admin replace requires SUPER_ADMIN and writes the override audit', async () => {
    const sponsor = await newUser();
    const member = await referredUser(sponsor);
    await call('POST', '/api/v1/support/place', asUser(sponsor), {
      body: { user_id: member, parent_user_id: sponsor },
    });
    const newParent = await newUser();

    const plainAdmin: AuthContext = { kind: 'admin', userId: await newUser(), roles: ['FINANCE_ADMIN'] };
    const refused = await call('POST', '/api/v1/admin/support/replace', plainAdmin, {
      body: { user_id: member, new_parent_user_id: newParent, reason: 'support ticket 123' },
    });
    expect(refused.status).toBe(403);

    const superAdmin: AuthContext = { kind: 'admin', userId: await newUser(), roles: ['SUPER_ADMIN'] };
    const moved = await call('POST', '/api/v1/admin/support/replace', superAdmin, {
      body: { user_id: member, new_parent_user_id: newParent, reason: 'support ticket 123' },
    });
    expect(moved.status).toBe(200);

    const placed = await client.query<{ p: string }>(
      `select placement_parent_user_id::text as p from users where id = $1`,
      [member],
    );
    expect(placed.rows[0]!.p).toBe(newParent);
    const audit = await client.query<{ count: string }>(
      `select count(*)::text as count from placement_audit where user_id = $1 and action = 'ADMIN_OVERRIDE'`,
      [member],
    );
    expect(audit.rows[0]!.count).toBe('1');

    // The override flag did not leak: normal users still cannot re-place.
    const sneaky = await call('POST', '/api/v1/support/place', asUser(sponsor), {
      body: { user_id: member, parent_user_id: sponsor },
    });
    expect(sneaky.status).toBe(409);
  });
});

describe('manual marketplace (Decision 076)', () => {
  async function newHorse(ownerId: string, day: number): Promise<string> {
    const r = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, $2, $3, 'BALANCED', 'COMMON', $4, 0.5, 'horse_generation_v1.0', $5, $6)
       returning id`,
      [
        ownerId,
        day,
        `Mkt Horse ${randomUUID().slice(0, 15)}`,
        randomUUID().replaceAll('-', ''),
        randomUUID().replaceAll('-', ''),
        JSON.stringify({ speed: 75, power: 74, stamina: 73, recovery: 72, luck: 71 }),
      ],
    );
    return r.rows[0]!.id;
  }

  it('list -> visible on the place -> unlist is next-batch pending; one action per day', async () => {
    const seller = await newUser();
    const horse = await newHorse(seller, 3);

    // Day-range guard: a Day0 horse cannot be listed.
    const day0 = await newHorse(seller, 0);
    const tooEarly = await call('POST', '/api/v1/market/list', asUser(seller), {
      body: { horse_id: day0 },
    });
    expect(tooEarly.status).toBe(400);

    // Others cannot list my horse.
    const stranger = await newUser();
    const notOwner = await call('POST', '/api/v1/market/list', asUser(stranger), {
      body: { horse_id: horse },
    });
    expect(notOwner.status).toBe(403);

    const listed = await call('POST', '/api/v1/market/list', asUser(seller), {
      body: { horse_id: horse },
    });
    expect(listed.status).toBe(200);
    expect((listed.body as { price: string }).price).toBe('133.10'); // Day3 ladder

    // Already listed -> 409.
    const dup = await call('POST', '/api/v1/market/list', asUser(seller), {
      body: { horse_id: horse },
    });
    expect(dup.status).toBe(409);

    // Visible on the place, in matching order, with my_listings populated.
    const place = await call('GET', '/api/v1/market/place', asUser(seller));
    expect(place.status).toBe(200);
    const placeBody = place.body as {
      shelf: { horse_id: string; price: string }[];
      my_listings: { horse_id: string; cancel_after_batch: boolean }[];
      pending_buy_count: number;
    };
    expect(placeBody.shelf.some((s) => s.horse_id === horse)).toBe(true);
    expect(placeBody.my_listings.some((l) => l.horse_id === horse)).toBe(true);
    expect(typeof placeBody.pending_buy_count).toBe('number');

    // Unlist the SAME day -> blocked by the one-action-per-day rule.
    const sameDay = await call('POST', '/api/v1/market/unlist', asUser(seller), {
      body: { horse_id: horse },
    });
    expect(sameDay.status).toBe(409);

    // Simulate the next day, then unlist -> pending until after the batch.
    await client.query(`update horses set last_manual_market_action_date = null where id = $1`, [horse]);
    const unlist = await call('POST', '/api/v1/market/unlist', asUser(seller), {
      body: { horse_id: horse },
    });
    expect(unlist.status).toBe(200);
    expect((unlist.body as { cancel_pending: boolean }).cancel_pending).toBe(true);

    // Replaying the unlist converges quietly.
    const replay = await call('POST', '/api/v1/market/unlist', asUser(seller), {
      body: { horse_id: horse },
    });
    expect(replay.status).toBe(200);
    expect((replay.body as { replay?: boolean }).replay).toBe(true);

    // Still LISTED until the batch completes (tonight's matching wins).
    const still = await client.query<{ status: string; cancel_after_batch: boolean }>(
      `select status::text as status, cancel_after_batch from market_listings where horse_id = $1`,
      [horse],
    );
    expect(still.rows[0]!.status).toBe('LISTED');
    expect(still.rows[0]!.cancel_after_batch).toBe(true);
  });
});

describe('item system (Decisions 078/079)', () => {
  async function fundedUser(amount = '100'): Promise<string> {
    const id = await newUser();
    await depositConfirmation(client, {
      userId: id,
      amount: Money.of(amount),
      idempotencyKey: randomUUID(),
    });
    return id;
  }

  async function itemHorse(ownerId: string, day: number): Promise<string> {
    const r = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, $2, $3, 'SPRINTER', 'COMMON', $4, 0.5, 'horse_generation_v1.0', $5, $6)
       returning id`,
      [
        ownerId,
        day,
        `Item Horse ${randomUUID().slice(0, 14)}`,
        randomUUID().replaceAll('-', ''),
        randomUUID().replaceAll('-', ''),
        JSON.stringify({ speed: 75, power: 74, stamina: 73, recovery: 72, luck: 71 }),
      ],
    );
    return r.rows[0]!.id;
  }

  it('catalog serves the 35 items; burn drops are not purchasable', async () => {
    const user = await fundedUser();
    const catalog = await call('GET', '/api/v1/items/catalog', asUser(user));
    expect(catalog.status).toBe(200);
    expect((catalog.body as { items: unknown[] }).items).toHaveLength(35);
    const drop = await call('POST', '/api/v1/items/purchase', asUser(user), {
      body: { item_key: 'memento_horseshoe' },
    });
    expect(drop.status).toBe(400);
  });

  it('purchase -> inventory -> apply -> one per horse -> cancel returns the unit', async () => {
    const user = await fundedUser();
    const horse = await itemHorse(user, 2);

    const poor = await newUser();
    const broke = await call('POST', '/api/v1/items/purchase', asUser(poor), {
      body: { item_key: 'sugar_cube' },
    });
    expect(broke.status).toBe(402);

    const buy = await call('POST', '/api/v1/items/purchase', asUser(user), {
      body: { item_key: 'sugar_cube', quantity: 2 },
    });
    expect(buy.status).toBe(200);
    expect((buy.body as { total: string }).total).toBe('2');

    const inv = await call('GET', '/api/v1/items/inventory', asUser(user));
    expect((inv.body as { available: { item_key: string; n: number }[] }).available).toEqual([
      { item_key: 'sugar_cube', n: 2 },
    ]);

    const apply = await call('POST', `/api/v1/horses/${horse}/item`, asUser(user), {
      body: { item_key: 'sugar_cube' },
    });
    expect(apply.status).toBe(200);

    const again = await call('POST', `/api/v1/horses/${horse}/item`, asUser(user), {
      body: { item_key: 'sugar_cube' },
    });
    expect(again.status).toBe(409);

    const cancel = await call('POST', `/api/v1/horses/${horse}/item/cancel`, asUser(user), {});
    expect(cancel.status).toBe(200);
    const inv2 = await call('GET', '/api/v1/items/inventory', asUser(user));
    expect((inv2.body as { available: { n: number }[] }).available[0]!.n).toBe(2);
    // slot freed — reapply works
    const reapply = await call('POST', `/api/v1/horses/${horse}/item`, asUser(user), {
      body: { item_key: 'sugar_cube' },
    });
    expect(reapply.status).toBe(200);
  });

  it('champion saddle respects the Day5-6 window', async () => {
    const user = await fundedUser();
    const young = await itemHorse(user, 3);
    await call('POST', '/api/v1/items/purchase', asUser(user), {
      body: { item_key: 'champion_saddle' },
    });
    const tooYoung = await call('POST', `/api/v1/horses/${young}/item`, asUser(user), {
      body: { item_key: 'champion_saddle' },
    });
    expect(tooYoung.status).toBe(400);
    const day5 = await itemHorse(user, 5);
    const ok = await call('POST', `/api/v1/horses/${day5}/item`, asUser(user), {
      body: { item_key: 'champion_saddle' },
    });
    expect(ok.status).toBe(200);
  });

  it('gift by email moves the unit, notifies, and enforces the daily cap (Decision 079)', async () => {
    const sender = await fundedUser();
    const recipientId = await newUser();
    const recipient = await client.query<{ email: string }>(
      `select email from users where id = $1`,
      [recipientId],
    );
    await call('POST', '/api/v1/items/purchase', asUser(sender), {
      body: { item_key: 'lucky_charm' },
    });

    const nobody = await call('POST', '/api/v1/items/gift', asUser(sender), {
      body: { recipient_email: 'ghost@nowhere.dev', item_key: 'lucky_charm' },
    });
    expect(nobody.status).toBe(404);

    const gift = await call('POST', '/api/v1/items/gift', asUser(sender), {
      body: { recipient_email: recipient.rows[0]!.email.toUpperCase(), item_key: 'lucky_charm' },
    });
    expect(gift.status).toBe(200);

    const recInv = await call('GET', '/api/v1/items/inventory', asUser(recipientId));
    expect((recInv.body as { available: { item_key: string }[] }).available[0]!.item_key).toBe('lucky_charm');
    const senderInv = await call('GET', '/api/v1/items/inventory', asUser(sender));
    expect((senderInv.body as { available: unknown[] }).available).toHaveLength(0);

    const notif = await client.query(
      `select 1 from notifications where user_id = $1 and notification_type = 'ITEM_GIFT_RECEIVED'`,
      [recipientId],
    );
    expect(notif.rows).toHaveLength(1);

    // gifted unit price still travels with the unit for settlement
    const unit = await client.query<{ unit_price: string; source: string }>(
      `select unit_price::text as unit_price, source from user_items where user_id = $1`,
      [recipientId],
    );
    expect(Number(unit.rows[0]!.unit_price)).toBe(3);
    expect(unit.rows[0]!.source).toBe('GIFT');

    // daily cap: 20 transfers in 24h -> 429
    await call('POST', '/api/v1/items/purchase', asUser(sender), {
      body: { item_key: 'sugar_cube' },
    });
    for (let i = 0; i < 19; i += 1) {
      await client.query(
        `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, amount, idempotency_key)
         values ($1, $2, 'USDT', 1, $3)`,
        [sender, recipientId, `cap:${i}:${randomUUID()}`],
      );
    }
    const capped = await call('POST', '/api/v1/items/gift', asUser(sender), {
      body: { recipient_email: recipient.rows[0]!.email, item_key: 'sugar_cube' },
    });
    expect(capped.status).toBe(429);
  });

  it('bulk gift moves N oldest units; over-quantity is rejected (redesign)', async () => {
    const sender = await fundedUser();
    const recipientId = await newUser();
    const recipient = await client.query<{ email: string }>(
      `select email from users where id = $1`,
      [recipientId],
    );
    await call('POST', '/api/v1/items/purchase', asUser(sender), {
      body: { item_key: 'mint_herb', quantity: 3 },
    });
    const tooMany = await call('POST', '/api/v1/items/gift', asUser(sender), {
      body: { recipient_email: recipient.rows[0]!.email, item_key: 'mint_herb', quantity: 4 },
    });
    expect(tooMany.status).toBe(404);
    const bulk = await call('POST', '/api/v1/items/gift', asUser(sender), {
      body: { recipient_email: recipient.rows[0]!.email, item_key: 'mint_herb', quantity: 2 },
    });
    expect(bulk.status).toBe(200);
    expect((bulk.body as { quantity: number }).quantity).toBe(2);
    const recInv = await call('GET', '/api/v1/items/inventory', asUser(recipientId));
    expect((recInv.body as { available: { n: number }[] }).available[0]!.n).toBe(2);
    const senderInv = await call('GET', '/api/v1/items/inventory', asUser(sender));
    expect((senderInv.body as { available: { n: number }[] }).available[0]!.n).toBe(1);
  });

  it('transactions history covers purchase / sent / received / used (redesign)', async () => {
    const user = await fundedUser();
    const friendId = await newUser();
    const friend = await client.query<{ email: string }>(
      `select email from users where id = $1`,
      [friendId],
    );
    const horse = await itemHorse(user, 2);
    await call('POST', '/api/v1/items/purchase', asUser(user), {
      body: { item_key: 'cool_towel', quantity: 3 },
    });
    await call('POST', '/api/v1/items/gift', asUser(user), {
      body: { recipient_email: friend.rows[0]!.email, item_key: 'cool_towel', quantity: 2 },
    });
    await call('POST', `/api/v1/horses/${horse}/item`, asUser(user), {
      body: { item_key: 'cool_towel' },
    });
    const mine = await call('GET', '/api/v1/items/transactions', asUser(user));
    expect(mine.status).toBe(200);
    const kinds = (mine.body as { transactions: { kind: string; quantity: number }[] }).transactions;
    const byKind = new Map(kinds.map((t) => [t.kind, t.quantity]));
    expect(byKind.get('PURCHASED')).toBe(3);
    expect(byKind.get('SENT')).toBe(2);
    expect(byKind.get('USED')).toBe(1);
    const theirs = await call('GET', '/api/v1/items/transactions', asUser(friendId));
    const received = (theirs.body as { transactions: { kind: string; quantity: number; counterparty: string | null }[] }).transactions
      .find((t) => t.kind === 'RECEIVED');
    expect(received?.quantity).toBe(2);
    expect(received?.counterparty).toMatch(/\*\*\*/);
  });

  it('conditions endpoint returns revealed history + today (Decision 082)', async () => {
    const user = await fundedUser();
    const r = await call('GET', '/api/v1/items/conditions', asUser(user));
    expect(r.status).toBe(200);
    const body = r.body as { history: unknown[]; today: string };
    expect(Array.isArray(body.history)).toBe(true);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daily derby status (ADR-008 R1)', () => {
  it('phases: WAITING -> LIVE -> COMPLETED with counts and my horse names', async () => {
    const user = await newUser();
    await client.query(
      `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, 'Derby Status Horse', 'BALANCED', 'COMMON', 'dna-derby-1', 0.5,
               'horse_generation_v1.0', 'seed-derby-1', '{}')`,
      [user],
    );

    const waiting = await call('GET', '/api/v1/daily-derby/status', asUser(user));
    expect(waiting.status).toBe(200);
    const w = waiting.body as { phase: string; next_derby_at: string; my_horse_names: string[] };
    expect(w.phase).toBe('WAITING');
    expect(new Date(w.next_derby_at).getTime()).toBeGreaterThan(Date.now());
    expect(w.my_horse_names).toContain('Derby Status Horse');

    // Tonight's batch RUNNING -> LIVE
    const today = new Date().toISOString().slice(0, 10);
    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version, status)
       values ((now() at time zone 'Asia/Kuala_Lumpur')::date, 'batch_v1.0', 'RUNNING') returning id`,
    );
    void today;
    const live = await call('GET', '/api/v1/daily-derby/status', asUser(user));
    expect((live.body as { phase: string }).phase).toBe('LIVE');

    await client.query(`update batch_runs set status = 'COMPLETED', completed_at = now() where id = $1`, [
      batch.rows[0]!.id,
    ]);
    const done = await call('GET', '/api/v1/daily-derby/status', asUser(user));
    const d = done.body as { phase: string; counts: unknown; personal: unknown };
    expect(d.phase).toBe('COMPLETED');
    // No race row for the batch in this fixture -> counts/personal are null, no crash.
    expect(d.counts).toBeNull();
    expect(d.personal).toBeNull();

    await client.query(`update batch_runs set status = 'FAILED' where id = $1`, [batch.rows[0]!.id]);
    const failed = await call('GET', '/api/v1/daily-derby/status', asUser(user));
    expect((failed.body as { phase: string }).phase).toBe('FAILED_SAFE_MODE');

    // cleanup so other tests see no batch for today
    await client.query(`delete from batch_runs where id = $1`, [batch.rows[0]!.id]);
  });
});

describe('support member detail + search (owner request 2026-07-08)', () => {
  it('detail visible only inside my 7-tier subtree; email search locates members', async () => {
    const me = await newUser();
    const childId = await newUser();
    const stranger = await newUser();
    await client.query(`update users set placement_parent_user_id = $1, placed_at = now() where id = $2`, [me, childId]);
    const grand = await newUser();
    await client.query(`update users set placement_parent_user_id = $1, placed_at = now() where id = $2`, [childId, grand]);
    // child owns a Day2 horse (121) and burned once historically
    const horse = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, 2, 'Member Detail Horse', 'BALANCED', 'COMMON', 'dna-md-1', 0.5,
               'horse_generation_v1.0', 'seed-md-1', '{}') returning id`,
      [childId],
    );
    void horse;

    const detail = await call('GET', `/api/v1/support/member/${childId}`, asUser(me));
    expect(detail.status).toBe(200);
    const body = detail.body as {
      tier: number; active_horses: number; horses_value: string;
      burns_total: number; items_used: number; direct_count: number; subtree_count: number;
    };
    expect(body.tier).toBe(1);
    expect(body.active_horses).toBe(1);
    expect(Number(body.horses_value)).toBe(121);
    expect(body.direct_count).toBe(1);
    expect(body.subtree_count).toBe(1);

    // outside my subtree -> 404 (stranger asks about my child)
    const outside = await call('GET', `/api/v1/support/member/${childId}`, asUser(stranger));
    expect(outside.status).toBe(404);
    // and I cannot inspect a stranger
    const notMine = await call('GET', `/api/v1/support/member/${stranger}`, asUser(me));
    expect(notMine.status).toBe(404);

    // exact-email search inside my org
    const childEmail = await client.query<{ email: string }>(`select email from users where id = $1`, [childId]);
    const found = await call('POST', '/api/v1/support/search', asUser(me), {
      body: { email: childEmail.rows[0]!.email.toUpperCase() },
    });
    expect((found.body as { user_id: string | null }).user_id).toBe(childId);
    const strangerEmail = await client.query<{ email: string }>(`select email from users where id = $1`, [stranger]);
    const miss = await call('POST', '/api/v1/support/search', asUser(me), {
      body: { email: strangerEmail.rows[0]!.email },
    });
    expect((miss.body as { user_id: string | null }).user_id).toBeNull();
  });
});

describe('admin user operations (items, freeze, dual-approved USDT grants)', () => {
  it('runs the full flow: grant item -> freeze -> fund grant with dual approval', async () => {
    const target = await newUser();
    const admin1 = await newUser();
    const admin2 = await newUser();
    await client.query(
      `insert into admin_role_grants (user_id, role) values ($1, 'SUPER_ADMIN'), ($2, 'FINANCE_ADMIN')`,
      [admin1, admin2],
    );
    const asAdmin1: AuthContext = { kind: 'admin', userId: admin1, roles: ['SUPER_ADMIN'] };
    const asAdmin2: AuthContext = { kind: 'admin', userId: admin2, roles: ['FINANCE_ADMIN'] };

    // ---- item grant (unit_price=0, source GIFT, audited)
    const itemKey = (
      await client.query<{ key: string }>(`select key from item_catalog where active limit 1`)
    ).rows[0]!.key;
    const granted = await call('POST', `/api/v1/admin/users/${target}/grant-item`, asAdmin1, {
      body: { item_key: itemKey, quantity: 2 },
    });
    expect(granted.status).toBe(200);
    const items = await client.query<{ unit_price: string; source: string }>(
      `select unit_price::text as unit_price, source from user_items where user_id = $1`,
      [target],
    );
    expect(items.rows).toHaveLength(2);
    expect(items.rows.every((r) => Number(r.unit_price) === 0 && r.source === 'GIFT')).toBe(true);

    // ---- freeze: self-change forbidden, others allowed
    const self = await call('POST', `/api/v1/admin/users/${admin1}/status`, asAdmin1, {
      body: { status: 'SUSPENDED' },
    });
    expect(self.status).toBe(403);
    const frozen = await call('POST', `/api/v1/admin/users/${target}/status`, asAdmin1, {
      body: { status: 'SUSPENDED' },
    });
    expect(frozen.status).toBe(200);
    const st = await client.query<{ status: string }>(
      `select status::text as status from users where id = $1`,
      [target],
    );
    expect(st.rows[0]!.status).toBe('SUSPENDED');
    await call('POST', `/api/v1/admin/users/${target}/status`, asAdmin1, {
      body: { status: 'ACTIVE' },
    });

    // 運営準備金に原資を用意(残高不足の付与はDBトリガーが
    // NEGATIVE_BALANCE_FORBIDDEN で拒否する — それ自体が仕様)
    const clearing = await getPlatformAccountId(client, 'PLATFORM_DEPOSIT_CLEARING');
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');
    await postTransaction(client, {
      type: 'RESERVE_ALLOCATION',
      idempotencyKey: randomUUID(),
      entries: [
        { accountId: clearing, direction: 'DEBIT', amount: Money.of(100) },
        { accountId: operating, direction: 'CREDIT', amount: Money.of(100) },
      ],
    });

    // ---- USDT grant: request (PENDING) -> requester cannot approve -> 2nd admin approves
    const requested = await call('POST', `/api/v1/admin/users/${target}/fund-grant`, asAdmin1, {
      body: { amount: 25, reason: 'compensation test' },
      idempotencyKey: randomUUID(),
    });
    expect(requested.status).toBe(200);
    const grantId = (requested.body as { id: string }).id;

    const selfApprove = await call('POST', `/api/v1/admin/fund-grants/${grantId}/approve`, asAdmin1);
    expect(selfApprove.status).toBe(403);

    const approve = await call('POST', `/api/v1/admin/fund-grants/${grantId}/approve`, asAdmin2);
    expect(approve.status).toBe(200);

    const balance = await client.query<{ balance: string }>(
      `select b.balance::text as balance
       from ledger_accounts a join ledger_account_balances b on b.account_id = a.id
       where a.owner_id = $1 and a.account_type = 'USER_AVAILABLE'`,
      [target],
    );
    expect(Number(balance.rows[0]!.balance)).toBe(25);

    const again = await call('POST', `/api/v1/admin/fund-grants/${grantId}/approve`, asAdmin2);
    expect(again.status).toBe(409);

    // ---- dossier includes the new sections
    const detail = await call('GET', `/api/v1/admin/users/${target}`, asAdmin1);
    expect(detail.status).toBe(200);
    const body = detail.body as {
      user: { last_sign_in_at: string | null };
      org_size: number;
      upline: unknown[];
      deposits: unknown[];
      withdrawals: unknown[];
      purchases: unknown[];
      buybacks: unknown[];
      sales: unknown[];
      fund_grants: { status: string }[];
    };
    expect(body.org_size).toBe(0);
    expect(Array.isArray(body.deposits)).toBe(true);
    expect(body.fund_grants[0]!.status).toBe('APPROVED');
    const extra = detail.body as {
      item_acquisitions: { source: string }[];
      item_transfers: unknown[];
    };
    // grant-item で付与した2個が取得履歴に載る
    expect(extra.item_acquisitions).toHaveLength(2);
    expect(extra.item_acquisitions.every((a) => a.source === 'GIFT')).toBe(true);
    expect(Array.isArray(extra.item_transfers)).toBe(true);
  });
});

describe('AI customer service queue (approval-first)', () => {
  it('lists, approves with edit (dry-run send), and rejects', async () => {
    const admin = await newUser();
    await client.query(
      `insert into admin_role_grants (user_id, role) values ($1, 'SUPER_ADMIN')`,
      [admin],
    );
    const asAdmin: AuthContext = { kind: 'admin', userId: admin, roles: ['SUPER_ADMIN'] };

    const inserted = await client.query<{ id: string }>(
      `insert into cs_messages (direction, email, name, subject, body, ai_draft, ai_confidence)
       values ('RECEIVED', 'owner@example.com', 'Owner', 'BURNとは?', '馬が消えるとはどういうことですか',
               'オーナー様

ご質問ありがとうございます…

Seven Days Derby サポート', 0.9)
       returning id`,
    );
    const msgId = inserted.rows[0]!.id;

    const queue = await call('GET', '/api/v1/admin/cs/queue', asAdmin);
    expect(queue.status).toBe(200);
    const listed = (queue.body as { messages: { id: string; status: string }[] }).messages;
    expect(listed.some((m) => m.id === msgId && m.status === 'PENDING')).toBe(true);

    // 承認(編集あり) — RESEND_API_KEY未設定のテスト環境ではドライラン送信
    const approve = await call('POST', `/api/v1/admin/cs/${msgId}/approve`, asAdmin, {
      body: { body: '編集済みの返信本文です。 Seven Days Derby サポート' },
    });
    expect(approve.status).toBe(200);
    expect((approve.body as { dry_run: boolean }).dry_run).toBe(true);

    const after = await client.query<{ status: string }>(
      `select status from cs_messages where id = $1`,
      [msgId],
    );
    expect(after.rows[0]!.status).toBe('SENT');
    const sentRow = await client.query(
      `select 1 from cs_messages where direction = 'SENT' and reply_to_cs_id = $1`,
      [msgId],
    );
    expect(sentRow.rows).toHaveLength(1);

    // 二重承認は 409
    const again = await call('POST', `/api/v1/admin/cs/${msgId}/approve`, asAdmin, {
      body: {},
    });
    expect(again.status).toBe(409);

    // 却下パス
    const second = await client.query<{ id: string }>(
      `insert into cs_messages (direction, email, body, ai_draft)
       values ('RECEIVED', 'other@example.com', '本文', '下書き') returning id`,
    );
    const reject = await call('POST', `/api/v1/admin/cs/${second.rows[0]!.id}/reject`, asAdmin);
    expect(reject.status).toBe(200);
  });

  it('composes direct mail, shows the thread, and broadcasts (dry-run)', async () => {
    const admin = await newUser();
    await client.query(
      `insert into admin_role_grants (user_id, role) values ($1, 'SUPER_ADMIN')`,
      [admin],
    );
    const asAdmin: AuthContext = { kind: 'admin', userId: admin, roles: ['SUPER_ADMIN'] };

    // 個別送信 → スレッドに載る
    const compose = await call('POST', '/api/v1/admin/cs/compose', asAdmin, {
      body: { email: 'owner2@example.com', subject: 'ご案内', body: '本文です' },
    });
    expect(compose.status).toBe(200);
    const thread = await call('POST', '/api/v1/admin/cs/thread', asAdmin, {
      body: { email: 'owner2@example.com' },
    });
    expect(thread.status).toBe(200);
    const tbody = thread.body as { messages: { direction: string }[] };
    expect(tbody.messages.some((m) => m.direction === 'SENT')).toBe(true);

    // 一斉送信(TEST=自分宛てのみ・ドライラン)
    const bc = await call('POST', '/api/v1/admin/cs/broadcast', asAdmin, {
      body: { subject: 'お知らせ', body: '一斉本文', mode: 'TEST' },
      idempotencyKey: randomUUID(),
    });
    expect(bc.status).toBe(200);
    const bcBody = bc.body as { total: number; sent: number };
    expect(bcBody.total).toBe(1);
    expect(bcBody.sent).toBe(1);

    // サイト内お問い合わせフォーム → 同じキューに入る
    const formUser = await newUser();
    const contact = await call('POST', '/api/v1/contact', asUser(formUser), {
      body: { subject: 'フォームからの質問', body: 'アイテムの使い方を教えてください' },
    });
    expect(contact.status).toBe(200);
    const queued = await client.query<{ status: string; ai_draft: string | null }>(
      `select status, ai_draft from cs_messages
       where user_id = $1 and direction = 'RECEIVED'`,
      [formUser],
    );
    expect(queued.rows[0]!.status).toBe('PENDING');
    // AI下書きの(再)生成 — テスト環境はDEEPSEEK_API_KEY無しでも200(要確認печ扱い)
    const msgRow = await client.query<{ id: string }>(
      `select id from cs_messages where user_id = $1 and direction = 'RECEIVED'`,
      [formUser],
    );
    const draft = await call('POST', `/api/v1/admin/cs/${msgRow.rows[0]!.id}/draft`, asAdmin);
    expect(draft.status).toBe(200);

    // 送信履歴に個別と一斉が載る
    const sent = await call('GET', '/api/v1/admin/cs/sent', asAdmin);
    expect(sent.status).toBe(200);
    const sbody = sent.body as { sent: { kind: string }[]; broadcasts: { mode: string }[] };
    expect(sbody.sent.some((r) => r.kind === 'DIRECT')).toBe(true);
    expect(sbody.sent.some((r) => r.kind === 'BROADCAST')).toBe(true);
    expect(sbody.broadcasts.some((b) => b.mode === 'TEST')).toBe(true);
  });
});
