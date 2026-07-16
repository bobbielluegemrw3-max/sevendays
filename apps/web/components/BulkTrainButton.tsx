'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/stable.module.css';

/**
 * 一括調教(Decision 088)。未調教の全馬に recommendedTrainingV1(タイプ相性+
 * 疲労60で回復)をワンタップ適用。個別に調教済みの馬・手動出品中の馬はサーバー側で
 * スキップされる — 「エースだけ手動、残りは一括」が自然に成立する。
 */

export function BulkTrainButton({
  untrainedCount,
  t,
  preview = false,
}: {
  untrainedCount: number;
  t: AppDict['stable'];
  preview?: boolean;
}) {
  const typeLabel: Record<string, string> = {
    SPEED_TRAINING: t.type_speed,
    POWER_TRAINING: t.type_power,
    RECOVERY_TRAINING: t.type_recovery,
  };
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (untrainedCount <= 0 && !message) return null;

  async function run() {
    if (busy) return;
    setBusy(true);
    setError(null);
    if (preview) {
      setBusy(false);
      setMessage(fill(t.bulk_done_tpl, { n: untrainedCount, parts: 'preview' }));
      return;
    }
    const result = await apiFetch<{ trained: number; by_type: Record<string, number> }>(
      '/api/v1/horses/train-all',
      { method: 'POST', body: {} },
    );
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? t.bulk_fail);
      return;
    }
    const body = result.body as { trained: number; by_type: Record<string, number> };
    const parts = Object.entries(body.by_type)
      .map(([k, n]) => `${typeLabel[k] ?? k}${n}`)
      .join('・');
    setMessage(body.trained > 0 ? fill(t.bulk_done_tpl, { n: body.trained, parts }) : t.bulk_none);
    router.refresh();
  }

  return (
    <div className={s.bulkTrain}>
      {untrainedCount > 0 ? (
        <button type="button" className={s.bulkTrainBtn} disabled={busy} onClick={() => void run()}>
          {busy ? t.bulk_busy : fill(t.bulk_btn_tpl, { n: untrainedCount })}
        </button>
      ) : null}
      <span className={s.bulkTrainNote}>{t.bulk_note}</span>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
    </div>
  );
}
