'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

export function RecoveryActions({ recoveryId, approved }: { recoveryId: string; approved: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function act(action: 'approve' | 'execute') {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch(`/api/v1/admin/recovery/${recoveryId}/${action}`, {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (result.status !== 200) {
      setMessage(errorMessage(result.body) ?? '操作に失敗しました');
      return;
    }
    setMessage(action === 'approve' ? '承認を記録しました' : 'リカバリを実行しました');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        {!approved ? (
          <button onClick={() => void act('approve')} disabled={busy}>
            承認
          </button>
        ) : (
          <button onClick={() => void act('execute')} disabled={busy}>
            実行
          </button>
        )}
      </div>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
