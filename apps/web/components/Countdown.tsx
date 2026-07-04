'use client';

import { useEffect, useState } from 'react';
import { formatCountdown, msUntilNextRace } from '@/lib/race-time';

/** Live ticking countdown to the next 20:00 MYT race settlement. */
export function Countdown() {
  const [ms, setMs] = useState<number | null>(null);

  useEffect(() => {
    const update = () => setMs(msUntilNextRace());
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  // Render nothing server-side / first paint to avoid a hydration mismatch
  // (the value is time-dependent).
  return <span className="countdown">{ms === null ? '—' : formatCountdown(ms)}</span>;
}
