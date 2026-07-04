'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { siteOrigin, supabaseBrowser } from '@/lib/client-api';
import s from './landing.module.css';

/**
 * Google + MetaMask login buttons for the landing CTA (Decision 071).
 * Real sign-in — same flow as the login page, styled for the neon LP.
 */
export function LandingAuth({ variant = 'row' }: { variant?: 'row' | 'stack' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function metamask() {
    setBusy(true);
    setError(null);
    const injected = (window as { ethereum?: unknown }).ethereum;
    if (!injected) {
      setBusy(false);
      setError('MetaMaskが見つかりません。拡張機能をインストールするか、MetaMaskアプリ内で開いてください。');
      return;
    }
    const { error: e } = await supabaseBrowser().auth.signInWithWeb3({
      chain: 'ethereum',
      statement: 'Seven Days Derby にサインインします。',
    });
    setBusy(false);
    if (e) {
      setError(e.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteOrigin()}/auth/callback` },
    });
    if (e) {
      setBusy(false);
      setError(e.message);
    }
  }

  return (
    <div className={variant === 'stack' ? s.authStack : s.authRow}>
      <button className={s.authBtn} onClick={() => void google()} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Google でログイン
      </button>
      <button className={`${s.authBtn} ${s.authMeta}`} onClick={() => void metamask()} disabled={busy}>
        <svg width="20" height="19" viewBox="0 0 40 38" aria-hidden="true">
          <polygon fill="#E2761B" points="2,2 14,8.6 9,14.8" />
          <polygon fill="#E2761B" points="38,2 26,8.6 31,14.8" />
          <polygon fill="#E4761B" points="9,14.8 14,8.6 20,11.5 20,20.5 12.8,20.5" />
          <polygon fill="#D96A17" points="31,14.8 26,8.6 20,11.5 20,20.5 27.2,20.5" />
          <polygon fill="#F5841F" points="12.8,20.5 20,20.5 20,31.5 11.6,26" />
          <polygon fill="#E4761B" points="27.2,20.5 20,20.5 20,31.5 28.4,26" />
          <polygon fill="#EAD9C4" points="20,11.5 16.4,18 20,21 23.6,18" />
        </svg>
        MetaMask でログイン
      </button>
      {error ? <p className={s.authErr}>{error}</p> : null}
    </div>
  );
}
