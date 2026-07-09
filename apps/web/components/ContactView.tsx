'use client';

import { useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/contact.module.css';

/* /contact — サイト内お問い合わせフォーム。
 * 送信内容はサポートの受付キューに入り、返信は登録メールアドレスへ届く。 */

export function ContactView() {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const result = await apiFetch('/api/v1/contact', {
      method: 'POST',
      body: { subject: subject.trim(), body: body.trim() },
    });
    setBusy(false);
    if (result.status !== 200) {
      setError(errorMessage(result.body) ?? '送信に失敗しました。時間をおいてお試しください。');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className={s.wrap}>
        <div className={s.h1}>お問い合わせ</div>
        <div className={s.doneCard}>
          <div className={s.doneMark}>✓</div>
          <div className={s.doneTitle}>送信しました</div>
          <p className={s.doneText}>
            お問い合わせありがとうございます。サポートチームが確認のうえ、
            <b>ご登録のメールアドレス</b>へ返信いたします。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.h1}>お問い合わせ</div>
      <p className={s.lead}>
        ゲームのルール・アカウント・入出金など、なんでもお気軽にどうぞ。
        サポートチームが確認し、ご登録のメールアドレスへ返信します。
      </p>

      <div className={s.form}>
        <label className={s.label} htmlFor="contact-subject">件名</label>
        <input
          id="contact-subject"
          className={s.input}
          value={subject}
          maxLength={200}
          placeholder="例: BURNについて教えてください"
          onChange={(e) => setSubject(e.target.value)}
        />
        <label className={s.label} htmlFor="contact-body">お問い合わせ内容</label>
        <textarea
          id="contact-body"
          className={s.textarea}
          rows={9}
          value={body}
          maxLength={10000}
          placeholder="できるだけ具体的にお書きいただくと、正確なご案内ができます"
          onChange={(e) => setBody(e.target.value)}
        />
        {error ? <p className={s.error}>{error}</p> : null}
        <button
          type="button"
          className={s.submit}
          disabled={busy || subject.trim() === '' || body.trim() === ''}
          onClick={() => void submit()}
        >
          {busy ? '送信中…' : '送信する'}
        </button>
      </div>

      <p className={s.mailNote}>
        メールでのお問い合わせも受け付けています:{' '}
        <a href="mailto:support@sevendaysderby.com" className={s.mailLink}>support@sevendaysderby.com</a>
      </p>
    </div>
  );
}
