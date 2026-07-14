'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '@/app/horse-detail.module.css';

/**
 * 馬の転送(Decision 094)。メール宛先指定・即時・取消不可。
 * 強い警告つきの2段階確認 — アイテムギフトと同じ流儀だが、馬は
 * 「譲渡後は手動出品不可」という恒久的な制約が付くため明示する。
 */
export function HorseTransferForm({ horseId, horseName }: { horseId: string; horseName: string }) {
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
      setError(errorMessage(result.body) ?? '転送に失敗しました。');
    }
  };

  if (sentTo) {
    return (
      <div className={s.giftDone}>
        {horseName} を {sentTo} さんへ贈りました。今夜から相手の厩舎で出走します。
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className={s.giftToggle} onClick={() => setOpen(true)}>
        この馬を仲間に贈る(転送)→
      </button>
    );
  }

  return (
    <div className={s.giftForm}>
      <div className={s.giftHead}>馬の転送 — {horseName}</div>
      <ul className={s.giftWarn}>
        <li>転送は<b>即時・取消不可</b>です(1日3頭まで・同じ馬は1日1回)。</li>
        <li>受け取った馬は<b>手動出品ができなくなります</b>(毎晩の出走・調教・アイテムは通常どおり。スマート出品の対象にはなります)。</li>
        <li>USDTのユーザー間送金ではありません — ゲーム内資産の移動です。</li>
      </ul>
      <input
        type="email"
        className={s.giftInput}
        placeholder="相手のメールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
      <label className={s.giftCheck}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>上記を理解し、{horseName} を贈ります(取消不可)</span>
      </label>
      {error ? <div className={s.giftError}>{error}</div> : null}
      <div className={s.giftActions}>
        <button type="button" className={s.giftCancel} onClick={() => setOpen(false)} disabled={busy}>
          やめる
        </button>
        <button
          type="button"
          className={s.giftSubmit}
          onClick={() => void submit()}
          disabled={busy || !confirmed || !email.includes('@')}
        >
          {busy ? '転送中…' : 'この馬を贈る'}
        </button>
      </div>
    </div>
  );
}
