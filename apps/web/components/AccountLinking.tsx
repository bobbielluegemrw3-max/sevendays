'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { UserIdentity } from '@supabase/supabase-js';
import { apiFetch, errorMessage, siteOrigin, supabaseBrowser } from '@/lib/client-api';
import { fill, type AppDict } from '@/lib/i18n-shared';
import { ErrorLine } from '@/components/ui/ErrorLine';
import { Button } from '@/components/ui/Button';

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
export function AccountLinking({ userId, wallets, t }: { userId: string; wallets: string[]; t: AppDict['linking'] }) {
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
      options: { redirectTo: `${siteOrigin()}/auth/callback?next=/account` },
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
      setError(t.err_no_metamask);
      return;
    }
    try {
      const accounts = (await injected.request({ method: 'eth_requestAccounts' })) as string[];
      const address = accounts[0];
      if (!address) throw new Error(t.err_no_address);
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
        setError(errorMessage(result.body) ?? t.err_link_wallet);
        return;
      }
      setMessage(fill(t.linked_tpl, { addr: `${address.slice(0, 6)}…${address.slice(-4)}` }));
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
      setError(errorMessage(result.body) ?? t.err_unlink);
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
      <h3>{t.login_id}</h3>
      {identities === null ? (
        <p className="muted">{t.loading}</p>
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
                    <Button variant="secondary" onClick={() => void unlinkIdentity(identity)} busy={busy} sound="confirm">
                      {t.unlink}
                    </Button>
                  ) : (
                    <span className="muted">{t.last_id}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!hasGoogle ? (
        <Button variant="primary" onClick={() => void linkGoogle()} busy={busy} sound="confirm">
          {t.link_google}
        </Button>
      ) : null}

      <h3>{t.wallet_h}</h3>
      {wallets.length > 0 ? (
        <table>
          <tbody>
            {wallets.map((address) => (
              <tr key={address}>
                <td>
                  <code>{address}</code>
                </td>
                <td>
                  <Button variant="secondary" onClick={() => void unlinkWallet(address)} busy={busy} sound="confirm">
                    {t.unlink}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{t.no_wallet}</p>
      )}
      <Button onClick={() => void linkMetaMask()} busy={busy} sound="confirm">
        {t.link_metamask}
      </Button>

      {message ? <p className="ok">{message}</p> : null}
      {error ? <ErrorLine>{error}</ErrorLine> : null}
    </div>
  );
}
