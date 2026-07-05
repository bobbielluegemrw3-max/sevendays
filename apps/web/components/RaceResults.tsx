'use client';

import { useMemo, useState } from 'react';
import s from '../app/races.module.css';

/* ============================================================================
 * RaceResults — レース結果(全出走馬)を検索・絞り込み・ページングで捌く
 * クライアントコンポーネント。1レース＝数千頭になるため必須。
 * ========================================================================== */

export interface RaceResult {
  horse_id: string; final_score: string; final_rank: number; is_burned: boolean;
}

const PAGE_SIZES = [50, 100, 200];

export function RaceResults({ results }: { results: RaceResult[] }) {
  const [q, setQ] = useState('');
  const [filt, setFilt] = useState('ALL'); // ALL | SURVIVED | BURNED
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);

  const total = results.length;
  const survivedCount = useMemo(() => results.filter((r) => !r.is_burned).length, [results]);
  const burnedCount = total - survivedCount;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const arr = results.filter((r) => {
      if (needle && !r.horse_id.toLowerCase().includes(needle)) return false;
      if (filt === 'SURVIVED') return !r.is_burned;
      if (filt === 'BURNED') return r.is_burned;
      return true;
    });
    return arr.slice().sort((a, b) => a.final_rank - b.final_rank);
  }, [results, q, filt]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const reset = () => setPage(0);

  return (
    <div>
      <div className={s.resHead}>
        <span className={s.secLabel} style={{ margin: 0 }}>結果 · RESULTS</span>
        <span className={s.resCount}>{total.toLocaleString('en-US')}</span>
        <span className={s.resTally}>生存 {survivedCount.toLocaleString('en-US')} · Burn {burnedCount.toLocaleString('en-US')}</span>
      </div>

      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="馬IDで検索…" aria-label="馬IDで検索" />
        <select className={s.select} value={filt} onChange={(e) => { setFilt(e.target.value); reset(); }} aria-label="絞り込み">
          <option value="ALL">すべて</option>
          <option value="SURVIVED">生存のみ</option>
          <option value="BURNED">Burnのみ</option>
        </select>
        <span className={s.count}>{shown === total ? `全${total.toLocaleString('en-US')}件` : `${total.toLocaleString('en-US')}件中 ${shown.toLocaleString('en-US')}件`}</span>
      </div>

      {slice.length > 0 ? (
        <div className={s.results}>
          {slice.map((r) => (
            <div key={r.horse_id} className={`${s.rRow} ${r.is_burned ? s.rBurned : ''}`}>
              <span className={`${s.rRank} ${r.final_rank <= 3 && !r.is_burned ? s.rRankTop : ''}`}>#{r.final_rank.toLocaleString('en-US')}</span>
              <span className={s.rId}>{r.horse_id}</span>
              <span className={s.rScore}>SCORE {Number(r.final_score).toFixed(2)}</span>
              <span className={`${s.rPill} ${r.is_burned ? s.rPillBurned : s.rPillSurvived}`}>{r.is_burned ? 'Burn' : '生存'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={s.noMatch}>条件に一致する結果がありません。</div>
      )}

      {pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 前へ</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>次へ →</button>
          <select className={s.selectSm} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); reset(); }} aria-label="表示件数">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}件/頁</option>)}
          </select>
        </div>
      ) : null}
    </div>
  );
}
