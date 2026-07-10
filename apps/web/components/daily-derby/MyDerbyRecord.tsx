'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import { NightResultsList, nightResultsCount } from '@/components/daily-derby/NightResultsList';
import type { DerbyNightResults } from '@/lib/daily-derby';
import s from '../../app/races.module.css';

/**
 * あなたのレース記録(オーナー指示 2026-07-10)。
 * 審判演出の記録版 — 日付を遡って、その夜の自分の
 * BURN(使用アイテム+ドロップ)/生存(DAY進行)/P2P売却・購入/新規発行を見る。
 * 行の見た目はショー最後のサマリー(NightResultsList)と同一。
 * データは /api/v1/daily-derby/my-results/:date(実データ)。
 */

type MyResults = DerbyNightResults & { date: string | null; dates: string[] };

function fmtJa(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
}

export function MyDerbyRecord() {
  const [data, setData] = useState<MyResults | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (date: string) => {
    setLoading(true);
    const r = await apiFetch<MyResults>(`/api/v1/daily-derby/my-results/${date}`);
    if (r.status === 200) setData(r.body as MyResults);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load('latest');
  }, [load]);

  if (!data) {
    return (
      <section>
        <div className={s.secLabel}>あなたのレース記録 · MY RECORD</div>
        <div className={s.empty}>{loading ? '読み込み中…' : 'レース記録を取得できませんでした。'}</div>
      </section>
    );
  }

  const idx = data.date ? data.dates.indexOf(data.date) : -1;
  const newer = idx > 0 ? data.dates[idx - 1] : null;
  const older = idx >= 0 && idx < data.dates.length - 1 ? data.dates[idx + 1] : null;

  return (
    <section>
      <div className={s.secLabel}>あなたのレース記録 · MY RECORD</div>
      <div className={s.recNav}>
        <button type="button" className={s.recNavBtn} disabled={!older || loading} onClick={() => older && void load(older)}>
          ← 前日
        </button>
        <select
          className={s.recSelect}
          value={data.date ?? ''}
          disabled={loading || data.dates.length === 0}
          onChange={(e) => void load(e.target.value)}
        >
          {data.dates.map((d) => (
            <option key={d} value={d}>{fmtJa(d)}</option>
          ))}
        </select>
        <button type="button" className={s.recNavBtn} disabled={!newer || loading} onClick={() => newer && void load(newer)}>
          翌日 →
        </button>
      </div>

      {data.date === null ? (
        <div className={s.empty}>確定したレースはまだありません。</div>
      ) : nightResultsCount(data) === 0 ? (
        <div className={s.empty}>{fmtJa(data.date)} — この日のあなたの出走・売買はありませんでした。</div>
      ) : (
        <NightResultsList results={data} />
      )}
    </section>
  );
}
