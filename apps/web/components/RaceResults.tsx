'use client';

import { useMemo, useState } from 'react';
import { AppSelect } from '@/components/AppSelect';
import s from '../app/races.module.css';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/* ============================================================================
 * RaceResults — レース結果(全出走馬)を検索・絞り込み・ページングで捌く
 * クライアントコンポーネント。1レース＝数千頭になるため必須。
 * ========================================================================== */

export interface RaceResult {
  horse_id: string; final_score: string; final_rank: number; is_burned: boolean;
  /** 馬名(2026-07-22: UUIDでは自分の馬を探せなかった)。古いキャッシュ応答には無い。 */
  horse_name?: string | null;
}

const PAGE_SIZES = [50, 100, 200];

export function RaceResults({ results }: { results: RaceResult[] }) {
  const lang = useLang();
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
      if (needle) {
        const name = `${r.horse_name ?? ''} ${horseDisplayName(r.horse_name ?? '', lang)}`.toLowerCase();
        // 馬名で探せることが主目的。UUIDでの検索も従来どおり残す(台帳との突合用)
        if (!name.includes(needle) && !r.horse_id.toLowerCase().includes(needle)) return false;
      }
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
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="馬名で検索…" aria-label="馬名で検索" />
        <AppSelect
          className={s.select}
          value={filt}
          onChange={(v) => { setFilt(v); reset(); }}
          ariaLabel="絞り込み"
          options={[
            { value: 'ALL', label: 'すべて' },
            { value: 'SURVIVED', label: '生存のみ' },
            { value: 'BURNED', label: 'Burnのみ' },
          ]}
        />
        <span className={s.count}>{shown === total ? `全${total.toLocaleString('en-US')}件` : `${total.toLocaleString('en-US')}件中 ${shown.toLocaleString('en-US')}件`}</span>
      </div>

      {slice.length > 0 ? (
        <div className={s.results}>
          {slice.map((r) => (
            <div key={r.horse_id} className={`${s.rRow} ${r.is_burned ? s.rBurned : ''}`}>
              <span className={`${s.rRank} ${r.final_rank <= 3 && !r.is_burned ? s.rRankTop : ''}`}>#{r.final_rank.toLocaleString('en-US')}</span>
              <span className={s.rId} title={r.horse_id}>{r.horse_name ? horseDisplayName(r.horse_name, lang) : r.horse_id}</span>
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
          <AppSelect
            className={s.selectSm}
            value={String(pageSize)}
            onChange={(v) => { setPageSize(Number(v)); reset(); }}
            ariaLabel="表示件数"
            options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n}件/頁` }))}
          />
        </div>
      ) : null}
    </div>
  );
}
