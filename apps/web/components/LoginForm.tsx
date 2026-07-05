'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { siteOrigin, supabaseBrowser } from '@/lib/client-api';
import s from '@/app/login/login.module.css';

/**
 * Login methods (Decision 071), all three presented clearly on one cyberpunk
 * surface: MetaMask (Sign-In with Ethereum via Supabase Web3), Google OAuth,
 * and email + password (with a sign-up toggle).
 */
export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  async function loginWithMetaMask() {
    setBusy(true);
    setError(null);
    const injected = (window as { ethereum?: unknown }).ethereum;
    if (!injected) {
      setBusy(false);
      setError(
        'MetaMaskが見つかりません。ブラウザ拡張をインストールするか、MetaMaskアプリ内のブラウザでこのページを開いてください。',
      );
      return;
    }
    const { error: web3Error } = await supabaseBrowser().auth.signInWithWeb3({
      chain: 'ethereum',
      statement: 'Seven Days Derby にサインインします。',
    });
    setBusy(false);
    if (web3Error) {
      setError(web3Error.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function loginWithGoogle() {
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteOrigin()}/auth/callback` },
    });
    // On success the browser redirects to Google; only errors land here.
    if (oauthError) {
      setBusy(false);
      setError(oauthError.message);
    }
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const auth = supabaseBrowser().auth;
    const result =
      mode === 'signin'
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className={s.stack}>
      <button className={`${s.btn} ${s.meta}`} onClick={() => void loginWithMetaMask()} disabled={busy}>
        <svg width="22" height="21" viewBox="0 0 318.6 318.6" aria-hidden="true">
          <g strokeLinecap="round" strokeLinejoin="round">
            <polygon fill="#E2761B" stroke="#E2761B" points="274.1,35.5 174.6,109.4 193,65.8" />
            <polygon fill="#E4761B" stroke="#E4761B" points="44.4,35.5 143.1,110.1 125.6,65.8" />
            <polygon fill="#E4761B" stroke="#E4761B" points="238.3,206.8 211.8,247.4 268.5,263 284.8,207.7" />
            <polygon fill="#E4761B" stroke="#E4761B" points="33.9,207.7 50.1,263 106.8,247.4 80.3,206.8" />
            <polygon fill="#E4761B" stroke="#E4761B" points="103.6,138.2 87.8,162.1 144.1,164.6 142.1,104.1" />
            <polygon fill="#E4761B" stroke="#E4761B" points="214.9,138.2 175.9,103.4 174.6,164.6 230.8,162.1" />
            <polygon fill="#E4761B" stroke="#E4761B" points="106.8,247.4 140.6,230.9 111.4,208.1" />
            <polygon fill="#E4761B" stroke="#E4761B" points="177.9,230.9 211.8,247.4 207.1,208.1" />
            <polygon fill="#D7C1B3" stroke="#D7C1B3" points="211.8,247.4 207.1,208.1 180.3,209.5 180.3,262.3" />
            <polygon fill="#D7C1B3" stroke="#D7C1B3" points="106.8,247.4 138.3,262.3 138.1,209.5 111.4,208.1" />
            <polygon fill="#233447" stroke="#233447" points="140.6,188.2 130.8,208.8 165.6,199.5" />
            <polygon fill="#233447" stroke="#233447" points="178,188.2 153,199.5 187.8,208.8" />
            <polygon fill="#CD6116" stroke="#CD6116" points="106.8,247.4 111.6,206.8 80.3,207.7" />
            <polygon fill="#CD6116" stroke="#CD6116" points="207,206.8 211.8,247.4 238.3,207.7" />
            <polygon fill="#CD6116" stroke="#CD6116" points="230.8,162.1 174.6,164.6 179.8,193.5 188.1,176.1 208.1,185.2" />
            <polygon fill="#CD6116" stroke="#CD6116" points="110.6,185.2 130.6,176.1 138.8,193.5 144.1,164.6 87.8,162.1" />
            <polygon fill="#E4751F" stroke="#E4751F" points="87.8,162.1 111.4,208.1 110.6,185.2" />
            <polygon fill="#E4751F" stroke="#E4751F" points="208.1,185.2 207.1,208.1 230.8,162.1" />
            <polygon fill="#E4751F" stroke="#E4751F" points="144.1,164.6 138.8,193.5 145.4,227.6 146.9,182.7" />
            <polygon fill="#E4751F" stroke="#E4751F" points="174.6,164.6 171.9,182.6 173.1,227.6 179.8,193.5" />
            <polygon fill="#F6851B" stroke="#F6851B" points="179.8,193.5 173.1,227.6 177.9,230.9 207.1,208.1 208.1,185.2" />
            <polygon fill="#F6851B" stroke="#F6851B" points="110.6,185.2 111.4,208.1 140.6,230.9 145.4,227.6 138.8,193.5" />
            <polygon fill="#C0AD9E" stroke="#C0AD9E" points="180.3,262.3 180.3,253 178.1,251.1 140.3,251.1 138.1,253 138.3,262.3 106.8,247.4 117.8,256.4 140.1,271.9 178.4,271.9 200.8,256.4 211.8,247.4" />
            <polygon fill="#161616" stroke="#161616" points="177.9,230.9 173.1,227.6 145.4,227.6 140.6,230.9 138.1,253 140.3,251.1 178.1,251.1 180.3,253" />
            <polygon fill="#763D16" stroke="#763D16" points="278.3,114.2 286.8,73.4 274.1,35.5 177.9,106.9 214.9,138.2 267.2,153.5 278.8,140 273.8,136.4 281.8,129.1 275.6,124.3 283.6,118.2" />
            <polygon fill="#763D16" stroke="#763D16" points="31.8,73.4 40.3,114.2 34.9,118.2 42.9,124.3 36.8,129.1 44.8,136.4 39.8,140 51.3,153.5 103.6,138.2 140.6,106.9 44.4,35.5" />
            <polygon fill="#F6851B" stroke="#F6851B" points="267.2,153.5 214.9,138.2 230.8,162.1 207.1,208.1 268.5,207.7 284.8,207.7" />
            <polygon fill="#F6851B" stroke="#F6851B" points="103.6,138.2 51.3,153.5 33.9,207.7 50.1,207.7 111.4,208.1 87.8,162.1" />
            <polygon fill="#F6851B" stroke="#F6851B" points="174.6,164.6 177.9,106.9 193.1,65.8 125.6,65.8 140.6,106.9 144.1,164.6 145.3,182.8 145.4,227.6 173.1,227.6 173.3,182.8" />
          </g>
        </svg>
        メタマスクでログイン
      </button>

      <button className={`${s.btn} ${s.google}`} onClick={() => void loginWithGoogle()} disabled={busy}>
        <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Google でログイン
      </button>

      <div className={s.or}>
        <span className={s.ln} />
        または メールアドレスで
        <span className={s.ln} />
      </div>

      <form className={s.stack} onSubmit={(e) => void submitEmail(e)}>
        <label className={s.field}>
          メールアドレス
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className={s.field}>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
        </label>
        <button type="submit" className={`${s.btn} ${s.email}`} disabled={busy}>
          {mode === 'signin' ? 'メールでログイン' : 'アカウントを作成'}
        </button>
      </form>

      <button type="button" className={s.toggle} onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'アカウントをお持ちでない方は 新規登録' : '既にアカウントをお持ちの方は ログイン'}
      </button>

      {error ? <p className={s.err}>{error}</p> : null}
    </div>
  );
}
