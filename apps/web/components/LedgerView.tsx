'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/client-api';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/races.module.css';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/**
 * 公開台帳「公平性の証明」リデザイン(仕様書.md / LEDGER_PROOF_OF_FAIRNESS_SPEC.md)。
 * ③名乗り(公平性の証明) → ①COMMIT·REVEAL前面 → ②全体の記録(累計 + 公表値↔公開データから計算)
 * → 日ごとの記録(月カレンダー | 日次集計 + 検証 / CSV) → ④その日の成約(折りたたみ)。
 * ★機構(transparency API・コミット/リビール・レース検証)不変=純情報設計。累計・割合は
 *   days のクライアント集計(reduce・新APIなし)で、生の総数の式を併記(R1: 検証可能)。
 * ★R1: BURN率=公表値(基準率10.7%)↔計算値。チャンピオン到達率は emergent(入力パラメータでない)
 *   ため公表値を作らず計算値のみ(式併記)。検証カードは実ハッシュを捏造せずレース詳細へ導く。
 * ★R3: 賭博/オッズ語なし。内部用語(ADR-012/ジッター/実効率)は画面に出さない。
 */

interface LedgerDay {
  date: string;
  slot?: string;
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

/** BURN基準率(ECONOMY_REVISION.md / domain constants の 0.107)。公表値として表示。 */
const CLAIM_BURN_PCT = '10.7%';

/* CSV(downloadCsv)のヘッダー・値は多言語化しない — 分析用の安定コードとして英語のまま維持。 */
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

const cm = (n: number): string => n.toLocaleString('en-US');
const pctOf = (x: number, d: number): string => (d > 0 ? `${((x / d) * 100).toFixed(2)}%` : '—');

export function LedgerView({ t }: { t: AppDict['ledger'] }) {
  const lang = useLang();
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
  const monthDays = useMemo(() => {
    const map = new Map<string, NonNullable<typeof days>[number]>();
    for (const d of days ?? []) if (!map.has(d.date)) map.set(d.date, d);
    return map;
  }, [days]);

  // ② 累計(クライアント集計) + 公開データから計算した率。
  const totals = useMemo(() => {
    const sum = (k: keyof LedgerDay): number => (days ?? []).reduce((a, d) => a + Number(d[k] ?? 0), 0);
    return {
      races: days?.length ?? 0,
      participants: sum('participants'), survived: sum('survived'), burned: sum('burned'),
      day7: sum('day7'), matched: sum('matched'), volume: sum('matched_volume'), mints: sum('mints'),
    };
  }, [days]);

  const downloadMonthly = useCallback(() => {
    if (!days || !viewMonth) return;
    const rows = days.filter((d) => d.date.startsWith(viewMonth)).sort((a, b) => a.date.localeCompare(b.date));
    downloadCsv(`sevendays-ledger-${viewMonth}.csv`, [
      ['date', 'slot', 'participants', 'survived', 'burned', 'burn_rate', 'day7_cleared', 'p2p_matched', 'matched_volume_usdt', 'day0_mints', 'weather', 'track', 'surface'],
      ...rows.map((d) => [d.date, d.slot ?? 'NIGHT', d.participants, d.survived, d.burned, d.burn_rate, d.day7, d.matched, d.matched_volume, d.mints, d.weather, d.track_condition, d.surface]),
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
        ...results.map((x) => ['RACE', x.final_rank, x.horse_name, x.day, x.final_score, x.is_burned ? 'BURNED' : 'SURVIVED', null, null, null]),
        ...(trades ?? []).map((tr) => [tr.is_mint ? 'MINT' : 'P2P', null, tr.horse_name, tr.day, null, 'SETTLED', tr.price, tr.buyer_anon, tr.seller_anon]),
      ]);
    } finally {
      setBusy(false);
    }
  }, [selected, day, trades]);

  // ③ 名乗り + ① COMMIT·REVEAL は常時表示(信頼の核・データ非依存)。英語ブランド語はJSX直書き。
  const header = (
    <>
      <header className={s.lgHeader}>
        <div className={s.lgKicker}>PROOF OF FAIRNESS</div>
        <h1 className={s.lgTitle}>{t.proof_title}</h1>
        <p className={s.lgIntro}>{t.proof_intro}</p>
        <div className={s.lgChips}>
          {[t.chip1, t.chip2, t.chip3].map((c) => (
            <span key={c} className={s.lgChip}><span className={s.lgChipDot} />{c}</span>
          ))}
        </div>
      </header>

      <section className={s.crSection}>
        <div className={s.crHead}>
          <span className={s.crName}>COMMIT · REVEAL</span>
          <span className={s.crVerifiable}><span className={s.crBeat} />{t.cr_verifiable}</span>
        </div>
        <div className={s.crHeadline}>{t.cr_headline}</div>
        <p className={s.crBody}>{t.cr_body}</p>
        <div className={s.crSteps}>
          {[[t.cr_s1_when, 'COMMIT', t.cr_s1_body], [t.cr_s2_when, 'RACE', t.cr_s2_body], [t.cr_s3_when, 'REVEAL', t.cr_s3_body]].map(([when, title, body]) => (
            <div key={title} className={s.crStep}>
              <div className={s.crStepWhen}>{when}</div>
              <div className={s.crStepTitle}>{title}</div>
              <div className={s.crStepBody}>{body}</div>
            </div>
          ))}
        </div>
        <div className={s.crCtaRow}>
          {day ? <Link className={s.crCta} href={`/races/${day.race_id}`}>{t.cr_cta}</Link> : <span className={s.crCta}>{t.cr_cta}</span>}
          <span className={s.crCtaNote}>{t.cr_cta_note}</span>
        </div>
        <details className={s.crDetails}>
          <summary className={s.crSummary}>{t.cr_how_summary}<span style={{ fontSize: 9, color: 'var(--faint)' }}>▼</span></summary>
          <div className={s.crHowList}>
            {[t.cr_h1, t.cr_h2, t.cr_h3, t.cr_h4].map((text, i) => (
              <div key={i} className={s.crHowRow}><span className={s.crHowN}>{String(i + 1).padStart(2, '0')}</span><span className={s.crHowText}>{text}</span></div>
            ))}
          </div>
          <div className={s.crHowFoot}>{t.cr_how_foot}</div>
        </details>
      </section>
    </>
  );

  if (days === null) {
    return <div className={s.lgStack}>{header}<div className={s.empty}>{t.loading}</div></div>;
  }
  if (days.length === 0) {
    return <div className={s.lgStack}>{header}<div className={s.empty}>{t.empty_no_races}</div></div>;
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

  const sumBoxes: Array<{ k: string; n: number; cls: string }> = [
    { k: t.sum_races, n: totals.races, cls: '' },
    { k: t.sum_participants, n: totals.participants, cls: '' },
    { k: t.sum_survived, n: totals.survived, cls: s.lgSumSrv ?? '' },
    { k: t.sum_burn, n: totals.burned, cls: s.lgSumBurn ?? '' },
    { k: t.sum_champ, n: totals.day7, cls: s.lgSumDay7 ?? '' },
    { k: t.sum_matched, n: totals.matched, cls: s.lgSumTrade ?? '' },
    { k: t.sum_volume, n: totals.volume, cls: s.lgSumTrade ?? '' },
    { k: t.sum_mints, n: totals.mints, cls: '' },
  ];

  return (
    <div className={s.lgStack}>
      {header}

      {/* ② 全体の記録: 累計 + 公表値↔公開データから計算 */}
      <section className={s.lgTotals}>
        <div className={s.lgTotalsHead}>
          <h2 className={s.lgTotalsTitle}>{t.totals_title}</h2>
          <span className={s.lgTotalsSub}>{t.totals_sub}</span>
          <span className={s.lgPeriod}>{fill(t.period_tpl, { a: days[days.length - 1]!.date, b: days[0]!.date })}</span>
        </div>
        <div className={s.lgSumGrid}>
          {sumBoxes.map((b) => (
            <div key={b.k} className={`${s.lgSumBox} ${b.cls}`}>
              <span className={s.lgSumN}>{cm(b.n)}</span>
              <span className={s.lgSumK}>{b.k}</span>
            </div>
          ))}
        </div>
        <div className={s.lgProof}>
          <div className={s.lgProofKicker}>CLAIMED ↔ CALCULATED</div>
          <div className={s.lgProofLead}>{t.proof_lead}</div>
          <div className={s.lgDerivedGrid}>
            {/* BURN率: 公表値(基準率) ↔ 公開データから計算 */}
            <div className={s.lgDerivedCard}>
              <div className={s.lgDerivedLabel}>{t.burn_label}</div>
              <div className={s.lgDerivedRow}>
                <div>
                  <div className={s.lgClaimedK}>{t.claimed_k}</div>
                  <div className={s.lgClaimedV}>{CLAIM_BURN_PCT}</div>
                </div>
                <span className={s.lgArrow}>↔</span>
                <div>
                  <div className={s.lgCalcK}>{t.calc_k}</div>
                  <div className={s.lgCalcV}>{pctOf(totals.burned, totals.participants)}</div>
                </div>
              </div>
              <div className={s.lgFormula}>{fill(t.burn_formula_tpl, { b: cm(totals.burned), p: cm(totals.participants) })}</div>
            </div>
            {/* チャンピオン到達率: emergentのため公表値なし=計算値のみ(式併記) */}
            <div className={s.lgDerivedCard}>
              <div className={s.lgDerivedLabel}>{t.champ_label}</div>
              <div className={s.lgDerivedRow}>
                <div>
                  <div className={s.lgCalcK}>{t.calc_k}</div>
                  <div className={s.lgCalcV}>{pctOf(totals.day7, totals.participants)}</div>
                </div>
              </div>
              <div className={s.lgFormula}>{fill(t.champ_formula_tpl, { c: cm(totals.day7), p: cm(totals.participants) })}</div>
            </div>
          </div>
          <p className={s.lgDerivedNote}>{t.derived_note}</p>
        </div>
      </section>

      {/* 日ごとの記録: 2カラム(カレンダー | 日次集計+検証) */}
      <section className={s.lgDaySection} id="verify">
        <div className={s.lgDayHead}>
          <h2 className={s.lgDayTitle}>{t.day_title}</h2>
          <span className={s.lgDaySub}>{t.day_sub}</span>
        </div>
        <div className={s.lgDayGrid}>
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
                <div className={s.tStat}><span className={s.tStatN}>{cm(day.participants)}</span><span className={s.tStatK}>{t.t_participants}</span></div>
                <div className={`${s.tStat} ${s.tSrv}`}><span className={s.tStatN}>{cm(day.survived)}</span><span className={s.tStatK}>{t.t_survived}</span></div>
                <div className={`${s.tStat} ${s.tBurn}`}><span className={s.tStatN}>{cm(day.burned)}</span><span className={s.tStatK}>{t.t_burn}</span></div>
                <div className={`${s.tStat} ${s.tDay7}`}><span className={s.tStatN}>{cm(day.day7)}</span><span className={s.tStatK}>{t.t_day7}</span></div>
                <div className={`${s.tStat} ${s.tTrade}`}><span className={s.tStatN}>{cm(day.matched)}</span><span className={s.tStatK}>{t.t_matched}</span></div>
                <div className={`${s.tStat} ${s.tTrade}`}><span className={s.tStatN}>{cm(Number(day.matched_volume))}</span><span className={s.tStatK}>{t.t_matched_vol}</span></div>
                <div className={s.tStat}><span className={s.tStatN}>{cm(day.mints)}</span><span className={s.tStatK}>{t.t_mints}</span></div>
                {day.burn_rate && (
                  <div className={`${s.tStat} ${s.tBurn}`}>
                    <span className={s.tStatN}>{(Number(day.burn_rate) * 100).toFixed(2)}%</span>
                    <span className={s.tStatK}>{t.t_burn_rate}</span>
                  </div>
                )}
              </div>
              <div className={s.digestStep}>
                <button type="button" className={s.stepBtn} onClick={() => void downloadDaily()} disabled={busy}>{busy ? t.csv_generating : t.csv_daily}</button>
                <button type="button" className={s.stepBtn} onClick={downloadMonthly}>{t.csv_monthly}</button>
                <Link className={s.stepBtn} href={`/races/${day.race_id}`}>{t.verify_link}</Link>
              </div>
              {/* 検証: 実ハッシュは捏造せず、封/中身の意味を示しレース詳細へ導く(R1) */}
              <div className={s.lgVerify}>
                <div className={s.lgVerifyHead}>
                  <span className={s.lgVerifyKicker}>VERIFICATION</span>
                  <span className={s.lgVerifyOk}>{t.cr_verifiable}</span>
                </div>
                <div className={s.lgVerifyFoot}>{t.verify_foot}</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ④ その日の成約(折りたたみ) */}
      {day && (
        <details className={s.lgTradesFold}>
          <summary className={s.lgTradesSummary}>
            <span style={{ fontSize: 10, color: 'var(--faint)' }}>▶</span>
            <h2 className={s.lgTradesTitle}>{t.trades_label}</h2>
            <span className={s.lgTradesSub}>{t.trades_fold_sub}</span>
          </summary>
          <div className={s.lgTradesBody}>
            {trades === null ? (
              <div className={s.empty}>{t.trades_loading}</div>
            ) : trades.length === 0 ? (
              <div className={s.empty}>{t.trades_empty}</div>
            ) : (
              <div className={s.recList}>
                {trades.slice(0, 30).map((tr, i) => (
                  <div key={i} className={s.recRow}>
                    <div className={s.recBody}>
                      <div className={s.recName}>{horseDisplayName(tr.horse_name, lang)}</div>
                      <div className={s.recSub}>
                        {tr.is_mint
                          ? <>{t.mint_label_day0} → {tr.buyer_anon}</>
                          : <>{tr.seller_anon} → {tr.buyer_anon}{fill(t.p2p_day_tpl, { day: tr.day })}</>}
                        {' — '}<b className={s.recGold}>{tr.price} USDT</b>
                      </div>
                    </div>
                    <span className={`${s.recBadge} ${tr.is_mint ? s.recBadgeMint : s.recBadgeCyan}`}>{tr.is_mint ? t.badge_mint : 'P2P'}</span>
                  </div>
                ))}
                {trades.length > 30 && <div className={s.empty}>{fill(t.more_tpl, { n: trades.length - 30 })}</div>}
                <div className={s.lgTradesFoot}>{t.trades_foot}</div>
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
