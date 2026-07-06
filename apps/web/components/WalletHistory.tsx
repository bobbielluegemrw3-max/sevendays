'use client';

import { useMemo, useState } from 'react';
import s from '../app/wallet.module.css';

/* ============================================================================
 * WalletHistory — 取引履歴を検索・絞り込み・ページングで表示するクライアント。
 * 入出金の別は direction から判定(不明な値は中立表示にして誤表示を避ける)。
 * ========================================================================== */

export interface HistoryEntry {
  type: string; direction: string; amount: string; account: string; created_at: string;
}

const PAGE_SIZE = 12;

const TYPE_LABEL: Record<string, string> = {
  DEPOSIT: '入金', WITHDRAWAL: '出金', PURCHASE_LOCK: '購入ロック', REFUND: 'ロック返金',
  BUYBACK_PAYOUT: 'チャンピオン報酬受取', RACE_SETTLEMENT: 'レース精算', ASSIGNMENT: '割当',
};
const CREDIT = new Set(['CREDIT', 'IN', 'INBOUND', 'DEPOSIT']);
const DEBIT = new Set(['DEBIT', 'OUT', 'OUTBOUND', 'WITHDRAWAL']);
function sign(direction: string): 'credit' | 'debit' | 'neutral' {
  const d = (direction || '').toUpperCase();
  if (CREDIT.has(d)) return 'credit';
  if (DEBIT.has(d)) return 'debit';
  return 'neutral';
}
function fmtAmount(amount: string, kind: string): string {
  const n = Number(amount);
  const abs = Number.isFinite(n) ? Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount;
  return kind === 'credit' ? `+${abs}` : kind === 'debit' ? `−${abs}` : abs;
}

export function WalletHistory({ entries }: { entries: HistoryEntry[] }) {
  const [q, setQ] = useState('');
  const [filt, setFilt] = useState('ALL'); // ALL | credit | debit
  const [page, setPage] = useState(0);

  const total = entries.length;
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      const kind = sign(e.direction);
      if (needle && !`${e.type} ${e.account} ${TYPE_LABEL[e.type] ?? ''}`.toLowerCase().includes(needle)) return false;
      if (filt === 'credit') return kind === 'credit';
      if (filt === 'debit') return kind === 'debit';
      return true;
    });
  }, [entries, q, filt]);

  const shown = filtered.length;
  const pageCount = Math.max(1, Math.ceil(shown / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const reset = () => setPage(0);

  if (total === 0) {
    return <div className={s.empty}>取引履歴はまだありません。上の入金アドレスに USDT を送るとここに表示されます。</div>;
  }

  return (
    <div>
      <div className={s.controls}>
        <input className={s.search} value={q} onChange={(e) => { setQ(e.target.value); reset(); }} placeholder="種別・勘定で検索…" aria-label="履歴を検索" />
        <select className={s.select} value={filt} onChange={(e) => { setFilt(e.target.value); reset(); }} aria-label="絞り込み">
          <option value="ALL">すべて</option>
          <option value="credit">入金系（＋）</option>
          <option value="debit">出金系（−）</option>
        </select>
        <span className={s.count}>{shown === total ? `全${total}件` : `${total}件中 ${shown}件`}</span>
      </div>

      {slice.length > 0 ? (
        <div className={s.histList}>
          {slice.map((e, i) => {
            const kind = sign(e.direction);
            return (
              <div key={`${e.created_at}-${i}`} className={s.hRow}>
                <span className={`${s.hDot} ${kind === 'credit' ? s.hDotCredit : kind === 'debit' ? s.hDotDebit : s.hDotNeutral}`} />
                <div className={s.hBody}>
                  <div className={s.hLabel}>{TYPE_LABEL[e.type] ?? e.type}</div>
                  <div className={s.hSub}>{e.created_at.slice(0, 19)} · {e.account}</div>
                </div>
                <span className={`${s.hAmt} ${kind === 'credit' ? s.hAmtCredit : kind === 'debit' ? s.hAmtDebit : s.hAmtNeutral}`}>
                  {fmtAmount(e.amount, kind)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>条件に一致する履歴がありません。</div>
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
