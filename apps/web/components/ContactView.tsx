'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, errorMessage } from '@/lib/client-api';
import s from '../app/contact.module.css';

/* /contact — サポート窓口(2026-07-12 リデザイン)。
 * ①よくある質問(使い方ページの該当節へ) ②カテゴリチップ(件名にプレフィックス)
 * ③フォーム+返信のご案内(PC2カラム)。送信内容はサポートの受付キューに入り、
 * 返信は登録メールアドレスへ届く。 */

const FAQS = [
  { q: 'BURNとは?', href: '/guide#race' },
  { q: '購入・売却のしくみ', href: '/guide#buy' },
  { q: '入金が反映されない', href: '/guide#wallet' },
  { q: 'チャンピオン報酬はいつ?', href: '/guide#champion' },
  { q: 'チーム(サポートボーナス)', href: '/guide#team' },
];

const CATEGORIES = ['ゲームのルール', '入出金', '購入・売却', 'チーム', 'その他'] as const;

export function ContactView() {
  const [category, setCategory] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    // カテゴリは件名プレフィックスで運ぶ(API変更なしでCS側の分類が楽になる)
    const fullSubject = `${category ? `[${category}] ` : ''}${subject.trim()}`;
    const result = await apiFetch('/api/v1/contact', {
      method: 'POST',
      body: { subject: fullSubject, body: body.trim() },
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
          <div className={s.doneLinks}>
            <Link href="/guide" className={s.doneLink}>使い方を見る →</Link>
            <Link href="/dashboard" className={s.doneLink}>ダッシュボードへ →</Link>
          </div>
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

      {/* よくある質問 — 問い合わせ前の自己解決導線 */}
      <div className={s.faq}>
        <span className={s.faqLabel}>よくある質問</span>
        <div className={s.faqChips}>
          {FAQS.map((f) => (
            <Link key={f.q} href={f.href} className={s.faqChip}>{f.q}</Link>
          ))}
        </div>
      </div>

      <div className={s.cols}>
        <div className={s.form}>
          <div className={s.label}>カテゴリ(任意)</div>
          <div className={s.catChips}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`${s.catChip} ${category === c ? s.catChipOn : ''}`}
                onClick={() => setCategory(category === c ? '' : c)}
                aria-pressed={category === c}
              >
                {c}
              </button>
            ))}
          </div>

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

        <aside className={s.aside}>
          <div className={s.asideCard}>
            <div className={s.asideTitle}>返信について</div>
            <ul className={s.asideList}>
              <li><b>ご登録のメールアドレス</b>宛に返信します(このページでの返信表示はありません)</li>
              <li>内容により確認へお時間をいただく場合があります</li>
              <li>残高・取引の具体的な数字は、サイト内の各ページでご確認いただけます</li>
            </ul>
          </div>
          <div className={s.asideCard}>
            <div className={s.asideTitle}>メールでも受け付けています</div>
            <a href="mailto:support@sevendaysderby.com" className={s.mailLink}>support@sevendaysderby.com</a>
          </div>
        </aside>
      </div>
    </div>
  );
}
