import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import type { AuthContext } from '@sevendays/api-contracts';
import { withSqlClient } from './db';
import { buildAuthContext, dispatchWithAuth } from './api-bridge';

/**
 * Server-component data access: same contract as the HTTP API, without the
 * HTTP hop. The Supabase session cookie provides the access token; the
 * bridge verifies it cryptographically. Auth resolution (JWT verify +
 * user provisioning + role lookup) runs ONCE per render via React cache —
 * pages calling serverApi several times share the result.
 */

function jwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not configured');
  return secret;
}

export const getAccessToken = cache(async (): Promise<string | null> => {
  // Read cookies FIRST so every caller is dynamically rendered — even when
  // the Supabase env is absent (build machines must never prerender pages
  // into the database).
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
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
  } catch (e) {
    // 2026-07-19 実障害(digest 3579376556): 実ブラウザのセッションCookieでのみ
    // ここが throw し、全ページがServer Componentsエラーで死んでいた疑い。
    // 絶対にレンダーを殺さない — 未ログイン扱いに落とし、原因はログと
    // system_settings('debug:auth_error') に残して遠隔診断できるようにする。
    const msg = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
    console.error('[server-api] getSession failed:', msg);
    try {
      await withSqlClient((client) =>
        client.query(
          `insert into system_settings (key, value, updated_at)
           values ('debug:auth_error', $1::jsonb, now())
           on conflict (key) do update set value = $1::jsonb, updated_at = now()`,
          [JSON.stringify({ at: new Date().toISOString(), error: msg.slice(0, 4000) })],
        ),
      );
    } catch {
      /* 診断書き込みの失敗はレンダーに影響させない */
    }
    return null;
  }
});

const getAuthContext = cache(async (): Promise<AuthContext> => {
  const accessToken = await getAccessToken();
  if (!accessToken) return { kind: 'anonymous' };
  // Invite cookie (Decision 074) — consumed only at first provisioning.
  const referralCode = (await cookies()).get('sdd_ref')?.value ?? null;
  return withSqlClient((client) => buildAuthContext(client, accessToken, jwtSecret(), { referralCode }));
});

export interface ServerApiResult<T> {
  status: number;
  body: T;
}

export async function serverApi<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<ServerApiResult<T>> {
  const auth = await getAuthContext();
  const response = await withSqlClient((client) =>
    dispatchWithAuth(
      client,
      {
        method: init.method ?? 'GET',
        path,
        body: init.body,
      },
      auth,
    ),
  );
  return { status: response.status, body: response.body as T };
}

/** Like serverApi, but bounces unauthenticated visitors to the landing page
 * (Decision 083: /login is gone — every CTA there starts Google OAuth). */
export async function serverApiOrLogin<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const result = await serverApi<T>(path, init);
  if (result.status === 401) redirect('/');
  return result.body;
}
