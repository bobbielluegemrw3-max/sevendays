'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/admin.module.css';

/* /admin/support — AIカスタマーサービスの承認キュー。
 * 受信メール + AI下書き(編集可)→ 承認して送信 / 却下。全件承認制。 */

interface CsMessage {
  id: string; email: string; name: string | null; subject: string | null; body: string;
  ai_draft: string | null; ai_confidence: string | null; ai_reason: string | null;
  status: string; created_at: string; handled_at: string | null;
  matched_user_email: string | null;
}

export function AdminSupportView() {
  const [messages, setMessages] = useState<CsMessage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await apiFetch<{ messages: CsMessage[] }>('/api/v1/admin/cs/queue', { method: 'GET' });
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '取得に失敗しました');
      return;
    }
    const list = (result.body as { messages: CsMessage[] }).messages;
    setMessages(list);
    setDrafts((prev) => {
      const next = { ...prev };
      for (const m of list) if (next[m.id] === undefined) next[m.id] = m.ai_draft ?? '';
      return next;
    });
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError(null);
    const body = action === 'approve' ? { body: drafts[id] ?? '' } : undefined;
    const result = await apiFetch(`/api/v1/admin/cs/${id}/${action}`, { method: 'POST', body });
    setBusyId(null);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '操作に失敗しました');
      return;
    }
    await load();
  }

  const pending = messages.filter((m) => m.status === 'PENDING');
  const handled = messages.filter((m) => m.status !== 'PENDING');

  return (
    <div className={s.wrap}>
      <div className={s.h1}>サポート(AIメール対応)</div>
      <div className={s.note}>
        support@ 宛の受信メールにAI(DeepSeek)が下書きを付けます。
        <b>全件、あなたの承認がないと送信されません</b>。下書きは編集してから送信できます。
      </div>

      {error ? <p className={s.error}>{error}</p> : null}

      <div>
        <div className={s.secLabel}>PENDING · 承認待ち({pending.length})</div>
        {pending.length > 0 ? (
          <div className={s.list}>
            {pending.map((msg) => (
              <div key={msg.id} className={`${s.row} ${s.rowWarn}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={s.cMain}>{msg.name ? `${msg.name} ` : ''}&lt;{msg.email}&gt;</span>
                  {msg.matched_user_email
                    ? <span className={`${s.pill} ${s.pillGood}`}>登録オーナー</span>
                    : <span className={`${s.pill} ${s.pillMuted}`}>未登録</span>}
                  {msg.ai_confidence && (
                    <span className={`${s.pill} ${Number(msg.ai_confidence) >= 0.75 ? s.pillGood : s.pillWarn}`}>
                      AI自信度 {Math.round(Number(msg.ai_confidence) * 100)}%
                    </span>
                  )}
                  <span className={`${s.cDate} ${s.cSpace}`}>{msg.created_at.slice(0, 19).replace('T', ' ')}</span>
                </div>
                <div className={s.cText} style={{ marginTop: 8 }}>
                  <b>件名:</b> {msg.subject ?? '(なし)'}
                </div>
                <div className={s.csBody}>{msg.body}</div>
                {msg.ai_reason && (
                  <div className={s.note} style={{ marginTop: 8 }}>AIからの申し送り: {msg.ai_reason}</div>
                )}
                <div className={s.secLabel} style={{ marginTop: 10 }}>返信下書き(編集できます)</div>
                <textarea
                  className={s.csDraft}
                  rows={10}
                  value={drafts[msg.id] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [msg.id]: e.target.value }))}
                />
                <div className={s.controls} style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className={s.pagerBtn}
                    disabled={busyId === msg.id || (drafts[msg.id] ?? '').trim() === ''}
                    onClick={() => void act(msg.id, 'approve')}
                  >
                    {busyId === msg.id ? '送信中…' : '承認して送信'}
                  </button>
                  <button
                    type="button"
                    className={s.pagerBtn}
                    style={{ borderColor: 'rgba(255,92,92,0.5)', color: 'var(--bad)', background: 'rgba(255,92,92,0.08)' }}
                    disabled={busyId === msg.id}
                    onClick={() => {
                      if (window.confirm('この問い合わせを返信せずに終了しますか?')) void act(msg.id, 'reject');
                    }}
                  >
                    却下(返信しない)
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.empty}>承認待ちの問い合わせはありません。</div>
        )}
      </div>

      <div>
        <div className={s.secLabel}>HANDLED · 対応履歴(直近)</div>
        {handled.length > 0 ? (
          <div className={s.list}>
            {handled.map((msg) => (
              <div key={msg.id} className={s.row}>
                <span className={s.cDate}>{msg.created_at.slice(0, 16).replace('T', ' ')}</span>
                <span className={s.cMain}>{msg.email}</span>
                <span className={s.cText}>{msg.subject ?? '(件名なし)'}</span>
                <span className={`${s.pill} ${msg.status === 'SENT' ? s.pillGood : msg.status === 'REJECTED' ? s.pillBad : s.pillCyan}`}>
                  {msg.status === 'SENT' ? '返信済み' : msg.status === 'REJECTED' ? '却下' : msg.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.empty}>対応履歴はまだありません。</div>
        )}
      </div>
    </div>
  );
}
