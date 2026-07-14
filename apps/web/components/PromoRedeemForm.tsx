'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '@/app/dashboard.module.css';

/**
 * 引換コード(Decision 095)。セミナー参加者がコードを入力すると、
 * 運営厩舎から馬が1頭その場で届く。控えめなトグル — コードを
 * 持たない大多数のユーザーには1行のリンクにしか見えない。
 */
export function PromoRedeemForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [horse, setHorse] = useState<{ id: string; name: string } | null>(null);

  const submit = async () => {
    if (busy || code.trim().length < 4) return;
    setBusy(true);
    setError(null);
    const r = await apiFetch<{ horse_id: string; horse_name: string }>('/api/v1/promo/redeem', {
      method: 'POST',
      body: { code: code.trim() },
    });
    setBusy(false);
    if (r.status === 200) {
      const body = r.body as { horse_id: string; horse_name: string };
      setHorse({ id: body.horse_id, name: body.horse_name });
      router.refresh();
    } else {
      setError(errorMessage(r.body) ?? '引換に失敗しました。コードをご確認ください。');
    }
  };

  if (horse) {
    return (
      <section className={s.promoCard}>
        <span className={s.promoDone}>
          🎁 <b>{horse.name}</b> があなたの厩舎に届きました — 今夜20:00から出走します。
        </span>
        <Link href={`/horses/${horse.id}`} className={s.promoLink}>馬を見る →</Link>
      </section>
    );
  }

  if (!open) {
    return (
      <button type="button" className={s.promoToggle} onClick={() => setOpen(true)}>
        引換コードをお持ちですか? →
      </button>
    );
  }

  return (
    <section className={s.promoCard}>
      <span className={s.promoLabel}>引換コード</span>
      <input
        className={s.promoInput}
        placeholder="SDD-XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        disabled={busy}
        maxLength={20}
      />
      <button type="button" className={s.promoBtn} onClick={() => void submit()} disabled={busy || code.trim().length < 4}>
        {busy ? '確認中…' : '馬を受け取る'}
      </button>
      <button type="button" className={s.promoCancel} onClick={() => setOpen(false)} disabled={busy}>
        閉じる
      </button>
      {error ? <span className={s.promoErr}>{error}</span> : null}
    </section>
  );
}
