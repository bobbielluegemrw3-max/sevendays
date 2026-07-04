import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * OAuth (Google) PKCE callback: exchanges the auth code for a session and
 * writes the session cookies, then lands on `next`.
 *
 * Public origin resolution: on Render (and any proxy) `request.url` is the
 * INTERNAL address (http://localhost:10000/...), so the final redirect must
 * be built from the forwarded host — never from request.url — or the
 * browser is sent to localhost. NEXT_PUBLIC_SITE_URL overrides everything
 * when set.
 */
function publicOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/';
  const origin = publicOrigin(request);
  const response = NextResponse.redirect(new URL(next, origin));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (code && supabaseUrl && anonKey) {
    const supabase = createServerClient(supabaseUrl, anonKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value, options } of cookies) {
            response.cookies.set(name, value, options);
          }
        },
      },
    });
    await supabase.auth.exchangeCodeForSession(code);
  }
  return response;
}
