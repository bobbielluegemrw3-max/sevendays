'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SHOW_TOTAL } from '@/lib/daily-derby';

/**
 * 全ページ共通のダービーカウントダウン(ADR-008, R3)。
 * 20:00 MYT = 12:00 UTC はローカル時計から決定論で計算できるのでAPI不要。
 * ショー中(開始〜約100秒+余韻)は LIVE バナーに変わり /races へ誘導する。
 */

// 演出が終わったらすみやかに通常カウントダウンへ戻す(オーナー指摘 2026-07-16 #6:
// 旧値+200秒はショー終了後も数分間LIVEが点きっぱなしに見えた)。+60秒は
// ワーカーの開始ラグ(30秒tick+起動)でショー実体が後ろにずれる分の余裕。
const LIVE_WINDOW_SECONDS = SHOW_TOTAL + 60;

/** V2実装-7c(100点診断): V2は朝8:00/夜20:00 MYTの近い方へ。V1は20:00のみ(不変)。 */
function nextAndPrev(engineV2: boolean): { seconds: number; sinceLast: number } {
  const now = Date.now();
  const d = new Date();
  const hours = engineV2 ? [0, 12] : [12];
  const candidates: number[] = [];
  for (const dayOffset of [-1, 0, 1]) {
    for (const h of hours) {
      candidates.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, h, 0, 0, 0));
    }
  }
  const next = Math.min(...candidates.filter((t) => t > now));
  const prev = Math.max(...candidates.filter((t) => t <= now));
  return { seconds: (next - now) / 1000, sinceLast: (now - prev) / 1000 };
}

export function DerbyCountdown({ engineV2 = false }: { engineV2?: boolean }) {
  const [clock, setClock] = useState<{ seconds: number; sinceLast: number } | null>(null);

  useEffect(() => {
    setClock(nextAndPrev(engineV2));
    const id = setInterval(() => setClock(nextAndPrev(engineV2)), 1000);
    return () => clearInterval(id);
  }, [engineV2]);

  if (clock === null) return null; // SSRとの不一致を避ける(マウント後に表示)

  const { seconds, sinceLast } = clock;
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
