import { jwtVerify } from 'jose';
import {
  buildApiRegistry,
  type ApiResponse,
  type AuthContext,
} from '@sevendays/api-contracts';
import type { SqlClient } from '@sevendays/shared';

/**
 * The ONLY bridge between HTTP/RSC and the API contracts registry
 * (07_API.md). Framework-free on purpose: the route handler and server
 * components both call dispatchBridge, and tests drive it directly against
 * PGlite.
 *
 * Auth: the Supabase access token is verified LOCALLY (HS256 via
 * SUPABASE_JWT_SECRET) — no network hop per request. users.id equals the
 * Supabase auth uid (RLS keys on auth.uid()), so the first authenticated
 * request provisions the users row. Admin roles come from
 * admin_role_grants (active grants only); internal endpoints are
 * unreachable here by construction (auth kind 'internal' is never built).
 */

const registry = buildApiRegistry();

export interface BridgeRequest {
  method: string;
  /** Registry path, e.g. `/api/v1/wallet`. */
  path: string;
  body?: unknown;
  idempotencyKey?: string | null;
  accessToken?: string | null;
}

export async function buildAuthContext(
  client: SqlClient,
  accessToken: string | null | undefined,
  jwtSecret: string,
): Promise<AuthContext> {
  if (!accessToken) return { kind: 'anonymous' };

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(accessToken, new TextEncoder().encode(jwtSecret)));
  } catch {
    return { kind: 'anonymous' };
  }
  const userId = typeof payload.sub === 'string' ? payload.sub : null;
  if (!userId) return { kind: 'anonymous' };

  // First-login provisioning: everything downstream (RLS, ledger accounts,
  // deposit addresses) keys on users.id = auth.uid().
  const email = typeof payload.email === 'string' && payload.email !== '' ? payload.email : `${userId}@user.sevendays`;
  await client.query(
    `insert into users (id, email) values ($1, $2) on conflict do nothing`,
    [userId, email],
  );

  const grants = await client.query<{ role: string }>(
    `select role::text as role from admin_role_grants where user_id = $1 and revoked_at is null`,
    [userId],
  );
  if (grants.rows.length > 0) {
    return { kind: 'admin', userId, roles: grants.rows.map((r) => r.role) };
  }
  return { kind: 'user', userId };
}

export async function dispatchBridge(
  client: SqlClient,
  request: BridgeRequest,
  jwtSecret: string,
): Promise<ApiResponse> {
  const auth = await buildAuthContext(client, request.accessToken, jwtSecret);
  return registry.dispatch(client, {
    method: request.method,
    path: request.path,
    auth,
    body: request.body,
    idempotencyKey: request.idempotencyKey ?? null,
  });
}
