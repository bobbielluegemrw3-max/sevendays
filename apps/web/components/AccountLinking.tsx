'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserIdentity } from '@supabase/supabase-js';
import { apiFetch, errorMessage, supabaseBrowser } from '@/lib/client-api';

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

/** MUST stay in sync with packages/blockchain/src/wallet-link.ts. */
function walletLinkMessage(userId: string): string {
  return `Seven Days Derby wallet link\nuser:${userId}\nissued:${new Date().toISOString()}`;
}

function toHex(text: string): string {
  return `0x${Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Decision 072: cross-linking of login methods.
 * - Google: native Supabase identity linking (same auth user).
 * - MetaMask: personal_sign proof -> user_wallets; Web3 sessions for a
 *   linked wallet resolve to this game account at the API bridge.
 */
export function AccountLinking({ userId, wallets }: { userId: string; wallets: string[] }) {
  const router = useRouter();
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabaseBrowser()
      .auth.getUserIdentities()
      .then(({ data }) => setIdentities(data?.identities ?? []));
  }, []);

  async function linkGoogle() {
    setBusy(true);
    setError(null);
    const { error: linkError } = await supabaseBrowser().auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/account` },
    });
    if (linkError) {
      setBusy(false);
      setError(linkError.message);
    }
  }

  async function linkMetaMask() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const injected = (window as { ethereum?: Eip1193Provider }).ethereum;
    if (!injected) {
      setBusy(false);
      setError('MetaMaskが見つかりません。拡張機能をインストールしてください。');
      return;
    }
    try {
      const accounts = (await injected.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts[0];
      if (!address) throw new Error('ウォレットアドレスを取得できませんでした');
      const linkText = walletLinkMessage(userId);
      const signature = (await injected.request({
        method: 'personal_sign',
        params: [toHex(linkText), address],
      })) as string;
      const result = await apiFetch('/api/v1/account/link-wallet', {
        method: 'POST',
        body: { address, message: linkText, signature },
      });
      setBusy(false);
      if (result.status !== 200) {
        setError(errorMessage(result.body) ?? 'ウォレットの紐づけに失敗しました');
        return;
      }
      setMessage(`ウォレット ${address.slice(0, 6)}…${address.slice(-4)} を紐づけました`);
      router.refresh();
    } catch (e) {
      setBusy(false);
      setError((e as Error).message);
    }
  }

  async function unlinkWallet(address: string) {
    setBusy(true);
    setError(null);
    const result = await apiFetch('/api/v1/account/unlink-wallet', {
      method: 'POST',
      body: { address },
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '解除に失敗しました');
      return;
    }
    router.refresh();
  }

  async function unlinkIdentity(identity: UserIdentity) {
    if (!identities || identities.length < 2) return;
    setBusy(true);
    setError(null);
    const { error: unlinkError } = await supabaseBrowser().auth.unlinkIdentity(identity);
    setBusy(false);
    if (unlinkError) {
      setError(unlinkError.message);
      return;
    }
    setIdentities(identities.filter((i) => i.identity_id !== identity.identity_id));
  }

  const hasGoogle = identities?.some((i) => i.provider === 'google') ?? false;

  return (
    <div className="stack">
      <h3>ログインID(Supabase)</h3>
      {identities === null ? (
        <p className="muted">読み込み中…</p>
      ) : (
        <table>
          <tbody>
            {identities.map((identity) => (
              <tr key={identity.identity_id}>
                <td>
                  <span className="badge">{identity.provider}</span>
                </td>
                <td className="muted">{(identity.identity_data?.email as string | undefined) ?? ''}</td>
                <td>
                  {identities.length > 1 ? (
                    <button className="secondary" onClick={() => void unlinkIdentity(identity)} disabled={busy}>
                      解除
                    </button>
                  ) : (
                    <span className="muted">(最後のログインIDは解除できません)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!hasGoogle ? (
        <button onClick={() => void linkGoogle()} disabled={busy}>
          Google を紐づけ
        </button>
      ) : null}

      <h3>ウォレット</h3>
      {wallets.length > 0 ? (
        <table>
          <tbody>
            {wallets.map((address) => (
              <tr key={address}>
                <td>
                  <code>{address}</code>
                </td>
                <td>
                  <button className="secondary" onClick={() => void unlinkWallet(address)} disabled={busy}>
                    解除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">紐づけ済みのウォレットはありません。</p>
      )}
      <button onClick={() => void linkMetaMask()} disabled={busy}>
        🦊 MetaMask を紐づけ
      </button>

      {message ? <p className="ok">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
