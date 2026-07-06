import { NextResponse, type NextRequest } from 'next/server';

/**
 * 招待リンクのキャプチャ(Decision 074): `?ref=<referral_code>` 付きで
 * 到着したら cookie に保持し、初回ログイン時のプロビジョニング
 * (lib/api-bridge.ts)が direct_referrer_user_id として固定する。
 * 先着優先(既に cookie があれば上書きしない)— サインアップ直前の
 * リンク差し替えで紹介者を横取りされないため。
 */
export function proxy(request: NextRequest): NextResponse {
  const ref = request.nextUrl.searchParams.get('ref');
  const response = NextResponse.next();
  if (ref && /^[0-9a-f]{6,32}$/i.test(ref) && !request.cookies.get('sdd_ref')) {
    response.cookies.set('sdd_ref', ref.toLowerCase(), {
      maxAge: 60 * 60 * 24 * 30,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  return response;
}

export const config = {
  // ページ遷移のみ(静的アセット・APIは対象外)
  matcher: ['/((?!_next|api/|.*\\..*).*)'],
};
