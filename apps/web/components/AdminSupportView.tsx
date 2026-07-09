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

interface SentRow { id: string; email: string; subject: string | null; created_at: string; kind: string }
interface BroadcastRow {
  id: string; subject: string; mode: string; status: string;
  total: number; sent: number; failed: number; created_at: string; created_by_email: string;
}
interface ThreadMessage {
  id: string; direction: string; subject: string | null; body: string;
  status: string; created_at: string;
}

type Tab = 'queue' | 'sent' | 'thread' | 'broadcast';

export function AdminSupportView() {
  const [tab, setTab] = useState<Tab>('queue');
  const [messages, setMessages] = useState<CsMessage[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 送信履歴
  const [sentRows, setSentRows] = useState<SentRow[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastRow[]>([]);
  // 個別のやり取り
  const [threadEmail, setThreadEmail] = useState('');
  const [thread, setThread] = useState<{ email: string; registered: boolean; messages: ThreadMessage[] } | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  // 一斉送信
  const [bcSubject, setBcSubject] = useState('');
  const [bcBody, setBcBody] = useState('');
  const [bcTargets, setBcTargets] = useState<number | null>(null);
  const [bcBusy, setBcBusy] = useState(false);
  const [bcResult, setBcResult] = useState<string | null>(null);

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

  const loadSent = useCallback(async () => {
    const result = await apiFetch<{ sent: SentRow[]; broadcasts: BroadcastRow[] }>(
      '/api/v1/admin/cs/sent', { method: 'GET' },
    );
    if (result.status === 200) {
      const b = result.body as { sent: SentRow[]; broadcasts: BroadcastRow[] };
      setSentRows(b.sent);
      setBroadcasts(b.broadcasts);
    }
  }, []);

  const loadThread = useCallback(async (email: string) => {
    const result = await apiFetch<{ email: string; registered: boolean; messages: ThreadMessage[] }>(
      '/api/v1/admin/cs/thread', { method: 'POST', body: { email } },
    );
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? 'スレッド取得に失敗しました');
      return;
    }
    setThread(result.body as { email: string; registered: boolean; messages: ThreadMessage[] });
  }, []);

  useEffect(() => {
    void load();
    void loadSent();
    void (async () => {
      const r = await apiFetch<{ count: number }>('/api/v1/admin/cs/broadcast-targets', { method: 'GET' });
      if (r.status === 200) setBcTargets((r.body as { count: number }).count);
    })();
  }, [load, loadSent]);

  async function sendCompose() {
    if (!thread) return;
    setError(null);
    const result = await apiFetch('/api/v1/admin/cs/compose', {
      method: 'POST',
      body: { email: thread.email, subject: composeSubject, body: composeBody },
    });
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '送信に失敗しました');
      return;
    }
    setComposeSubject('');
    setComposeBody('');
    await loadThread(thread.email);
    await loadSent();
  }

  async function sendBroadcast(mode: 'TEST' | 'ALL') {
    if (mode === 'ALL' && !window.confirm(`全アクティブユーザー(${bcTargets ?? '?'}名)へ一斉送信します。よろしいですか?`)) return;
    setBcBusy(true);
    setBcResult(null);
    setError(null);
    const result = await apiFetch<{ sent: number; failed: number; total: number }>(
      '/api/v1/admin/cs/broadcast',
      { method: 'POST', body: { subject: bcSubject, body: bcBody, mode }, idempotencyKey: crypto.randomUUID() },
    );
    setBcBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '一斉送信に失敗しました');
      return;
    }
    const r = result.body as { sent: number; failed: number; total: number };
    setBcResult(`${mode === 'TEST' ? 'テスト送信' : '一斉送信'}完了: ${r.sent}/${r.total} 件送信${r.failed > 0 ? ` / 失敗 ${r.failed}` : ''}`);
    await loadSent();
  }

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

      <div className={s.controls}>
        {([
          ['queue', `受信キュー(${pending.length})`],
          ['sent', '送信履歴'],
          ['thread', '個別のやり取り'],
          ['broadcast', '一斉送信'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={s.pagerBtn}
            style={tab === key ? { background: 'rgba(255,45,196,0.15)', borderColor: 'rgba(255,45,196,0.5)', color: 'var(--magenta-soft)' } : {}}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? <p className={s.error}>{error}</p> : null}

      {tab === 'queue' && (<>
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
      </>)}

      {tab === 'sent' && (
        <>
          <div>
            <div className={s.secLabel}>BROADCASTS · 一斉送信ジョブ({broadcasts.length})</div>
            {broadcasts.length > 0 ? (
              <div className={s.list}>
                {broadcasts.map((b) => (
                  <div key={b.id} className={s.row}>
                    <span className={s.cDate}>{b.created_at.slice(0, 16).replace('T', ' ')}</span>
                    <span className={s.cMain}>{b.subject}</span>
                    <span className={`${s.pill} ${b.mode === 'ALL' ? s.pillWarn : s.pillMuted}`}>{b.mode === 'ALL' ? '全員' : 'テスト'}</span>
                    <span className={`${s.pill} ${b.status === 'DONE' ? s.pillGood : b.status === 'FAILED' ? s.pillBad : s.pillCyan}`}>{b.status}</span>
                    <span className={s.steps}>送信 <b>{b.sent}</b>/{b.total}{b.failed > 0 ? ` · 失敗 ${b.failed}` : ''}</span>
                  </div>
                ))}
              </div>
            ) : <div className={s.empty}>一斉送信はまだありません。</div>}
          </div>
          <div>
            <div className={s.secLabel}>SENT · 送信メール(直近100)</div>
            {sentRows.length > 0 ? (
              <div className={s.list}>
                {sentRows.map((m) => (
                  <div key={m.id} className={s.row}>
                    <span className={s.cDate}>{m.created_at.slice(0, 16).replace('T', ' ')}</span>
                    <span className={s.cMain}>{m.email}</span>
                    <span className={s.cText}>{m.subject ?? '(件名なし)'}</span>
                    <span className={`${s.pill} ${m.kind === 'REPLY' ? s.pillGood : m.kind === 'BROADCAST' ? s.pillWarn : s.pillCyan}`}>
                      {m.kind === 'REPLY' ? '返信' : m.kind === 'BROADCAST' ? '一斉' : '個別'}
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className={s.empty}>送信メールはまだありません。</div>}
          </div>
        </>
      )}

      {tab === 'thread' && (
        <>
          <div className={s.controls}>
            <input
              className={s.search}
              value={threadEmail}
              placeholder="ユーザーのメールアドレス(完全一致)"
              onChange={(e) => setThreadEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && threadEmail.includes('@')) void loadThread(threadEmail.trim()); }}
            />
            <button
              type="button"
              className={s.pagerBtn}
              disabled={!threadEmail.includes('@')}
              onClick={() => void loadThread(threadEmail.trim())}
            >
              やり取りを表示
            </button>
          </div>
          {thread && (
            <>
              <div className={s.cBadges}>
                <span className={s.cMain}>{thread.email}</span>
                {thread.registered
                  ? <span className={`${s.pill} ${s.pillGood}`}>登録オーナー</span>
                  : <span className={`${s.pill} ${s.pillMuted}`}>未登録</span>}
              </div>
              {thread.messages.length > 0 ? (
                <div className={s.list}>
                  {thread.messages.map((m) => (
                    <div key={m.id} className={`${s.row} ${m.direction === 'RECEIVED' ? '' : s.rowWarn}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span className={`${s.pill} ${m.direction === 'RECEIVED' ? s.pillCyan : s.pillGood}`}>
                          {m.direction === 'RECEIVED' ? '← 受信' : '→ 送信'}
                        </span>
                        <span className={s.cText}><b>{m.subject ?? '(件名なし)'}</b></span>
                        <span className={`${s.cDate} ${s.cSpace}`}>{m.created_at.slice(0, 16).replace('T', ' ')}</span>
                      </div>
                      <div className={s.csBody}>{m.body}</div>
                    </div>
                  ))}
                </div>
              ) : <div className={s.empty}>このアドレスとのやり取りはまだありません。</div>}
              <div className={s.secLabel}>新規メールを送る</div>
              <div className={s.controls}>
                <input
                  className={s.search}
                  value={composeSubject}
                  placeholder="件名"
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </div>
              <textarea
                className={s.csDraft}
                rows={7}
                value={composeBody}
                placeholder="本文(署名まで手動で書いてください)"
                onChange={(e) => setComposeBody(e.target.value)}
              />
              <div className={s.controls} style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className={s.pagerBtn}
                  disabled={composeSubject.trim() === '' || composeBody.trim() === ''}
                  onClick={() => void sendCompose()}
                >
                  このユーザーへ送信
                </button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'broadcast' && (
        <>
          <div className={s.note}>
            一斉送信は<b>全アクティブオーナー({bcTargets ?? '…'}名)</b>に届きます。
            必ず先に「テスト送信(自分宛て)」で確認してください。CS_TEST_MODE中は許可アドレス以外へ送信されません。
          </div>
          <div className={s.controls}>
            <input
              className={s.search}
              value={bcSubject}
              placeholder="件名"
              onChange={(e) => setBcSubject(e.target.value)}
            />
          </div>
          <textarea
            className={s.csDraft}
            rows={12}
            value={bcBody}
            placeholder={'English text first...\n\n----------------------------------------\n\n日本語は区切り線の下に...\n\nSeven Days Derby Support\nSeven Days Derby サポート'}
            onChange={(e) => setBcBody(e.target.value)}
          />
          <div className={s.controls} style={{ marginTop: 8 }}>
            <button
              type="button"
              className={s.pagerBtn}
              disabled={bcBusy || bcSubject.trim() === '' || bcBody.trim() === ''}
              onClick={() => void sendBroadcast('TEST')}
            >
              {bcBusy ? '送信中…' : 'テスト送信(自分宛て)'}
            </button>
            <button
              type="button"
              className={s.pagerBtn}
              style={{ borderColor: 'rgba(230,178,74,0.5)', color: 'var(--warn)', background: 'rgba(230,178,74,0.08)' }}
              disabled={bcBusy || bcSubject.trim() === '' || bcBody.trim() === ''}
              onClick={() => void sendBroadcast('ALL')}
            >
              全ユーザーへ一斉送信
            </button>
          </div>
          {bcResult && <p className={s.cnt}>{bcResult}</p>}
        </>
      )}
    </div>
  );
}
