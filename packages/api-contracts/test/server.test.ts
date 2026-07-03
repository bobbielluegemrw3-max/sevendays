import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { buildApiRegistry, createWorkerServer } from '../src/index.js';

/**
 * The Cloud Run worker wrapper: internal-token gate, per-worker path
 * allowlist, and registry dispatch with 'internal' auth — over real HTTP.
 */

const TOKEN = 'test-internal-token';

let client: SqlClient;
let server: Server;
let base: string;

beforeAll(async () => {
  client = await createTestDb();
  server = createWorkerServer({
    workerName: 'test-worker',
    registry: buildApiRegistry(),
    withClient: (fn) => fn(client),
    internalToken: TOKEN,
    allowPaths: ['/internal/buyback/pay'],
    jobs: {
      '/jobs/echo': async (_client, body) => ({ echoed: body }),
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.close();
});

describe('worker server', () => {
  it('serves health without auth', async () => {
    const response = await fetch(`${base}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, worker: 'test-worker' });
  });

  it('rejects requests without the internal token', async () => {
    const response = await fetch(`${base}/internal/buyback/pay`, {
      method: 'POST',
      body: JSON.stringify({ batch_date: '2030-01-01' }),
    });
    expect(response.status).toBe(401);
  });

  it('serves only its allowlisted internal paths', async () => {
    const headers = { 'x-internal-token': TOKEN, 'content-type': 'application/json' };

    const allowed = await fetch(`${base}/internal/buyback/pay`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ batch_date: '2030-01-01' }),
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ paymentsMade: 0, schedulesCompleted: 0 });

    // Registered in the registry, but NOT this worker's path.
    const foreign = await fetch(`${base}/internal/batch/start`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ batch_date: '2030-01-01' }),
    });
    expect(foreign.status).toBe(404);
  });

  it('runs custom jobs with the token gate', async () => {
    const denied = await fetch(`${base}/jobs/echo`, { method: 'POST', body: '{}' });
    expect(denied.status).toBe(401);

    const response = await fetch(`${base}/jobs/echo`, {
      method: 'POST',
      headers: { 'x-internal-token': TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'worker' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ echoed: { hello: 'worker' } });
  });
});
