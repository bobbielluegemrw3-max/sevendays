'use client';

import { useEffect, useState } from 'react';
import { msUntilNextRace } from '@/lib/race-time';

/** HH:MM:SS live countdown to the next 20:00 MYT race settlement. */
export function Countdown({ className }: { className?: string | undefined }) {
  const [text, setText] = useState('--:--:--');

  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const update = () => {
      const total = Math.max(0, Math.floor(msUntilNextRace() / 1000));
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      setText(`${pad(h)}:${pad(m)}:${pad(s)}`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return <div className={className}>{text}</div>;
}
