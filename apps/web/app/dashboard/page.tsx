import Dashboard from '@/components/Dashboard';

/**
 * Signed-in home. Dashboard itself re-validates the session server-side and
 * bounces stale tokens to the landing page (serverApiOrLogin), so no extra guard here.
 *
 * 診断モード(2026-07-19 一時措置): 本番でログイン直後に digest 3579376556 の
 * Server Components エラーが再現しており、Renderログに手が届かないため、
 * 実際のエラー本文をページに表示する。原因特定後にこのtry/catchは撤去する。
 */
export default async function DashboardPage() {
  try {
    return await Dashboard();
  } catch (e) {
    // next/navigation の redirect()/notFound() は例外で実装されている — 素通しする
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === 'string' && (digest.startsWith('NEXT_REDIRECT') || digest.startsWith('NEXT_HTTP_ERROR'))) {
      throw e;
    }
    const msg = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e);
    console.error('[dashboard] render failed:', msg);
    return (
      <pre style={{ padding: 20, whiteSpace: 'pre-wrap', color: '#ff8fe4', fontSize: 12, lineHeight: 1.7 }}>
        {'DASHBOARD RENDER ERROR(診断表示・一時的)\n\nこの画面をそのままコピーして貼り付けてください。\n\n'}
        {msg}
      </pre>
    );
  }
}
