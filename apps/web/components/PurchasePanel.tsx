'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

/** Creates a purchase session; the page lists ALL sessions server-side. */
export function CreateSessionButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    const result = await apiFetch('/api/v1/purchase', {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '購入セッションの作成に失敗しました');
      return;
    }
    router.refresh();
  }

  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      <button onClick={() => void create()} disabled={busy}>
        購入セッションを作成
      </button>
    </div>
  );
}

export function CancelSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/api/v1/purchase/${sessionId}/cancel`, { method: 'POST' });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? 'キャンセルに失敗しました');
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button className="secondary" onClick={() => void cancel()} disabled={busy}>
        キャンセル
      </button>
      {error ? <span className="error"> {error}</span> : null}
    </span>
  );
}
