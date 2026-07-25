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
  // A2: 金が動く操作は一発送信にしない。入力→確認(review)→送信 の2段階。
  const [reviewing, setReviewing] = useState(false);
  const [checked, setChecked] = useState(false);

  // 入力フォームの送信は「確認へ進む」だけ(実際の出金APIは confirm() で叩く)。
  function toReview(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setChecked(false);
    setReviewing(true);
  }

  async function confirm() {
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
      setReviewing(false); // 修正できるよう入力へ戻す
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return <p className="ok">{t.wd_done}</p>;
  }

  // ── 確認ステップ: 金額 + 宛先アドレス(全文) + ネットワークを提示し、
  //    「確認した」チェック必須で初めて送信できる。宛先は改変不可(戻って直す)。
  if (reviewing) {
    return (
      <div className="stack">
        <p style={{ fontWeight: 700, margin: 0 }}>{t.wd_confirm_title}</p>
        <dl className="stack" style={{ margin: 0 }}>
          <div>
            <dt className="muted">{t.wd_confirm_amount}</dt>
            <dd style={{ margin: 0 }}>{amount} USDT</dd>
          </div>
          <div>
            <dt className="muted">{t.wd_confirm_address}</dt>
            <dd style={{ margin: 0, wordBreak: 'break-all' }}>{toAddress}</dd>
          </div>
          <div>
            <dt className="muted">{t.wd_confirm_network}</dt>
            <dd style={{ margin: 0 }}>Polygon PoS · USDT</dd>
          </div>
        </dl>
        <p style={{ color: 'var(--warn)', fontSize: '0.9rem' }}>{t.wd_confirm_warn}</p>
        <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{t.wd_confirm_check}</span>
        </label>
        {error ? <ErrorLine>{error}</ErrorLine> : null}
        <div className="row" style={{ gap: 8 }}>
          <Button variant="ghost" type="button" onClick={() => setReviewing(false)} disabled={busy}>
            {t.wd_confirm_back}
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => void confirm()}
            busy={busy}
            busyLabel={t.wd_busy}
            disabled={!checked}
            sound="confirm"
          >
            {t.wd_confirm_submit}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form className="stack" onSubmit={toReview}>
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
      {/* A2: 送信ではなく確認ステップへ進む。実際の出金は確認画面のチェック後。 */}
      <Button variant="primary" type="submit" sound="nav">
        {t.wd_submit}
      </Button>
    </form>
  );
}
