'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { type AppDict } from '@/lib/i18n-shared';
import s from '@/app/horse-detail.module.css';

/**
 * 施策C(FUN_V3): 1頭非売指定。
 * 「自動出品(Smart)から保護する1頭」をこの馬へ移す。保護は出品選定の除外だけに
 * 作用し、レース・BURN・価格には影響しない。変更は1日1回。
 */
export function HorseReserveControl({
  horseId,
  reserved,
  t,
}: {
  horseId: string;
  reserved: boolean;
  t: AppDict['horse'];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reserve = async () => {
    if (busy || reserved) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/api/v1/horses/${horseId}/reserve`, { method: 'POST', body: {} });
    setBusy(false);
    if (result.status === 200) {
      router.refresh();
    } else {
      setError(errorMessage(result.body) ?? t.reserve_fail);
    }
  };

  return (
    <div className={s.reserveBox}>
      <div className={s.reserveNote}>{t.reserve_note}</div>
      {reserved ? (
        <div className={s.reserveOn}>🛡 {t.reserve_on}</div>
      ) : (
        <button type="button" className={s.reserveBtn} onClick={() => void reserve()} disabled={busy}>
          {busy ? t.reserve_busy : t.reserve_cta}
        </button>
      )}
      {error ? <div className={s.giftError}>{error}</div> : null}
    </div>
  );
}
