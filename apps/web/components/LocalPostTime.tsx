'use client';

import { useEffect, useState } from 'react';
import { LANDING_COPY, type Lang } from '@/lib/landing-i18n';

/**
 * Race timing for a global audience. Canonical times are 8:00 & 20:00 MYT
 * (= 00:00 / 12:00 UTC, V2 two races a day); we additionally show the viewer's
 * own local times, auto-detected from their browser timezone. Before hydration
 * only the MYT anchor renders, so SSR and the first client render match.
 *
 * The surrounding wording ("in your area", "every day") is localized via the
 * landing dictionary — it lives on the multilingual TOP page, so it must follow
 * the selected language, not stay Japanese (owner note 2026-07-15).
 */
function useLocalRaceTimes(): string | null {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    const fmt = (utcHour: number) => {
      const d = new Date();
      d.setUTCHours(utcHour, 0, 0, 0);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    };
    setLocal(`${fmt(0)} / ${fmt(12)}`);
  }, []);
  return local;
}

/** Inline phrase: "8:00 & 20:00 MYT(あなたの地域では 9:00 / 21:00)" — parenthetical follows `lang`. */
export function LocalRaceTime({ lang = 'ja' }: { lang?: Lang }) {
  const local = useLocalRaceTimes();
  const paren = local ? LANDING_COPY[lang].local_area_tpl.replace('{t}', local) : '';
  return <>8:00 & 20:00 MYT{paren}</>;
}

/** Countdown-card post line: "毎日 8:00 & 20:00 MYT(…) · 全馬一斉発走" — all localized. */
export function LocalPostTime({ lang = 'ja' }: { lang?: Lang }) {
  const t = LANDING_COPY[lang];
  return (
    <>
      {t.post_pre}
      <LocalRaceTime lang={lang} />
      {t.post_post}
    </>
  );
}
