'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import type { AppDict } from '@/lib/i18n-shared';
import s from '@/app/dashboard.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';
import { Button } from '@/components/ui/Button';

/**
 * 引換コード(Decision 095)。セミナー参加者がコードを入力すると、
 * 運営厩舎から馬が1頭その場で届く。控えめなトグル — コードを
 * 持たない大多数のユーザーには1行のリンクにしか見えない。
 */
export function PromoRedeemForm({ t }: { t: AppDict['promo'] }) {
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
      setError(errorMessage(r.body) ?? t.err_default);
    }
  };

  if (horse) {
    return (
      <section className={s.promoCard}>
        <span className={s.promoDone}>
          {t.done_pre}<b>{horse.name}</b>{t.done_post}
        </span>
        <Link href={`/horses/${horse.id}`} className={s.promoLink}>{t.view_horse}</Link>
      </section>
    );
  }

  if (!open) {
    return (
      <button type="button" className={s.promoToggle} onClick={() => setOpen(true)}>
        {t.toggle}
      </button>
    );
  }

  return (
    <section className={s.promoCard}>
      <span className={s.promoLabel}>{t.label}</span>
      <input
        className={s.promoInput}
        placeholder="SDD-XXXX-XXXX"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        disabled={busy}
        maxLength={20}
      />
      <Button className={s.promoBtn} onClick={() => void submit()} busy={busy} busyLabel={t.submitting} disabled={code.trim().length < 4} sound="confirm">
        {t.submit}
      </Button>
      <Button className={s.promoCancel} onClick={() => setOpen(false)} disabled={busy}>
        {t.close}
      </Button>
      {error ? <ErrorLine className={s.promoErr} inline>{error}</ErrorLine> : null}
    </section>
  );
}
