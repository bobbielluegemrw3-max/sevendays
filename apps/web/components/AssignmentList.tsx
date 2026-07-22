'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppSelect } from '@/components/AppSelect';
import { localDate } from '@/lib/format-time';
import s from '../app/purchase.module.css';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/* ============================================================================
 * AssignmentList — 割当履歴を馬ID検索・種別(Day0/P2P)絞り込み・ページングで表示。
 * 所有が増えると件数が伸びるためクライアントで完結。
 * ========================================================================== */

export interface Assignment {
  id: string; horse_id: string; horse_name?: string; assigned_price: string; status: string;
  was_day0_mint: boolean; is_buyer?: boolean; created_at: string;
}

const PAGE_SIZE = 12;

const MINT_FEE = 2;
function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
}
/** 実際に動いたお金: 買い(新規発行=+手数料2 / P2P=そのまま)/ 売り(=98%受取)。 */
function realAmount(a: Assignment): string {
  const p = Number(a.assigned_price);
  if (a.is_buyer === false) return money(String(p * 0.98)); // 売り手
  return money(String(a.was_day0_mint ? p + MINT_FEE : p)); // 買い手
}

export function AssignmentList({ assignments }: { assignments: Assignment[] }) {
  const lang = useLang();
  const [q, setQ] = useState('');
  const [filt, setFilt] = useState('ALL'); // ALL | DAY0 | P2P
  const [page, setPage] = useState(0);

  const total = assignments.length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assignments.filter((a) => {
      if (needle && !`${a.horse_name ?? ''} ${horseDisplayName(a.horse_name ?? '', lang)} ${a.horse_id}`.toLowerCase().includes(needle)) return false;
      if (filt === 'DAY0') return a.was_day0_mint;
      if (filt === 'P2P') return !a.was_day0_mint;
      return true;
    });
  }, [assignments, q, filt]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  if (total === 0) {
    return <div className={s.empty}>入手・売却した馬はまだありません。次のバッチで馬が割り当てられるとここに表示されます。</div>;
  }

  return (
    <div>
      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="馬の名前で検索…" aria-label="馬の名前で検索" />
        <AppSelect
          className={s.select}
          value={filt}
          onChange={(v) => { setFilt(v); reset(); }}
          ariaLabel="種別で絞り込み"
          options={[
            { value: 'ALL', label: 'すべて' },
            { value: 'DAY0', label: '新規発行で入手' },
            { value: 'P2P', label: 'マーケット売買' },
          ]}
        />
        <span className={s.count}>{shown === total ? `全${total}件` : `${total}件中 ${shown}件`}</span>
      </div>

      {slice.length > 0 ? (
        <div className={s.aList}>
          {slice.map((a) => {
            const sell = a.is_buyer === false;
            const label = sell ? '売却' : a.was_day0_mint ? '新規発行で入手' : 'マーケットで購入';
            return (
              <Link key={a.id} href={`/horses/${a.horse_id}`} className={s.aRow}>
                <span className={s.aId}>{a.horse_name ? horseDisplayName(a.horse_name, lang) : a.horse_id}</span>
                <span className={`${s.badge} ${sell ? s.kP2P : a.was_day0_mint ? s.kDay0 : s.kP2P}`}>{label}</span>
                <span className={s.aPrice}>{sell ? '+' : '−'}{realAmount(a)}<small>USDT</small></span>
                <span className={s.aDate}>{localDate(a.created_at)}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>条件に一致する割当がありません。</div>
      )}

      {pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 前へ</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>次へ →</button>
        </div>
      ) : null}
    </div>
  );
}
