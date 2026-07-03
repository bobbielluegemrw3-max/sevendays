'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

export function BatchRetryButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/api/v1/admin/batches/${batchId}/retry`, {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? 'リトライに失敗しました');
      return;
    }
    router.refresh();
  }

  return (
    <span>
      <button onClick={() => void retry()} disabled={busy}>
        リトライ
      </button>
      {error ? <span className="error"> {error}</span> : null}
    </span>
  );
}
