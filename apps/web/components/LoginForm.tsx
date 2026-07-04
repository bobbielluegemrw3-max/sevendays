'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/client-api';

/**
 * Login methods (Decision 071): MetaMask (Sign-In with Ethereum via
 * Supabase Web3 Wallet) and Google OAuth are the primary options; the
 * original email+password form remains available as a fallback.
 */
export function LoginForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmail, setShowEmail] = useState(false);
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
    router.push('/');
    router.refresh();
  }

  async function loginWithGoogle() {
    setBusy(true);
    setError(null);
    const { error: oauthError } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
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
    router.push('/');
    router.refresh();
  }

  return (
    <div className="stack">
      <button onClick={() => void loginWithMetaMask()} disabled={busy}>
        🦊 MetaMask でログイン
      </button>
      <button onClick={() => void loginWithGoogle()} disabled={busy}>
        Google でログイン
      </button>
      {error ? <p className="error">{error}</p> : null}

      <button type="button" className="secondary" onClick={() => setShowEmail(!showEmail)}>
        {showEmail ? 'メールログインを隠す' : 'メールでログイン(従来方式)'}
      </button>
      {showEmail ? (
        <form className="stack" onSubmit={(e) => void submitEmail(e)}>
          <label>
            メールアドレス
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {mode === 'signin' ? 'ログイン' : 'アカウント作成'}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? '新規登録へ' : 'ログインへ'}
          </button>
        </form>
      ) : null}
    </div>
  );
}
