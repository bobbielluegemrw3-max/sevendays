'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/admin.module.css';

/* 広告費口座の移動フォーム+二重承認ボタン(FUN改修 B層・FUN_V2_PLAN §4)。
 * ≤閾値は1名で即時(台帳レイヤーがロール・上限を再強制)/超はPENDING→別の管理者が承認。 */

export function MarketingTransferControls({ singleApprovalLimit }: { singleApprovalLimit: number }) {
  const router = useRouter();
  const [direction, setDirection] = useState<'FUND' | 'RETURN'>('FUND');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = Number(amount);
    if (busy || !Number.isFinite(n) || n <= 0 || reason.trim().length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const result = await apiFetch<{ id: string; status: string; instant?: boolean }>(
      '/api/v1/admin/marketing/transfer',
      {
        method: 'POST',
        body: { direction, amount: n, reason: reason.trim() },
        idempotencyKey: `mkt:${direction}:${n}:${Date.now()}`,
      },
    );
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '移動に失敗しました。');
      return;
    }
    const body = result.body as { status: string; instant?: boolean };
    setMessage(
      body.instant
        ? `移動しました(即時・監査記録済み)。`
        : `申請しました — ${singleApprovalLimit} USDT超のため別の管理者の承認が必要です。`,
    );
    setAmount('');
    setReason('');
    router.refresh();
  };

  return (
    <div className={s.panelBox}>
      <div className={s.formRow}>
        <label className={s.formField}>
          <span>方向</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'FUND' | 'RETURN')} disabled={busy}>
            <option value="FUND">準備金 → 広告費</option>
            <option value="RETURN">広告費 → 準備金(戻し)</option>
          </select>
        </label>
        <label className={s.formField}>
          <span>金額(USDT)</span>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`例: 500(${singleApprovalLimit}以下は即時)`}
            disabled={busy}
          />
        </label>
        <label className={`${s.formField} ${s.formFieldWide}`}>
          <span>理由(監査ログに残ります)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例: 7月末 週次ジャックポット原資"
            disabled={busy}
            maxLength={500}
          />
        </label>
        <button type="button" disabled={busy || !amount || !reason.trim()} onClick={() => void submit()}>
          {busy ? '処理中…' : '移動する'}
        </button>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {message ? <p className="ok">{message}</p> : null}
    </div>
  );
}

export function MarketingApproveButton({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approve = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await apiFetch(`/api/v1/admin/marketing/transfers/${transferId}/approve`, {
      method: 'POST',
      body: {},
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '承認に失敗しました。');
      return;
    }
    router.refresh();
  };
  return (
    <span>
      <button type="button" className="secondary" disabled={busy} onClick={() => void approve()}>
        {busy ? '承認中…' : '承認する'}
      </button>
      {error ? <span className="error" style={{ marginLeft: 8, fontSize: '0.75rem' }}>{error}</span> : null}
    </span>
  );
}
