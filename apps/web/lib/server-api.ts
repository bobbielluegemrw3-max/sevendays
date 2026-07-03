import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { withSqlClient } from './db';
import { dispatchBridge } from './api-bridge';

/**
 * Server-component data access: same contract as the HTTP API, without the
 * HTTP hop. The Supabase session cookie provides the access token; the
 * bridge verifies it cryptographically before any dispatch.
 */

function jwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not configured');
  return secret;
}

export async function getAccessToken(): Promise<string | null> {
  // Read cookies FIRST so every caller is dynamically rendered — even when
  // the Supabase env is absent (build machines must never prerender pages
  // into the database).
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        /* read-only in RSC; the browser client owns the session cookies */
      },
    },
  });
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export interface ServerApiResult<T> {
  status: number;
  body: T;
}

export async function serverApi<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<ServerApiResult<T>> {
  const accessToken = await getAccessToken();
  const response = await withSqlClient((client) =>
    dispatchBridge(
      client,
      {
        method: init.method ?? 'GET',
        path,
        body: init.body,
        accessToken,
      },
      jwtSecret(),
    ),
  );
  return { status: response.status, body: response.body as T };
}

/** Like serverApi, but bounces unauthenticated visitors to /login. */
export async function serverApiOrLogin<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const result = await serverApi<T>(path, init);
  if (result.status === 401) redirect('/login');
  return result.body;
}
