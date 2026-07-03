import type { ZodType } from 'zod';
import type { SqlClient } from '@sevendays/shared';
import { ApiError, toErrorBody } from './errors.js';
import { FORBIDDEN_API_PATHS } from './forbidden.js';

/**
 * Transport-agnostic API layer (07_API.md). apps/web (Vercel) and the
 * Cloud Run services mount the same registry; auth, validation,
 * idempotency-key enforcement, and error mapping live here so every
 * transport behaves identically.
 */

export type AuthContext =
  | { kind: 'anonymous' }
  | { kind: 'user'; userId: string }
  | { kind: 'admin'; userId: string; roles: string[] }
  | { kind: 'internal' };

export type AuthLevel = 'user' | 'admin' | 'internal';

export interface HandlerContext {
  client: SqlClient;
  auth: AuthContext;
  /** convenience: user id for user/admin auth */
  userId: string;
  params: Record<string, string>;
  idempotencyKey: string | null;
}

export interface EndpointDef<Input = unknown, Output = unknown> {
  method: 'GET' | 'POST';
  path: string;
  auth: AuthLevel;
  /** POST endpoints performing financial writes MUST require the key (07_API.md). */
  idempotencyKeyRequired?: boolean;
  input?: ZodType<Input>;
  handler: (ctx: HandlerContext, input: Input) => Promise<Output>;
}

export interface ApiRequest {
  method: string;
  path: string;
  auth: AuthContext;
  body?: unknown;
  idempotencyKey?: string | null;
}

export interface ApiResponse {
  status: number;
  /** success payload or an {@link ErrorBody} envelope */
  body: unknown;
}

export class ApiRegistry {
  private readonly endpoints: EndpointDef<never, unknown>[] = [];

  register<Input, Output>(def: EndpointDef<Input, Output>): void {
    // Forbidden APIs must not exist (07_API.md) — enforced at registration.
    for (const forbidden of FORBIDDEN_API_PATHS) {
      if (def.path.includes(forbidden)) {
        throw new Error(`FORBIDDEN_API: ${def.path} matches forbidden pattern ${forbidden}`);
      }
    }
    if (this.endpoints.some((e) => e.method === def.method && e.path === def.path)) {
      throw new Error(`Duplicate endpoint: ${def.method} ${def.path}`);
    }
    this.endpoints.push(def as unknown as EndpointDef<never, unknown>);
  }

  list(): readonly { method: string; path: string; auth: AuthLevel }[] {
    return this.endpoints.map((e) => ({ method: e.method, path: e.path, auth: e.auth }));
  }

  async dispatch(client: SqlClient, request: ApiRequest): Promise<ApiResponse> {
    const match = this.match(request.method, request.path);
    if (!match) return { status: 404, body: toErrorBody('NOT_FOUND', 'No such endpoint') };
    const { endpoint, params } = match;

    // auth gate
    const auth = request.auth;
    if (endpoint.auth === 'internal' && auth.kind !== 'internal') {
      return { status: 403, body: toErrorBody('FORBIDDEN', 'Internal endpoint') };
    }
    if (endpoint.auth === 'admin') {
      if (auth.kind !== 'admin') {
        return auth.kind === 'anonymous'
          ? { status: 401, body: toErrorBody('UNAUTHORIZED', 'Authentication required') }
          : { status: 403, body: toErrorBody('FORBIDDEN', 'Admin role required') };
      }
      if (auth.roles.length === 0) {
        return { status: 403, body: toErrorBody('FORBIDDEN', 'Admin role required') };
      }
    }
    if (endpoint.auth === 'user' && auth.kind !== 'user' && auth.kind !== 'admin') {
      return { status: 401, body: toErrorBody('UNAUTHORIZED', 'Authentication required') };
    }

    const idempotencyKey = request.idempotencyKey ?? null;
    if (endpoint.idempotencyKeyRequired && !idempotencyKey) {
      return {
        status: 400,
        body: toErrorBody('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'),
      };
    }

    let input: unknown = request.body ?? {};
    if (endpoint.input) {
      const parsed = endpoint.input.safeParse(input);
      if (!parsed.success) {
        return {
          status: 400,
          body: toErrorBody('VALIDATION_FAILED', parsed.error.issues.map((i) => i.message).join('; ')),
        };
      }
      input = parsed.data;
    }

    const userId = auth.kind === 'user' || auth.kind === 'admin' ? auth.userId : '';
    try {
      const body = await endpoint.handler(
        { client, auth, userId, params, idempotencyKey },
        input as never,
      );
      return { status: 200, body };
    } catch (error) {
      if (error instanceof ApiError) {
        return { status: error.status, body: toErrorBody(error.code, error.message) };
      }
      const anyError = error as { code?: string; message?: string };
      if (typeof anyError.code === 'string') {
        const apiError = new ApiError(anyError.code, anyError.message ?? anyError.code);
        return { status: apiError.status, body: toErrorBody(apiError.code, apiError.message) };
      }
      return {
        status: 500,
        body: toErrorBody('INTERNAL_ERROR', anyError.message ?? 'unexpected error'),
      };
    }
  }

  private match(
    method: string,
    path: string,
  ): { endpoint: EndpointDef<never, unknown>; params: Record<string, string> } | null {
    for (const endpoint of this.endpoints) {
      if (endpoint.method !== method.toUpperCase()) continue;
      const params = matchPath(endpoint.path, path);
      if (params) return { endpoint, params };
    }
    return null;
  }
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const p = patternParts[i]!;
    const actual = pathParts[i]!;
    if (p.startsWith(':')) params[p.slice(1)] = actual;
    else if (p !== actual) return null;
  }
  return params;
}

/** Minimal OpenAPI 3.1 document from the registry (07_API.md scope). */
export function generateOpenApi(registry: ApiRegistry): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of registry.list()) {
    const oaPath = e.path.replace(/:([A-Za-z_]+)/g, '{$1}');
    paths[oaPath] = paths[oaPath] ?? {};
    paths[oaPath][e.method.toLowerCase()] = {
      security: e.auth === 'internal' ? [{ cloudRunAuth: [] }] : [{ bearerAuth: [] }],
      responses: { '200': { description: 'OK' } },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Seven Days Derby API', version: '1.0.0' },
    paths,
  };
}
