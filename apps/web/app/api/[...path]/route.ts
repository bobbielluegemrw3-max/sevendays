import { withSqlClient } from '@/lib/db';
import { dispatchBridge } from '@/lib/api-bridge';

/**
 * Catch-all mount of the API contracts registry (07_API.md). Everything
 * under /api/* funnels through registry.dispatch — auth gates, zod
 * validation, idempotency enforcement, and error mapping all live in
 * @sevendays/api-contracts, identically to the Cloud Run mount.
 *
 * Internal endpoints (/internal/*) are not under /api and therefore have
 * no route here at all; even via the registry they would require an auth
 * kind ('internal') this bridge never constructs.
 */

export const dynamic = 'force-dynamic';

async function handle(request: Request, params: Promise<{ path: string[] }>): Promise<Response> {
  const { path } = await params;
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return Response.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Server auth is not configured' } },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('authorization');
  const accessToken = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('bearer '.length)
    : null;

  let body: unknown;
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }

  // Invite cookie (Decision 074) — consumed only at first provisioning.
  const referralCode =
    request.headers
      .get('cookie')
      ?.split(/;\s*/)
      .find((c) => c.startsWith('sdd_ref='))
      ?.slice('sdd_ref='.length) ?? null;

  const result = await withSqlClient((client) =>
    dispatchBridge(
      client,
      {
        method: request.method,
        path: `/api/${path.join('/')}`,
        body,
        idempotencyKey: request.headers.get('idempotency-key'),
        accessToken,
      },
      secret,
      { referralCode },
    ),
  );
  return Response.json(result.body, { status: result.status });
}

export function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(request, ctx.params);
}

export function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  return handle(request, ctx.params);
}
