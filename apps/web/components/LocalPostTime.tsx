'use client';

import { useEffect, useState } from 'react';
import { nextRaceInstant } from '@/lib/race-time';
import { LANDING_COPY, type Lang } from '@/lib/landing-i18n';

/**
 * Race timing for a global audience. Canonical time is 20:00 MYT (= 12:00 UTC,
 * Decision 047); we additionally show the viewer's own local time, auto-detected
 * from their browser timezone. Before hydration only the MYT anchor renders, so
 * SSR and the first client render match.
 *
 * The surrounding wording ("in your area", "every night") is localized via the
 * landing dictionary — it lives on the multilingual TOP page, so it must follow
 * the selected language, not stay Japanese (owner note 2026-07-15).
 */
function useLocalRaceTime(): string | null {
  const [local, setLocal] = useState<string | null>(null);
  useEffect(() => {
    setLocal(
      nextRaceInstant().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
    );
  }, []);
  return local;
}

/** Inline phrase: "20:00 MYT(あなたの地域では 21:00)" — parenthetical follows `lang`. */
export function LocalRaceTime({ lang = 'ja' }: { lang?: Lang }) {
  const local = useLocalRaceTime();
  const paren = local ? LANDING_COPY[lang].local_area_tpl.replace('{t}', local) : '';
  return <>20:00 MYT{paren}</>;
}

/** Countdown-card post line: "毎晩 20:00 MYT(…) · 全馬一斉発走" — all localized. */
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
