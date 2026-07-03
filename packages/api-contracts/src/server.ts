import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { SqlClient } from '@sevendays/shared';
import type { ApiRegistry } from './router.js';
import { toErrorBody } from './errors.js';

/**
 * Thin HTTP wrapper for Cloud Run workers (08_INFRASTRUCTURE.md): each
 * services/* entry mounts the SAME registry but only serves its own
 * internal paths (allowlist). Platform-level protection is Cloud Run
 * IAM + internal-only ingress; the shared `internalToken` header check is
 * defense in depth — a request bearing it dispatches with
 * auth kind 'internal'.
 */

export interface WorkerJob {
  (client: SqlClient, body: unknown): Promise<unknown>;
}

export interface WorkerServerOptions {
  workerName: string;
  registry: ApiRegistry;
  /** Runs fn with a DEDICATED SqlClient connection (never a pool). */
  withClient: <T>(fn: (client: SqlClient) => Promise<T>) => Promise<T>;
  /** Shared secret expected in the x-internal-token header. */
  internalToken: string;
  /** Registry paths this worker is allowed to serve (e.g. /internal/batch/start). */
  allowPaths?: string[];
  /** Extra non-registry jobs (e.g. chain scan loops), keyed by URL path. */
  jobs?: Record<string, WorkerJob>;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(payload);
}

export function createWorkerServer(options: WorkerServerOptions): Server {
  const allow = new Set(options.allowPaths ?? []);

  return createServer((request, response) => {
    void (async () => {
      const path = (request.url ?? '/').split('?')[0]!;

      if (request.method === 'GET' && path === '/healthz') {
        send(response, 200, { ok: true, worker: options.workerName });
        return;
      }

      if (request.headers['x-internal-token'] !== options.internalToken) {
        send(response, 401, toErrorBody('UNAUTHORIZED', 'internal token required'));
        return;
      }

      const body = await readJsonBody(request);

      const job = options.jobs?.[path];
      if (job && request.method === 'POST') {
        try {
          const result = await options.withClient((client) => job(client, body));
          send(response, 200, result ?? { ok: true });
        } catch (error) {
          send(response, 500, toErrorBody('INTERNAL_ERROR', (error as Error).message));
        }
        return;
      }

      if (!allow.has(path)) {
        send(response, 404, toErrorBody('NOT_FOUND', `${options.workerName} does not serve ${path}`));
        return;
      }

      try {
        const result = await options.withClient((client) =>
          options.registry.dispatch(client, {
            method: request.method ?? 'POST',
            path,
            auth: { kind: 'internal' },
            body,
            idempotencyKey: (request.headers['idempotency-key'] as string | undefined) ?? null,
          }),
        );
        send(response, result.status, result.body);
      } catch (error) {
        send(response, 500, toErrorBody('INTERNAL_ERROR', (error as Error).message));
      }
    })();
  });
}
