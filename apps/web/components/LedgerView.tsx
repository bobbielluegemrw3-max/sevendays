'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/client-api';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/races.module.css';

/**
 * 透明性台帳(オーナー承認 2026-07-10)。
 * BURN率の宣言の代わりに、毎晩の実データそのものを公開する:
 * 月カレンダー → 日次集計(出走/生存/BURN/DAY7/成約/新規発行 — 率は表示しない)
 * → 匿名の成約一覧 → 全馬結果とコミット・リビール検証へのリンク。
 * CSV(日次詳細/月次集計)はこの同じAPIデータからクライアント側で生成する。
 */

interface LedgerDay {
  date: string;
  race_id: string;
  participants: number;
  survived: number;
  burned: number;
  day7: number;
  matched: number;
  matched_volume: string;
  mints: number;
  weather: string | null;
  track_condition: string | null;
  surface: string | null;
  /** その夜に採用されたBURN率(ADR-012ジッター後の実効率・シードから検証可能)。 */
  burn_rate: string | null;
}

interface LedgerTrade {
  horse_name: string;
  price: string;
  is_mint: boolean;
  day: number;
  buyer_anon: string;
  seller_anon: string | null;
}

/* CSV(downloadCsv)のヘッダー・値は多言語化しない — 分析用の安定コードとして
 * 英語のまま維持する(誰でも同じ列で率を再計算できるため)。UI表示のみ辞書化。 */
function downloadCsv(filename: string, rows: (string | number | null)[][]): void {
  const esc = (v: string | number | null): string => {
    const t = v === null ? '' : String(v);
    return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function LedgerView({ t }: { t: AppDict['ledger'] }) {
  const fmtFull = (iso: string): string => {
    const [y, m, d] = iso.split('-');
    return fill(t.date_full_tpl, { y: y!, m: Number(m), d: Number(d) });
  };
  const [days, setDays] = useState<LedgerDay[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [trades, setTrades] = useState<LedgerTrade[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await apiFetch<{ days: LedgerDay[] }>('/api/v1/transparency/summary');
      if (r.status === 200) {
        const body = (r.body as { days: LedgerDay[] }).days;
        setDays(body);
        if (body[0]) setSelected(body[0].date);
      } else {
        setDays([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setTrades(null);
    void (async () => {
      const r = await apiFetch<{ trades: LedgerTrade[] }>(`/api/v1/transparency/day/${selected}`);
      if (r.status === 200) setTrades((r.body as { trades: LedgerTrade[] }).trades);
    })();
  }, [selected]);

  const day = useMemo(() => days?.find((d) => d.date === selected) ?? null, [days, selected]);
  const [viewMonth, setViewMonth] = useState('');
  useEffect(() => {
    if (selected) setViewMonth(selected.slice(0, 7));
  }, [selected]);

  const months = useMemo(() => [...new Set((days ?? []).map((d) => d.date.slice(0, 7)))].sort(), [days]);
  const monthDays = useMemo(() => new Map((days ?? []).map((d) => [d.date, d])), [days]);

  const downloadMonthly = useCallback(() => {
    if (!days || !viewMonth) return;
    const rows = days.filter((d) => d.date.startsWith(viewMonth)).sort((a, b) => a.date.localeCompare(b.date));
    downloadCsv(`sevendays-ledger-${viewMonth}.csv`, [
      ['date', 'participants', 'survived', 'burned', 'burn_rate', 'day7_cleared', 'p2p_matched', 'matched_volume_usdt', 'day0_mints', 'weather', 'track', 'surface'],
      ...rows.map((d) => [d.date, d.participants, d.survived, d.burned, d.burn_rate, d.day7, d.matched, d.matched_volume, d.mints, d.weather, d.track_condition, d.surface]),
    ]);
  }, [days, viewMonth]);

  const downloadDaily = useCallback(async () => {
    if (!selected || !day) return;
    setBusy(true);
    try {
      const r = await apiFetch<{ results: { final_rank: number; horse_name: string; day: number | null; final_score: string; is_burned: boolean }[]; total: number }>(
        `/api/v1/transparency/day/${selected}/results`,
      );
      const results = r.status === 200 ? (r.body as { results: { final_rank: number; horse_name: string; day: number | null; final_score: string; is_burned: boolean }[] }).results : [];
      downloadCsv(`sevendays-ledger-${selected}.csv`, [
        ['type', 'rank', 'horse', 'day', 'score', 'result', 'price_usdt', 'buyer', 'seller'],
        ...results.map((x) => [
          'RACE', x.final_rank, x.horse_name, x.day, x.final_score, x.is_burned ? 'BURNED' : 'SURVIVED', null, null, null,
        ]),
        ...(trades ?? []).map((tr) => [
          tr.is_mint ? 'MINT' : 'P2P', null, tr.horse_name, tr.day, null, 'SETTLED', tr.price, tr.buyer_anon, tr.seller_anon,
        ]),
      ]);
    } finally {
      setBusy(false);
    }
  }, [selected, day, trades]);

  if (days === null) {
    return <div className={s.empty}>{t.loading}</div>;
  }
  if (days.length === 0) {
    return <div className={s.empty}>{t.empty_no_races}</div>;
  }

  // カレンダー
  const ym = viewMonth || days[0]!.date.slice(0, 7);
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = months.filter((x) => x < ym).pop() ?? null;
  const next = months.filter((x) => x > ym).shift() ?? null;
  const cells: ({ iso: string; n: number } | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ n: d, iso: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });

  return (
    <div className={s.recStack}>
      <div className={s.cal}>
        <div className={s.calHead}>
          <button type="button" className={s.calNav} disabled={!prev} onClick={() => prev && setViewMonth(prev)} aria-label={t.prev_month_aria}>‹</button>
          <span className={s.calMonth}>{fill(t.month_tpl, { y, m })}</span>
          <button type="button" className={s.calNav} disabled={!next} onClick={() => next && setViewMonth(next)} aria-label={t.next_month_aria}>›</button>
        </div>
        <div className={s.calGrid}>
          {t.dow.map((d, i) => <div key={i} className={s.calDow}>{d}</div>)}
          {cells.map((c, i) => {
            if (!c) return <div key={`e${i}`} className={s.calCell} />;
            const has = monthDays.has(c.iso);
            const sel = c.iso === selected;
            const cls = [s.calCell];
            if (has) cls.push(s.calHas);
            if (sel) cls.push(s.calSel);
            return (
              <div key={c.iso} className={cls.join(' ')} onClick={has ? () => setSelected(c.iso) : undefined} role={has ? 'button' : undefined}>
                {c.n}
                {has && !sel ? <span className={s.calDot} /> : null}
              </div>
            );
          })}
        </div>
      </div>

      {day && (
        <>
          <div className={s.digest}>
            <div className={s.digestTop}>
              <span className={s.digestDate}>{fmtFull(day.date)}</span>
              {day.weather && (
                <span className={s.digestDow}>
                  {t.weather[day.weather] ?? day.weather} / {t.track[day.track_condition ?? ''] ?? day.track_condition} / {t.surface[day.surface ?? ''] ?? day.surface}
                </span>
              )}
            </div>
            <div className={s.tally}>
              <div className={s.tStat}><span className={s.tStatN}>{day.participants.toLocaleString('en-US')}</span><span className={s.tStatK}>{t.t_participants}</span></div>
              <div className={`${s.tStat} ${s.tSrv}`}><span className={s.tStatN}>{day.survived.toLocaleString('en-US')}</span><span className={s.tStatK}>{t.t_survived}</span></div>
              <div className={`${s.tStat} ${s.tBurn}`}><span className={s.tStatN}>{day.burned.toLocaleString('en-US')}</span><span className={s.tStatK}>{t.t_burn}</span></div>
              <div className={`${s.tStat} ${s.tDay7}`}><span className={s.tStatN}>{day.day7.toLocaleString('en-US')}</span><span className={s.tStatK}>{t.t_day7}</span></div>
              <div className={`${s.tStat} ${s.tTrade}`}><span className={s.tStatN}>{day.matched.toLocaleString('en-US')}</span><span className={s.tStatK}>{t.t_matched}</span></div>
              <div className={`${s.tStat} ${s.tTrade}`}><span className={s.tStatN}>{Number(day.matched_volume).toLocaleString('en-US')}</span><span className={s.tStatK}>{t.t_matched_vol}</span></div>
              <div className={s.tStat}><span className={s.tStatN}>{day.mints.toLocaleString('en-US')}</span><span className={s.tStatK}>{t.t_mints}</span></div>
              {day.burn_rate && (
                <div className={`${s.tStat} ${s.tBurn}`}>
                  <span className={s.tStatN}>{(Number(day.burn_rate) * 100).toFixed(2)}%</span>
                  <span className={s.tStatK}>{t.t_burn_rate}</span>
                </div>
              )}
            </div>
            <div className={s.digestStep}>
              <button type="button" className={s.stepBtn} onClick={() => void downloadDaily()} disabled={busy}>
                {busy ? t.csv_generating : t.csv_daily}
              </button>
              <button type="button" className={s.stepBtn} onClick={downloadMonthly}>{t.csv_monthly}</button>
              <Link className={s.stepBtn} href={`/races/${day.race_id}`}>{t.verify_link}</Link>
            </div>
          </div>

          <div>
            <div className={s.secLabel}>{t.trades_label}</div>
            {trades === null ? (
              <div className={s.empty}>{t.trades_loading}</div>
            ) : trades.length === 0 ? (
              <div className={s.empty}>{t.trades_empty}</div>
            ) : (
              <div className={s.recList}>
                {trades.slice(0, 30).map((tr, i) => (
                  <div key={i} className={s.recRow}>
                    <div className={s.recBody}>
                      <div className={s.recName}>{tr.horse_name}</div>
                      <div className={s.recSub}>
                        {tr.is_mint
                          ? <>{t.mint_label_day0} → {tr.buyer_anon}</>
                          : <>{tr.seller_anon} → {tr.buyer_anon}{fill(t.p2p_day_tpl, { day: tr.day })}</>}
                        {' — '}<b className={s.recGold}>{tr.price} USDT</b>
                      </div>
                    </div>
                    <span className={`${s.recBadge} ${tr.is_mint ? s.recBadgeMint : s.recBadgeCyan}`}>
                      {tr.is_mint ? t.badge_mint : 'P2P'}
                    </span>
                  </div>
                ))}
                {trades.length > 30 && (
                  <div className={s.empty}>{fill(t.more_tpl, { n: trades.length - 30 })}</div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
