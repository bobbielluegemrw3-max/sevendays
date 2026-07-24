'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import s from '../app/races.module.css';

/* ============================================================================
 * ① 次のレース（RACE_PAGE_BELOW_MONITOR_SPEC 道A・下部トップ）。
 * 「次のレースはいつ？今夜うちの何頭が走る？」に1枚で答える橋渡し。
 * カウントダウンは時刻から決定論（DerbyCountdown と同ロジック・API不要）。
 * 今夜の自分の馬数だけ daily-derby/status から取得。予報は V3 起動後に追加（§5）。
 * ========================================================================== */

/** 次の 8:00/20:00 MYT(=0:00/12:00 UTC) までの秒。V2は2回/日・V1は20:00のみ。 */
function nextRaceSeconds(engineV2: boolean): number {
  const now = Date.now();
  const d = new Date();
  const hours = engineV2 ? [0, 12] : [12];
  const candidates: number[] = [];
  for (const dayOffset of [0, 1]) {
    for (const h of hours) {
      candidates.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + dayOffset, h, 0, 0, 0));
    }
  }
  const next = Math.min(...candidates.filter((t) => t > now));
  return (next - now) / 1000;
}

export function NextRaceCard() {
  const [engineV2, setEngineV2] = useState(true);
  const [myCount, setMyCount] = useState<number | null>(null);
  const [secs, setSecs] = useState<number | null>(null);

  useEffect(() => {
    void apiFetch<{ engine_v2?: boolean; my_horses?: unknown[] }>('/api/v1/daily-derby/status').then((r) => {
      if (r.status === 200) {
        const b = r.body as { engine_v2?: boolean; my_horses?: unknown[] };
        setEngineV2(b.engine_v2 === true);
        setMyCount(Array.isArray(b.my_horses) ? b.my_horses.length : 0);
      } else {
        setMyCount(0);
      }
    });
  }, []);

  useEffect(() => {
    const tick = () => setSecs(nextRaceSeconds(engineV2));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [engineV2]);

  const total = Math.max(0, Math.floor(secs ?? 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  const label = secs === null ? '--:--:--'
    : `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;

  return (
    <div className={s.nextRace}>
      <div className={s.nrTop}>
        <span className={s.nrK}>次のレースまで</span>
        <span className={s.nrTimer}>{label}</span>
      </div>
      <div className={s.nrBody}>
        <span className={s.nrCount}>
          {myCount === null ? '今夜の出走を確認中…'
            : myCount > 0 ? <>今夜 うちの <b>{myCount}</b> 頭が出走</>
            : '今夜 出走する馬はいません'}
        </span>
        <Link href="/horses" className={s.nrCta}>厩舎で準備する →</Link>
      </div>
    </div>
  );
}
