'use client';

import { LANDING_LANGS, LANG_LABEL, type Lang } from '@/lib/landing-i18n';
import s from './landing.module.css';

/* 言語切替(TOPページ・2026-07-15)。選択を cookie(sdd_lang)に保存し再読込。
 * サーバー側(page.tsx)が cookie を読んで Landing に lang を渡す = 初回描画から
 * 選択言語で出る(SEO/初速のためクライアント差し替えにしない)。 */
export function LanguageSwitcher({ current }: { current: Lang }) {
  const set = (lang: Lang) => {
    document.cookie = `sdd_lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };
  return (
    <select
      className={s.langSelect}
      value={current}
      onChange={(e) => set(e.target.value as Lang)}
      aria-label="Language"
    >
      {LANDING_LANGS.map((l) => (
        <option key={l} value={l}>{LANG_LABEL[l]}</option>
      ))}
    </select>
  );
}
