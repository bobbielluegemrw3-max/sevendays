'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';

interface Session {
  id: string;
  status: string;
  locked_amount: string;
  assigned_price: string | null;
  refund_amount: string | null;
}

/**
 * Purchase session lifecycle: create (idempotent per click-session),
 * inspect, cancel. All pricing/locking happens server-side.
 */
export function PurchasePanel() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(sessionId: string) {
    const detail = await apiFetch<Session>(`/api/v1/purchase/${sessionId}`);
    if (detail.status === 200) setSession(detail.body as Session);
  }

  async function create() {
    setBusy(true);
    setError(null);
    const result = await apiFetch<{ purchase_session_id: string }>('/api/v1/purchase', {
      method: 'POST',
      idempotencyKey: crypto.randomUUID(),
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '購入セッションの作成に失敗しました');
      return;
    }
    await refresh((result.body as { purchase_session_id: string }).purchase_session_id);
    router.refresh();
  }

  async function cancel() {
    if (!session) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/api/v1/purchase/${session.id}/cancel`, { method: 'POST' });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? 'キャンセルに失敗しました');
      return;
    }
    await refresh(session.id);
    router.refresh();
  }

  return (
    <div className="stack">
      {session ? (
        <table>
          <tbody>
            <tr>
              <th>セッション</th>
              <td>
                <code>{session.id}</code>
              </td>
            </tr>
            <tr>
              <th>状態</th>
              <td>
                <span className="badge">{session.status}</span>
              </td>
            </tr>
            <tr>
              <th>ロック額</th>
              <td>{session.locked_amount} USDT</td>
            </tr>
            {session.assigned_price ? (
              <tr>
                <th>割当価格</th>
                <td>{session.assigned_price} USDT</td>
              </tr>
            ) : null}
            {session.refund_amount ? (
              <tr>
                <th>返金額</th>
                <td>{session.refund_amount} USDT</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button onClick={() => void create()} disabled={busy}>
          購入セッションを作成
        </button>
        {session && session.status === 'PENDING' ? (
          <button className="secondary" onClick={() => void cancel()} disabled={busy}>
            キャンセル
          </button>
        ) : null}
        {session ? (
          <button className="secondary" onClick={() => void refresh(session.id)} disabled={busy}>
            状態を更新
          </button>
        ) : null}
      </div>
    </div>
  );
}
