'use client';

import { createBrowserClient } from '@supabase/ssr';

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

/**
 * Browser-side helpers: Supabase auth session + authenticated fetch to
 * /api/v1/*. No financial logic lives in the client — every operation is
 * an API call (07_API.md); the Idempotency-Key travels as a header.
 */

let browserClient: BrowserSupabaseClient | null = null;

export function supabaseBrowser(): BrowserSupabaseClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error('Supabase public environment is not configured');
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface ApiFetchResult<T> {
  status: number;
  body: T | ApiErrorBody;
}

export async function apiFetch<T>(
  path: string,
  init: { method?: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string } = {},
): Promise<ApiFetchResult<T>> {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;

  const response = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: response.status, body: (await response.json()) as T | ApiErrorBody };
}

export function errorMessage(body: unknown): string | null {
  const maybe = body as ApiErrorBody;
  return maybe && typeof maybe === 'object' && 'error' in maybe ? maybe.error.message : null;
}
