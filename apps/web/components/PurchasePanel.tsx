'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { refreshSoft } from '@/lib/deferred-refresh';
import { apiFetch, errorMessage } from '@/lib/client-api';
import { ErrorLine } from '@/components/ui/ErrorLine';

/** 予約のキャンセル(20:00のバッチロック前のみ)。作成は ReservePanel(Decision 085)。 */
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
    refreshSoft(router);
  }

  return (
    <span>
      <button className="secondary" onClick={() => void cancel()} disabled={busy}>
        キャンセル
      </button>
      {error ? <ErrorLine inline> {error}</ErrorLine> : null}
    </span>
  );
}
