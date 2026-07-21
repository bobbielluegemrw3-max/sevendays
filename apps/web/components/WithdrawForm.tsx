'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { Button } from '@/components/ui/Button';
import { ErrorLine } from '@/components/ui/ErrorLine';
import type { AppDict } from '@/lib/i18n-shared';

/** /wallet の文言(サーバー親から受け取る — クライアントからAPP_COPYは読まない)。 */
type WalletCopy = AppDict['walletPage'];

/**
 * Withdrawal request form. Amount rules come from the server (min 10 USDT,
 * max 6 decimals — Decisions 060/064); this form only mirrors them for UX.
 * The Idempotency-Key is generated once per form session so a double-click
 * can never create two withdrawals.
 */
export function WithdrawForm({ t }: { t: WalletCopy }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ id: string; status: string }>('/api/v1/wallet/withdraw', {
      method: 'POST',
      body: { amount, to_address: toAddress },
      idempotencyKey,
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? t.wd_fail);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return <p className="ok">{t.wd_done}</p>;
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <label>
        {t.wd_amount_label}
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          pattern="\d+(\.\d{1,6})?"
          placeholder="10.00"
          required
        />
      </label>
      <label>
        {t.wd_address_label}
        <input
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="0x…"
          required
        />
      </label>
      {error ? <ErrorLine>{error}</ErrorLine> : null}
      <p className="muted">{t.wd_note}</p>
      {/* UI基盤 1-2: 共有Buttonへ。送信中はシマー(btnRolling)が出て、
          二度押しの不安が消える。金が動く操作なので最優先で配線した。 */}
      <Button variant="primary" type="submit" busy={busy} busyLabel={t.wd_busy} sound="confirm">
        {t.wd_submit}
      </Button>
    </form>
  );
}
