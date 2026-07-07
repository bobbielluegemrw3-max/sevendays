'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SHOW_TOTAL } from '@/lib/daily-derby';

/**
 * 全ページ共通のダービーカウントダウン(ADR-008, R3)。
 * 20:00 MYT = 12:00 UTC はローカル時計から決定論で計算できるのでAPI不要。
 * ショー中(開始〜約100秒+余韻)は LIVE バナーに変わり /races へ誘導する。
 */

const LIVE_WINDOW_SECONDS = SHOW_TOTAL + 200; // 演出+個人結果の余韻

function secondsToNext(): number {
  const now = Date.now();
  const d = new Date();
  const candidate = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0, 0);
  const next = candidate <= now ? candidate + 24 * 3600 * 1000 : candidate;
  return (next - now) / 1000;
}

export function DerbyCountdown() {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    setSeconds(secondsToNext());
    const id = setInterval(() => setSeconds(secondsToNext()), 1000);
    return () => clearInterval(id);
  }, []);

  if (seconds === null) return null; // SSRとの不一致を避ける(マウント後に表示)

  // 直近の20:00からの経過(secondsToNextが翌日を指している間のショー窓判定)
  const sinceLast = 24 * 3600 - seconds;
  const live = sinceLast >= 0 && sinceLast < LIVE_WINDOW_SECONDS;

  if (live) {
    return (
      <Link href="/races" className="derby-cd derby-cd-live" aria-label="THE DAILY DERBY IS LIVE">
        <span className="derby-cd-dot" aria-hidden="true" />
        DERBY IS LIVE
      </Link>
    );
  }

  const total = Math.max(0, Math.floor(seconds));
  const pad = (n: number) => String(n).padStart(2, '0');
  const label = `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return (
    <Link href="/races" className="derby-cd" aria-label={`Next Daily Derby ${label}`}>
      <span className="derby-cd-k">NEXT DERBY</span>
      <span className="derby-cd-v">{label}</span>
    </Link>
  );
}
