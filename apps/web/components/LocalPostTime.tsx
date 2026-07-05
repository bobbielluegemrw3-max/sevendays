'use client';

import { useEffect, useState } from 'react';
import { nextRaceInstant } from '@/lib/race-time';

/**
 * Race timing for a global audience. Canonical time is 20:00 MYT (= 12:00 UTC,
 * Decision 047); we additionally show the viewer's own local time, auto-detected
 * from their browser timezone. Before hydration only the MYT anchor renders, so
 * SSR and the first client render match.
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

/** Inline phrase: "20:00 MYT(あなたの地域では 21:00)". */
export function LocalRaceTime() {
  const local = useLocalRaceTime();
  return <>20:00 MYT{local ? `(あなたの地域では ${local})` : ''}</>;
}

/** Countdown-card post line: "毎晩 20:00 MYT(…) · 全馬一斉発走". */
export function LocalPostTime() {
  return (
    <>
      毎晩 <LocalRaceTime /> · 全馬一斉発走
    </>
  );
}
