'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, errorMessage } from '@/lib/client-api';
import type { AppDict } from '@/lib/i18n-shared';
import s from '../app/contact.module.css';

/* /contact — サポート窓口(2026-07-12 リデザイン)。
 * ①よくある質問(使い方ページの該当節へ) ②カテゴリチップ(件名にプレフィックス)
 * ③フォーム+返信のご案内(PC2カラム)。送信内容はサポートの受付キューに入り、
 * 返信は登録メールアドレスへ届く。 */

export function ContactView({ t }: { t: AppDict['contact'] }) {
  const FAQS = [
    { q: t.faq_burn, href: '/guide#race' },
    { q: t.faq_buy, href: '/guide#buy' },
    { q: t.faq_deposit, href: '/guide#wallet' },
    { q: t.faq_champion, href: '/guide#champion' },
    { q: t.faq_team, href: '/guide#team' },
  ];
  const CATEGORIES = [t.cat_rules, t.cat_money, t.cat_trade, t.cat_team, t.cat_other];
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
      setError(errorMessage(result.body) ?? t.err_send);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className={s.wrap}>
        <div className={s.h1}>{t.title}</div>
        <div className={s.doneCard}>
          <div className={s.doneMark}>✓</div>
          <div className={s.doneTitle}>{t.done_title}</div>
          <p className={s.doneText}>
            {t.done_a}
            <b>{t.done_bold}</b>{t.done_b}
          </p>
          <div className={s.doneLinks}>
            <Link href="/guide" className={s.doneLink}>{t.done_guide}</Link>
            <Link href="/dashboard" className={s.doneLink}>{t.done_dashboard}</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.h1}>{t.title}</div>
      <p className={s.lead}>
        {t.lead}
      </p>

      {/* よくある質問 — 問い合わせ前の自己解決導線 */}
      <div className={s.faq}>
        <span className={s.faqLabel}>{t.faq_label}</span>
        <div className={s.faqChips}>
          {FAQS.map((f) => (
            <Link key={f.q} href={f.href} className={s.faqChip}>{f.q}</Link>
          ))}
        </div>
      </div>

      <div className={s.cols}>
        <div className={s.form}>
          <div className={s.label}>{t.cat_label}</div>
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

          <label className={s.label} htmlFor="contact-subject">{t.subject_label}</label>
          <input
            id="contact-subject"
            className={s.input}
            value={subject}
            maxLength={200}
            placeholder={t.subject_ph}
            onChange={(e) => setSubject(e.target.value)}
          />
          <label className={s.label} htmlFor="contact-body">{t.body_label}</label>
          <textarea
            id="contact-body"
            className={s.textarea}
            rows={9}
            value={body}
            maxLength={10000}
            placeholder={t.body_ph}
            onChange={(e) => setBody(e.target.value)}
          />
          {error ? <p className={s.error}>{error}</p> : null}
          <button
            type="button"
            className={s.submit}
            disabled={busy || subject.trim() === '' || body.trim() === ''}
            onClick={() => void submit()}
          >
            {busy ? t.sending : t.send}
          </button>
        </div>

        <aside className={s.aside}>
          <div className={s.asideCard}>
            <div className={s.asideTitle}>{t.aside_reply_title}</div>
            <ul className={s.asideList}>
              <li><b>{t.li1_bold}</b>{t.li1_rest}</li>
              <li>{t.aside_li2}</li>
              <li>{t.aside_li3}</li>
            </ul>
          </div>
          <div className={s.asideCard}>
            <div className={s.asideTitle}>{t.aside_mail_title}</div>
            <a href="mailto:support@sevendaysderby.com" className={s.mailLink}>support@sevendaysderby.com</a>
          </div>
        </aside>
      </div>
    </div>
  );
}
