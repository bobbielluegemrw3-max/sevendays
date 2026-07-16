'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '@/app/horse-detail.module.css';

/**
 * 馬の転送(Decision 094)。メール宛先指定・即時・取消不可。
 * 強い警告つきの2段階確認 — アイテムギフトと同じ流儀だが、馬は
 * 「譲渡後は手動出品不可」という恒久的な制約が付くため明示する。
 */
export function HorseTransferForm({ horseId, horseName, t }: { horseId: string; horseName: string; t: AppDict['horse'] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async () => {
    if (busy || !confirmed || !email.includes('@')) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/api/v1/horses/${horseId}/transfer`, {
      method: 'POST',
      body: { recipient_email: email.trim() },
    });
    setBusy(false);
    if (result.status === 200) {
      setSentTo(email.trim());
      router.refresh();
    } else {
      setError(errorMessage(result.body) ?? t.gift_fail);
    }
  };

  if (sentTo) {
    return (
      <div className={s.giftDone}>{fill(t.gift_done_tpl, { name: horseName, to: sentTo })}</div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={s.giftToggle} onClick={() => setOpen(true)}>
        {t.gift_toggle}
      </button>
    );
  }

  return (
    <div className={s.giftForm}>
      <div className={s.giftHead}>{fill(t.gift_head_tpl, { name: horseName })}</div>
      <ul className={s.giftWarn}>
        <li>{t.gift_w1}</li>
        <li>{t.gift_w2}</li>
        <li>{t.gift_w3}</li>
      </ul>
      <input
        type="email"
        className={s.giftInput}
        placeholder={t.gift_email_ph}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
      <label className={s.giftCheck}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>{fill(t.gift_confirm_tpl, { name: horseName })}</span>
      </label>
      {error ? <div className={s.giftError}>{error}</div> : null}
      <div className={s.giftActions}>
        <button type="button" className={s.giftCancel} onClick={() => setOpen(false)} disabled={busy}>
          {t.gift_cancel}
        </button>
        <button
          type="button"
          className={s.giftSubmit}
          onClick={() => void submit()}
          disabled={busy || !confirmed || !email.includes('@')}
        >
          {busy ? t.gift_busy : t.gift_submit}
        </button>
      </div>
    </div>
  );
}
