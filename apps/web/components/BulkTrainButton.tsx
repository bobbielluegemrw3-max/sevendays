'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/stable.module.css';

/**
 * 一括調教(Decision 088)。未調教の全馬に recommendedTrainingV1(タイプ相性+
 * 疲労60で回復)をワンタップ適用。個別に調教済みの馬・手動出品中の馬はサーバー側で
 * スキップされる — 「エースだけ手動、残りは一括」が自然に成立する。
 */

const TYPE_JA: Record<string, string> = {
  SPEED_TRAINING: 'スピード',
  POWER_TRAINING: 'パワー',
  RECOVERY_TRAINING: '回復',
};

export function BulkTrainButton({ untrainedCount, preview = false }: { untrainedCount: number; preview?: boolean }) {
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
      setMessage(`${untrainedCount}頭を調教しました(プレビュー)。`);
      return;
    }
    const result = await apiFetch<{ trained: number; by_type: Record<string, number> }>(
      '/api/v1/horses/train-all',
      { method: 'POST', body: {} },
    );
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '一括調教に失敗しました');
      return;
    }
    const body = result.body as { trained: number; by_type: Record<string, number> };
    const parts = Object.entries(body.by_type)
      .map(([t, n]) => `${TYPE_JA[t] ?? t}${n}`)
      .join('・');
    setMessage(body.trained > 0 ? `${body.trained}頭を調教しました(${parts})。` : '調教できる馬はいませんでした。');
    router.refresh();
  }

  return (
    <div className={s.bulkTrain}>
      {untrainedCount > 0 ? (
        <button type="button" className={s.bulkTrainBtn} disabled={busy} onClick={() => void run()}>
          {busy ? '調教中…' : `⚡ 未調教の${untrainedCount}頭をまとめて調教`}
        </button>
      ) : null}
      <span className={s.bulkTrainNote}>
        馬タイプに最適な調教を自動選択(疲労が高い馬は回復)。個別にこだわる馬は先にカードから調教を。
      </span>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
    </div>
  );
}
