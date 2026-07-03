'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

const TRAINING_OPTIONS = [
  { value: 'SPEED_TRAINING', label: 'スピード' },
  { value: 'POWER_TRAINING', label: 'パワー' },
  { value: 'RECOVERY_TRAINING', label: '回復' },
] as const;

/** Daily training selection (Decision 066): one per horse per race date. */
export function TrainingForm({ horseId }: { horseId: string }) {
  const router = useRouter();
  const [trainingType, setTrainingType] = useState<string>('SPEED_TRAINING');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await apiFetch<{ effective_race_date: string }>(
      `/api/v1/horses/${horseId}/training`,
      { method: 'POST', body: { training_type: trainingType } },
    );
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? 'トレーニングの登録に失敗しました');
      return;
    }
    setMessage(
      `${(result.body as { effective_race_date: string }).effective_race_date} のレースに適用されます。`,
    );
    router.refresh();
  }

  return (
    <form className="stack" onSubmit={(e) => void submit(e)}>
      <label>
        本日のトレーニング(1日1回・スナップショット締切前)
        <select value={trainingType} onChange={(e) => setTrainingType(e.target.value)}>
          {TRAINING_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}({o.value})
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
      <button type="submit" disabled={busy}>
        トレーニングする
      </button>
    </form>
  );
}
