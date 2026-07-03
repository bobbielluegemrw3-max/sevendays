'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

/**
 * Dual-approval actions. The server rejects an approval role the caller's
 * JWT does not carry, and release needs two DISTINCT admins — the buttons
 * just express intent.
 */
export function WithdrawalReviewActions({ withdrawalId }: { withdrawalId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function approve(role: 'FINANCE_ADMIN' | 'SUPER_ADMIN') {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch<{ released: boolean }>(
      `/api/v1/admin/withdrawals/${withdrawalId}/approve`,
      { method: 'POST', body: { role }, idempotencyKey: crypto.randomUUID() },
    );
    setBusy(false);
    if (result.status !== 200) {
      setMessage(errorMessage(result.body) ?? '承認に失敗しました');
      return;
    }
    setMessage((result.body as { released: boolean }).released ? '解放されました(送金列へ)' : '承認を記録しました(もう1名の承認待ち)');
    router.refresh();
  }

  async function reject() {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`/api/v1/admin/withdrawals/${withdrawalId}/reject`, {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (result.status !== 200) {
      setMessage(errorMessage(result.body) ?? '却下に失敗しました');
      return;
    }
    setMessage('却下し、全額返金しました');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button onClick={() => void approve('FINANCE_ADMIN')} disabled={busy}>
          FINANCE承認
        </button>
        <button onClick={() => void approve('SUPER_ADMIN')} disabled={busy}>
          SUPER承認
        </button>
        <button className="secondary" onClick={() => void reject()} disabled={busy}>
          却下(返金)
        </button>
      </div>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
