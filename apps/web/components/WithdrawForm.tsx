'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

/**
 * Withdrawal request form. Amount rules come from the server (min 10 USDT,
 * max 6 decimals — Decisions 060/064); this form only mirrors them for UX.
 * The Idempotency-Key is generated once per form session so a double-click
 * can never create two withdrawals.
 */
export function WithdrawForm() {
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
      setError(errorMessage(result.body) ?? '出金リクエストに失敗しました');
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return <p className="ok">出金リクエストを受け付けました。ネットワーク手数料控除後の金額が送金されます。</p>;
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <label>
        金額(USDT・最低10・小数6桁まで)
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
        送金先アドレス(Polygon PoS)
        <input
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="0x…"
          required
        />
      </label>
      {error ? <p className="error">{error}</p> : null}
      <p className="muted">実費ネットワーク手数料が金額から控除されます。1,000 USDT以上は管理者審査があります。</p>
      <button className="primary" type="submit" disabled={busy}>
        出金する
      </button>
    </form>
  );
}
