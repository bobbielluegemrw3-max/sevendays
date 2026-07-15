'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

/**
 * 単独リカバリ(DEBUG/TESTNET, 2026-07-15)。FINANCE_ADMIN + SUPER_ADMIN を
 * 併せ持つ管理者1名が、FAILED/PARTIAL_FAILED バッチを二人目の承認なしで復旧する。
 * 押すと精算バッチが失敗ステップから再実行される — 不可逆なので確認を挟む。
 */
export function RecoverBatchButton({ batchId, batchDate }: { batchId: string; batchDate: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMessage(null);
    const result = await apiFetch<{ status: string }>(`/api/v1/admin/batches/${batchId}/recover`, {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    setConfirming(false);
    if (result.status !== 200) {
      setMessage(errorMessage(result.body) ?? 'リカバリに失敗しました');
      return;
    }
    const s = (result.body as { status?: string }).status ?? '';
    setMessage(s === 'COMPLETED' ? '復旧完了 — バッチはCOMPLETED、マーケット再開' : `再実行結果: ${s}`);
    router.refresh();
  }

  if (!confirming) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        <button onClick={() => setConfirming(true)} disabled={busy}>単独リカバリ実行</button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
      <span className="muted">{batchDate} を失敗ステップから再実行します。よろしいですか?</span>
      <div style={{ display: 'flex', gap: '0.4rem' }}>
        <button onClick={() => void run()} disabled={busy}>{busy ? '実行中…' : '実行する'}</button>
        <button className="secondary" onClick={() => setConfirming(false)} disabled={busy}>やめる</button>
      </div>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
