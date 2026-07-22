'use client';

import { createContext, useContext } from 'react';

/* ============================================================================
 * 表示言語をクライアント部品へ配る(2026-07-22)。
 *
 * 馬名のカタカナ表示(lib/horse-name.ts)は「日本語UIのときだけ」効かせる。
 * ところが馬名を出すクライアント部品(厩舎の一覧・マーケット・ショー・台帳…)は
 * 辞書 t しか受け取っておらず lang を持っていない。全部に prop を通すと配線が
 * 増えるだけなので、ルートで1回配る。
 *
 * 値はサーバー(RootLayout の getLang())が決めるので、SSR と CSR で必ず一致する
 * (document.documentElement.lang を読む方式はハイドレーション不一致を招く)。
 * ========================================================================== */

const LangContext = createContext<string>('ja');

export function LangProvider({ lang, children }: { lang: string; children: React.ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** 表示言語('ja' | 'en' | 'zh' | 'ko' | 'ms')。 */
export function useLang(): string {
  return useContext(LangContext);
}
