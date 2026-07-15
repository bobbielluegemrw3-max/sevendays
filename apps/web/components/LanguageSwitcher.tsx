'use client';

import { useEffect, useRef, useState } from 'react';
import { LANDING_LANGS, LANG_LABEL, type Lang } from '@/lib/landing-i18n';
import s from './landing.module.css';

/* 言語切替(TOPページ・2026-07-15)。ネイティブ<select>はモバイルで安っぽく見えるため、
 * 地球アイコン+チェックマーク付きの自前ドロップダウンにする。選択を cookie(sdd_lang)に保存し
 * 再読込。サーバー側(page.tsx)が cookie を読んで Landing に lang を渡す = 初回描画から
 * 選択言語で出る(SEO/初速のためクライアント差し替えにしない)。
 * A11y: aria-haspopup/aria-expanded、Escで閉じる、外側クリックで閉じる、フォーカストラップは
 * 単純パネルなので不要(選択で即再読込)。 */
export function LanguageSwitcher({ current }: { current: Lang }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (lang: Lang) => {
    if (lang === current) {
      setOpen(false);
      return;
    }
    document.cookie = `sdd_lang=${lang}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };

  return (
    <div className={s.langRoot} ref={rootRef}>
      <button
        type="button"
        className={s.langBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Language"
      >
        <GlobeIcon />
        <span className={s.langBtnText}>{LANG_LABEL[current]}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <ul className={s.langMenu} role="listbox" aria-label="Language">
          {LANDING_LANGS.map((l) => (
            <li key={l} role="option" aria-selected={l === current}>
              <button
                type="button"
                className={`${s.langItem} ${l === current ? s.langItemActive : ''}`}
                onClick={() => choose(l)}
              >
                <span className={s.langCheck} aria-hidden="true">
                  {l === current ? <CheckIcon /> : null}
                </span>
                <span>{LANG_LABEL[l]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21C9.5 18.5 8.2 15.3 8.2 12S9.5 5.5 12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={open ? s.langChevOpen : s.langChev}
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
