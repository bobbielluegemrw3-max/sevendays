'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * /ledger 公平性の証明リデザイン — デザイナー正典 Ledger.html の忠実写経(仕様書.md)。
 * 色/余白/角丸/タイポの厳密値は正典が正。正典のインラインスタイル文字列を保持(ドリフト排除)。
 *
 * ★これはプレビュー(視覚承認用)。機構(transparency API・コミット/リビール・レース検証)不変=純情報設計。
 * 累計・割合は fixture(7日分)から実際にクライアント集計・計算(新APIなし)。CSVは実際にDLできる。
 * 承認後に本番 LedgerView へ結線(days=/transparency/summary のクライアント集計)。
 */

interface Day {
  date: string; participants: number; survived: number; burned: number; day7: number;
  matched: number; matched_volume: string; mints: number; weather: string; track: string; surface: string; burn_rate: string;
}
const DAYS: Day[] = [
  { date: '2026-07-18', participants: 1284, survived: 1147, burned: 137, day7: 3, matched: 212, matched_volume: '26480', mints: 96, weather: '晴れ', track: '良', surface: '芝', burn_rate: '0.1067' },
  { date: '2026-07-19', participants: 1310, survived: 1169, burned: 141, day7: 2, matched: 198, matched_volume: '24915', mints: 104, weather: '曇り', track: '稍重', surface: 'ダート', burn_rate: '0.1076' },
  { date: '2026-07-20', participants: 1352, survived: 1207, burned: 145, day7: 4, matched: 231, matched_volume: '29740', mints: 112, weather: '雨', track: '不良', surface: '芝', burn_rate: '0.1072' },
  { date: '2026-07-21', participants: 1377, survived: 1230, burned: 147, day7: 1, matched: 205, matched_volume: '25630', mints: 88, weather: '晴れ', track: '高速', surface: '芝', burn_rate: '0.1068' },
  { date: '2026-07-22', participants: 1401, survived: 1252, burned: 149, day7: 5, matched: 243, matched_volume: '31285', mints: 121, weather: '嵐', track: '不良', surface: 'ダート', burn_rate: '0.1064' },
  { date: '2026-07-23', participants: 1428, survived: 1276, burned: 152, day7: 2, matched: 220, matched_volume: '28110', mints: 99, weather: '曇り', track: '良', surface: '芝', burn_rate: '0.1065' },
  { date: '2026-07-24', participants: 1455, survived: 1300, burned: 155, day7: 3, matched: 236, matched_volume: '30475', mints: 107, weather: '晴れ', track: '良', surface: '芝', burn_rate: '0.1065' },
];
const TRADES = [
  { name: 'ソラノ・ハテ', flow: 'U-77b0 → U-8f3a（DAY 5）', price: '161.05', mint: false },
  { name: 'テン・ノ・ヤ', flow: '新規発行 DAY0 → U-2c91', price: '102.00', mint: true },
  { name: 'リン・ドーロ', flow: 'U-4e12 → U-a055（DAY 3）', price: '133.10', mint: false },
  { name: 'シズカ・ウミ', flow: '新規発行 DAY0 → U-b204', price: '102.00', mint: true },
];
const CLAIM_BURN = 0.107;
const CLAIM_CHAMP = 0.0021;
const CR_STEPS = [
  { when: 'レース前', title: 'COMMIT', body: '結果のもとになる数値を、封をした状態で公開します。' },
  { when: 'レース中', title: 'RACE', body: '封をした内容は、あとから書き換えられません。' },
  { when: 'レース後', title: 'REVEAL', body: '封を開けて中身を公開。封と中身が合うか誰でも確かめられます。' },
];
const CR_HOW = [
  { n: '01', text: 'レース詳細ページで、レース前に公開された封（commit hash）を確認します。' },
  { n: '02', text: 'レース後に公開された中身（reveal の値）をコピーします。' },
  { n: '03', text: '中身をハッシュ計算（SHA-256）して、封の値と一致することを確かめます。' },
  { n: '04', text: '同じ値から順位とBURN率を計算し直し、公開結果と一致することを確かめます。' },
];
const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const CSV_HEADER = ['date', 'slot', 'participants', 'survived', 'burned', 'burn_rate', 'day7_cleared', 'p2p_matched', 'matched_volume_usdt', 'day0_mints', 'weather', 'track', 'surface'];

const cm = (n: number): string => n.toLocaleString('en-US');
const pct = (x: number, d: number): string => `${((x / d) * 100).toFixed(2)}%`;
const rowOf = (d: Day): (string | number)[] => [d.date, 'NIGHT', d.participants, d.survived, d.burned, d.burn_rate, d.day7, d.matched, d.matched_volume, d.mints, d.weather, d.track, d.surface];

function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const esc = (v: string | number): string => { const t = String(v); return /[",\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t; };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  URL.revokeObjectURL(a.href);
}

type Tone = 'none' | 'srv' | 'burn' | 'day7' | 'trade';
const TONE: Record<Tone, [string, string, string]> = {
  none: ['var(--border)', 'rgba(255,255,255,.015)', 'var(--text)'],
  srv: ['rgba(53,208,127,.4)', 'rgba(53,208,127,.07)', 'var(--good)'],
  burn: ['rgba(255,92,92,.4)', 'rgba(255,92,92,.07)', 'var(--bad)'],
  day7: ['rgba(240,200,110,.4)', 'rgba(240,200,110,.07)', 'var(--gold-bright)'],
  trade: ['rgba(0,234,255,.4)', 'rgba(0,234,255,.06)', 'var(--cyan)'],
};
const boxStyle = (t: Tone): string => `border:1px solid ${TONE[t][0]};border-radius:11px;padding:9px 12px;background:${TONE[t][1]}`;
const inlineBoxStyle = (t: Tone): string => `display:flex;align-items:baseline;gap:7px;${boxStyle(t)}`;
const numStyle = (t: Tone): string => `font:800 20px/1 var(--font-display);font-variant-numeric:tabular-nums;color:${TONE[t][2]}`;
const navStyle = (on: boolean): string => `font:700 14px/1 var(--font-display);border-radius:9px;width:32px;height:30px;` +
  (on ? 'color:var(--cyan);border:1px solid rgba(0,234,255,.35);background:rgba(0,234,255,.05);cursor:pointer' : 'color:var(--faint);border:1px solid var(--border);background:transparent;cursor:default');
const STEP_STYLE = 'font:700 11px/1 var(--font-display);color:var(--cyan);border:1px solid rgba(0,234,255,.35);border-radius:999px;padding:7px 13px;background:rgba(0,234,255,.05);cursor:pointer';
const CALC_STYLE = 'font:800 22px/1 var(--font-display);font-variant-numeric:tabular-nums;color:var(--cyan);margin-top:5px;text-shadow:0 0 18px rgba(0,234,255,.35)';

const VIEW_VARS = {
  pc: { '--colW': '1080px', '--padX': 'clamp(14px,4vw,26px)', '--padS': 'clamp(15px,2.6vw,20px)', '--sumCols': 'repeat(auto-fit,minmax(148px,1fr))', '--proofCols': '1fr 1fr' },
  mobile: { '--colW': '402px', '--padX': '16px', '--padS': '15px', '--sumCols': 'repeat(2,1fr)', '--proofCols': '1fr' },
} as const;

const SCOPED_STYLE = `
.ledgerPreview{--bg:#050409;--panel:#12101d;--panel-2:#16132a;--border:rgba(255,255,255,.08);--border-strong:rgba(0,234,255,.28);--text:#eae7ff;--muted:#8f8ac2;--faint:#5a5580;--cyan:#00eaff;--magenta:#ff2dc4;--magenta-soft:#ff8fe4;--gold:#c9a86a;--gold-bright:#f2e4bf;--good:#35d07f;--good-soft:#9dffc4;--bad:#ff5c5c;--radius:16px;--radius-sm:11px;--radius-xs:8px;--shadow:0 24px 60px -24px rgba(0,0,0,.8);--font-display:'Orbitron',system-ui,sans-serif;--font-sans:'Space Grotesk','Zen Kaku Gothic New',system-ui,sans-serif;--font-jp:'Zen Kaku Gothic New',system-ui,sans-serif;--font-mono:'IBM Plex Mono',ui-monospace,monospace;color:var(--text);font-family:var(--font-sans);line-height:1.6;-webkit-font-smoothing:antialiased;min-height:100vh;background:radial-gradient(900px 500px at 50% -8%,#06222b 0%,#0a0714 46%,var(--bg) 100%),var(--bg)}
.ledgerPreview *{box-sizing:border-box}
.ledgerPreview a{color:var(--cyan);text-decoration:none}
.ledgerPreview summary{cursor:pointer;list-style:none}.ledgerPreview summary::-webkit-details-marker{display:none}
@keyframes lgFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes lgBeat{0%,100%{opacity:.55}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){.ledgerPreview *{animation:none!important}}
`;

function buildHtml(view: 'pc' | 'mobile', selected: string, viewMonth: string): string {
  const sum = (k: keyof Day): number => DAYS.reduce((a, d) => a + Number(d[k]), 0);
  const tParts = sum('participants'), tBurn = sum('burned'), tSrv = sum('survived'), tDay7 = sum('day7'),
    tMatched = sum('matched'), tVol = sum('matched_volume'), tMints = sum('mints');
  const totals: Array<{ k: string; n: string; t: Tone }> = [
    { k: '総レース数', n: cm(DAYS.length), t: 'none' }, { k: '総出走', n: cm(tParts), t: 'none' },
    { k: '総生存', n: cm(tSrv), t: 'srv' }, { k: '総BURN', n: cm(tBurn), t: 'burn' },
    { k: 'チャンピオン誕生', n: cm(tDay7), t: 'day7' }, { k: '成約', n: cm(tMatched), t: 'trade' },
    { k: '取引総額 USDT', n: cm(tVol), t: 'trade' }, { k: '新規発行', n: cm(tMints), t: 'none' },
  ];
  const derived = [
    { label: 'BURN 率', claimed: `${(CLAIM_BURN * 100).toFixed(1)}%`, calculated: pct(tBurn, tParts), formula: `総BURN ${cm(tBurn)} ÷ 総出走 ${cm(tParts)} 頭` },
    { label: 'チャンピオン到達率', claimed: `${(CLAIM_CHAMP * 100).toFixed(2)}%`, calculated: pct(tDay7, tParts), formula: `チャンピオン ${cm(tDay7)} ÷ 総出走 ${cm(tParts)} 頭` },
  ];
  const months = [...new Set(DAYS.map((d) => d.date.slice(0, 7)))].sort();
  const prev = months.filter((x) => x < viewMonth).pop() ?? null;
  const next = months.filter((x) => x > viewMonth).shift() ?? null;
  const y = Number(viewMonth.slice(0, 4));
  const m = Number(viewMonth.slice(5, 7));
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const has = new Set(DAYS.map((d) => d.date));
  let cellsHtml = '';
  for (let i = 0; i < firstDow; i++) cellsHtml += `<div style="position:relative;aspect-ratio:1;border:1px solid transparent;border-radius:9px"></div>`;
  for (let d = 1; d <= dim; d++) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const hasIt = has.has(iso), sel = iso === selected;
    const style = `position:relative;aspect-ratio:1;display:flex;align-items:center;justify-content:center;border-radius:9px;font:400 12px/1 var(--font-mono);` +
      (sel ? 'color:#04141a;background:linear-gradient(135deg,var(--cyan),#5ff5ff);border:1px solid transparent;font-weight:700'
        : hasIt ? 'color:var(--text);background:rgba(255,255,255,.03);border:1px solid var(--border);cursor:pointer'
          : 'color:var(--faint);border:1px solid transparent');
    const dot = hasIt && !sel ? '<span style="position:absolute;bottom:5px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:999px;background:var(--cyan)"></span>' : '';
    const attr = hasIt ? ` data-iso="${iso}"` : '';
    cellsHtml += `<div${attr} style="${style}">${d}${dot}</div>`;
  }
  const day = DAYS.find((d) => d.date === selected) ?? DAYS[DAYS.length - 1]!;
  const [dy, dmo, dd] = day.date.split('-');
  const dayStats: Array<{ k: string; n: string; t: Tone }> = [
    { k: '出走', n: cm(day.participants), t: 'none' }, { k: '生存', n: cm(day.survived), t: 'srv' },
    { k: 'BURN', n: cm(day.burned), t: 'burn' }, { k: 'チャンピオン', n: cm(day.day7), t: 'day7' },
    { k: '成約', n: cm(day.matched), t: 'trade' }, { k: '取引量', n: cm(Number(day.matched_volume)), t: 'trade' },
    { k: '新規発行', n: cm(day.mints), t: 'none' }, { k: 'この日のBURN率', n: `${(Number(day.burn_rate) * 100).toFixed(2)}%`, t: 'burn' },
  ];
  const verifyRows = [
    { k: '封（レース前に公開）', v: '8f3a…c1d0' },
    { k: '中身（レース後に公開）', v: 'race-2026-07-24-night:5c9e…a7b2' },
    { k: '中身をハッシュ計算した結果', v: '8f3a…c1d0 ✓ 封と一致' },
  ];

  return `
<div style="position:fixed;top:14px;right:14px;z-index:80;display:flex;gap:2px;padding:3px;border:1px solid var(--border);border-radius:999px;background:rgba(10,7,20,.92);backdrop-filter:blur(8px);box-shadow:var(--shadow)">
  <button data-act="mobile" style="appearance:none;padding:6px 15px;border:none;border-radius:999px;cursor:pointer;font:700 12px/1 var(--font-jp);${view === 'mobile' ? 'background:var(--cyan);color:#04141a' : 'background:transparent;color:var(--muted)'}">モバイル</button>
  <button data-act="pc" style="appearance:none;padding:6px 15px;border:none;border-radius:999px;cursor:pointer;font:700 12px/1 var(--font-jp);${view === 'pc' ? 'background:var(--cyan);color:#04141a' : 'background:transparent;color:var(--muted)'}">PC</button>
</div>
<div style="max-width:var(--colW);margin:0 auto;padding:22px var(--padX) 96px;display:flex;flex-direction:column;gap:15px">

  <!-- ③ 名乗り: 公平性の証明 -->
  <header style="border:1px solid var(--border-strong);border-radius:var(--radius);padding:var(--padS);background:radial-gradient(560px 220px at 8% 0%,rgba(0,234,255,.09),transparent 66%),var(--panel);box-shadow:var(--shadow)">
    <div style="font:700 11px/1 var(--font-mono);letter-spacing:.32em;color:var(--cyan);text-transform:uppercase">PROOF OF FAIRNESS</div>
    <h1 style="margin:10px 0 0;font:800 clamp(24px,4vw,32px)/1.1 var(--font-display);letter-spacing:.03em;color:var(--text)">公平性の証明</h1>
    <p style="margin:12px 0 0;max-width:62ch;font:400 13px/1.8 var(--font-jp);color:var(--muted);line-break:strict;word-break:keep-all;text-wrap:pretty">このページでは、毎レースの記録をすべてそのまま公開しています。結果はレースの前に決まっていて、あとから変えられません。それを誰でも自分で確かめられます。</p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
      ${['実際の記録だけを掲載', '割合は公開データから計算', 'CSVで誰でも計算し直せます'].map((c) => `<span style="display:inline-flex;align-items:center;gap:7px;font:500 11px/1 var(--font-jp);color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:7px 12px;background:rgba(255,255,255,.015)"><span style="width:5px;height:5px;border-radius:50%;background:var(--good)"></span>${c}</span>`).join('')}
    </div>
  </header>

  <!-- ① COMMIT · REVEAL -->
  <section style="border:1px solid rgba(53,208,127,.28);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(150deg,rgba(53,208,127,.07),transparent 70%),var(--panel);box-shadow:var(--shadow);animation:lgFade .5s ease both">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <span style="font:700 11px/1 var(--font-display);letter-spacing:.18em;color:var(--good-soft)">COMMIT&nbsp;·&nbsp;REVEAL</span>
      <span style="margin-left:auto;display:inline-flex;align-items:center;gap:6px;font:700 11px/1 var(--font-display);color:var(--good);border:1px solid rgba(53,208,127,.45);border-radius:999px;padding:5px 12px;background:rgba(53,208,127,.1)"><span style="width:6px;height:6px;border-radius:50%;background:var(--good);animation:lgBeat 2s ease-in-out infinite"></span>検証可能</span>
    </div>
    <div style="font:800 clamp(17px,2.6vw,21px)/1.5 var(--font-jp);color:var(--text);margin-top:13px;max-width:40ch;line-break:strict;word-break:keep-all;text-wrap:pretty">運営は、結果を操作できません。</div>
    <p style="margin:11px 0 0;max-width:60ch;font:400 13px/1.85 var(--font-jp);color:var(--muted);line-break:strict;word-break:keep-all;text-wrap:pretty">結果はレース<b style="color:var(--good-soft)">前</b>に暗号的に<b style="color:var(--text)">コミット</b>（ハッシュを公開）され、レース<b style="color:var(--good-soft)">後</b>に<b style="color:var(--text)">リビール</b>（元の値を公開）されます。あとから値を変えるとハッシュが一致しないため、結果の差し替えは成立しません。</p>
    <div style="display:grid;grid-template-columns:var(--sumCols);gap:10px;margin-top:15px">
      ${CR_STEPS.map((st) => `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:13px 14px;background:rgba(255,255,255,.015)"><div style="font:500 9.5px/1 var(--font-mono);letter-spacing:.16em;color:var(--faint);text-transform:uppercase">${st.when}</div><div style="font:700 13.5px/1.3 var(--font-display);color:var(--text);margin-top:7px">${st.title}</div><div style="font:400 11.5px/1.65 var(--font-jp);color:var(--muted);margin-top:7px">${st.body}</div></div>`).join('')}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:15px">
      <a href="#verify" style="font:700 12px/1 var(--font-display);letter-spacing:.05em;color:#04141a;background:linear-gradient(100deg,var(--good),#7bf0b0);border-radius:10px;padding:11px 18px;box-shadow:0 8px 20px -8px rgba(53,208,127,.6)">このレースを自分で検証する</a>
      <span style="font:400 11px/1.6 var(--font-jp);color:var(--faint)">直近レースの封と中身、照合結果が開きます</span>
    </div>
    <details style="margin-top:13px;border-top:1px solid var(--border);padding-top:12px">
      <summary style="font:600 11.5px/1 var(--font-jp);color:var(--good-soft);display:inline-flex;align-items:center;gap:6px">詳しく — 検証の手順<span style="font-size:9px;color:var(--faint)">▼</span></summary>
      <div style="display:flex;flex-direction:column;gap:9px;margin-top:12px">
        ${CR_HOW.map((h) => `<div style="display:flex;gap:11px;align-items:baseline"><span style="flex:0 0 auto;font:700 10px/1.6 var(--font-mono);color:var(--faint)">${h.n}</span><span style="font:400 12.5px/1.75 var(--font-jp);color:var(--muted)">${h.text}</span></div>`).join('')}
      </div>
      <div style="margin-top:11px;font:400 10.5px/1.7 var(--font-jp);color:var(--faint)">その日のBURN率も、同じ値から計算し直して確かめられます。</div>
    </details>
  </section>

  <!-- ② 全体の記録 -->
  <section style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:lgFade .6s ease both">
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap">
      <h2 style="margin:0;font:800 16px/1.15 var(--font-display);letter-spacing:.14em;color:var(--text)">全体の記録</h2>
      <span style="font:400 11px/1 var(--font-mono);color:var(--faint)">全期間の合計</span>
      <span style="margin-left:auto;font:400 11px/1 var(--font-mono);color:var(--faint)">${DAYS[0]!.date} 〜 ${DAYS[DAYS.length - 1]!.date}</span>
    </div>
    <div style="display:grid;grid-template-columns:var(--sumCols);gap:9px;margin-top:14px">
      ${totals.map((s) => `<div style="${boxStyle(s.t)}"><span style="${numStyle(s.t)}">${s.n}</span><span style="font:500 9.5px/1.4 var(--font-mono);letter-spacing:.08em;color:var(--muted);margin-top:6px;display:block">${s.k}</span></div>`).join('')}
    </div>
    <div style="margin-top:16px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);padding:var(--padS);background:radial-gradient(420px 180px at 6% 0%,rgba(0,234,255,.07),transparent 70%),rgba(255,255,255,.012)">
      <div style="font:500 9.5px/1 var(--font-mono);letter-spacing:.2em;color:var(--cyan);text-transform:uppercase">CLAIMED&nbsp;↔&nbsp;CALCULATED</div>
      <div style="font:700 14px/1.5 var(--font-jp);color:var(--text);margin-top:9px">公表している数字と、公開データから計算した数字を並べます。</div>
      <div style="display:grid;grid-template-columns:var(--proofCols);gap:11px;margin-top:14px">
        ${derived.map((d) => `<div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 15px;background:rgba(255,255,255,.015)"><div style="font:500 10px/1 var(--font-mono);letter-spacing:.14em;color:var(--faint);text-transform:uppercase">${d.label}</div><div style="display:flex;align-items:flex-end;gap:14px;margin-top:12px;flex-wrap:wrap"><div><div style="font:400 9.5px/1 var(--font-mono);color:var(--faint)">公表値</div><div style="font:700 19px/1 var(--font-display);color:var(--muted);font-variant-numeric:tabular-nums;margin-top:5px">${d.claimed}</div></div><span style="font:400 14px/1 var(--font-mono);color:var(--faint);padding-bottom:3px">↔</span><div><div style="font:400 9.5px/1 var(--font-mono);color:var(--cyan)">公開データから計算</div><div style="${CALC_STYLE}">${d.calculated}</div></div></div><div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font:400 11px/1.7 var(--font-mono);color:var(--faint)">${d.formula}</div></div>`).join('')}
      </div>
      <p style="margin:13px 0 0;font:400 11.5px/1.75 var(--font-jp);color:var(--faint);line-break:strict;word-break:keep-all;text-wrap:pretty">計算値は上の累計（実際の頭数）だけから求めています。CSV をダウンロードすれば、同じ列で誰でも同じ数字を計算できます。</p>
    </div>
  </section>

  <!-- 日ごとの記録 -->
  <section id="verify" style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:lgFade .7s ease both">
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:14px">
      <h2 style="margin:0;font:800 16px/1.15 var(--font-display);letter-spacing:.14em;color:var(--text)">日ごとの記録</h2>
      <span style="font:400 11px/1 var(--font-mono);color:var(--faint)">記録のある日を選ぶと、その日の集計と検証リンクが開きます</span>
    </div>
    <div style="display:grid;grid-template-columns:var(--proofCols);gap:14px;align-items:start">
      <div style="border:1px solid var(--border);border-radius:14px;padding:13px 14px;background:linear-gradient(180deg,rgba(20,18,34,0),var(--panel))">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <button ${prev ? 'data-act="prev"' : ''} style="${navStyle(!!prev)}">‹</button>
          <span style="font:700 14px/1 var(--font-display);letter-spacing:.04em;color:var(--text)">${y}年 ${m}月</span>
          <button ${next ? 'data-act="next"' : ''} style="${navStyle(!!next)}">›</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">
          ${DOW.map((d) => `<div style="text-align:center;font:400 9px/1 var(--font-mono);color:var(--faint);padding-bottom:3px">${d}</div>`).join('')}
          ${cellsHtml}
        </div>
      </div>

      <div style="border:1px solid var(--border-strong);border-radius:var(--radius);padding:15px 17px;background:radial-gradient(500px 200px at 8% 0%,rgba(0,234,255,.08),transparent 66%),var(--panel)">
        <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
          <span style="font:800 clamp(17px,2.4vw,20px)/1 var(--font-display);letter-spacing:.02em;color:var(--text)">${dy}年${Number(dmo)}月${Number(dd)}日</span>
          <span style="font:400 11px/1 var(--font-mono);color:var(--muted)">${day.weather} / ${day.track} / ${day.surface}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:13px">
          ${dayStats.map((s) => `<div style="${inlineBoxStyle(s.t)}"><span style="${numStyle(s.t)}">${s.n}</span><span style="font:500 9.5px/1 var(--font-mono);letter-spacing:.08em;color:var(--muted)">${s.k}</span></div>`).join('')}
        </div>
        <div style="display:flex;gap:6px;margin-top:13px;flex-wrap:wrap">
          <button data-act="csv-daily" style="${STEP_STYLE}">日次CSV</button>
          <button data-act="csv-monthly" style="${STEP_STYLE}">月次CSV</button>
          <a href="#verify" style="${STEP_STYLE};text-decoration:none;display:inline-flex;align-items:center">このレースを検証 →</a>
        </div>
        <div style="margin-top:14px;border:1px solid rgba(53,208,127,.28);border-radius:var(--radius-sm);padding:13px 14px;background:linear-gradient(150deg,rgba(53,208,127,.06),transparent 70%)">
          <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
            <span style="font:700 10.5px/1 var(--font-display);letter-spacing:.16em;color:var(--good-soft)">VERIFICATION</span>
            <span style="margin-left:auto;font:700 10.5px/1 var(--font-display);color:var(--good);border:1px solid rgba(53,208,127,.45);border-radius:999px;padding:4px 10px;background:rgba(53,208,127,.1)">✓ 一致</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:9px;margin-top:12px">
            ${verifyRows.map((v) => `<div style="display:flex;justify-content:space-between;gap:14px;align-items:baseline"><span style="flex:none;font:400 10px/1.5 var(--font-mono);color:var(--faint)">${v.k}</span><span style="font:400 10.5px/1.5 var(--font-mono);color:var(--muted);word-break:break-all;text-align:right">${v.v}</span></div>`).join('')}
          </div>
          <div style="margin-top:11px;font:400 10px/1.6 var(--font-jp);color:var(--faint)">封（commit hash）はレース前に公開済みです。中身をハッシュ計算すると、封と一致します。</div>
        </div>
      </div>
    </div>
  </section>

  <!-- ④ その日の成約(折りたたみ) -->
  <details style="border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:lgFade .8s ease both">
    <summary style="display:flex;align-items:center;gap:11px;padding:var(--padS)"><span style="font-size:10px;color:var(--faint)">▶</span><h2 style="margin:0;font:800 15px/1.15 var(--font-display);letter-spacing:.14em;color:var(--text)">その日の成約</h2><span style="font:400 11px/1 var(--font-jp);color:var(--faint);margin-left:auto">実際に成立した売買（匿名表示）</span></summary>
    <div style="padding:0 var(--padS) var(--padS);display:flex;flex-direction:column;gap:2px">
      ${TRADES.map((tr) => `<div style="display:flex;align-items:center;gap:11px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 11px;background:rgba(255,255,255,.015)"><div style="flex:1;min-width:0"><div style="font:700 13px/1.2 var(--font-display);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${tr.name}</div><div style="font:400 9.5px/1.6 var(--font-mono);color:var(--muted);margin-top:2px;overflow-wrap:anywhere">${tr.flow} — <b style="color:var(--gold-bright)">${tr.price} USDT</b></div></div><span style="flex:0 0 auto;font:700 8.5px/1 var(--font-display);letter-spacing:.06em;border-radius:6px;padding:4px 8px;white-space:nowrap;${tr.mint ? 'color:var(--magenta-soft);border:1px solid rgba(255,45,196,.4);background:rgba(255,45,196,.07)' : 'color:var(--cyan);border:1px solid rgba(0,234,255,.4);background:rgba(0,234,255,.08)'}">${tr.mint ? '新規発行' : 'P2P'}</span></div>`).join('')}
      <div style="margin-top:9px;font:400 10.5px/1.7 var(--font-jp);color:var(--faint)">買い手・売り手は匿名化して表示しています。全件は日次CSVに含まれます。</div>
    </div>
  </details>

  <div style="text-align:center;font:400 10.5px/1.6 var(--font-mono);letter-spacing:.08em;color:var(--faint)">すべて実データ（transparency API）— 表示中の値は代表値（fixture）</div>
</div>`;
}

export function LedgerPreview(): React.JSX.Element {
  const [view, setView] = useState<'pc' | 'mobile'>('pc');
  const [selected, setSelected] = useState(DAYS[DAYS.length - 1]!.date);
  const [viewMonth, setViewMonth] = useState('2026-07');
  const [toast, setToast] = useState('');

  const flash = useCallback((m: string) => setToast(m), []);
  const html = useMemo(() => buildHtml(view, selected, viewMonth), [view, selected, viewMonth]);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-iso]');
    if (!el) return;
    const iso = el.getAttribute('data-iso');
    if (iso) { setSelected(iso); return; }
    const months = [...new Set(DAYS.map((d) => d.date.slice(0, 7)))].sort();
    switch (el.getAttribute('data-act')) {
      case 'mobile': setView('mobile'); break;
      case 'pc': setView('pc'); break;
      case 'prev': { const p = months.filter((x) => x < viewMonth).pop(); if (p) setViewMonth(p); break; }
      case 'next': { const n = months.filter((x) => x > viewMonth).shift(); if (n) setViewMonth(n); break; }
      case 'csv-daily': {
        const day = DAYS.find((d) => d.date === selected) ?? DAYS[DAYS.length - 1]!;
        downloadCsv(`sevendays-ledger-${day.date}.csv`, [CSV_HEADER, rowOf(day)]);
        flash('日次CSVをダウンロードしました'); break;
      }
      case 'csv-monthly': {
        const rows = DAYS.filter((d) => d.date.startsWith(viewMonth));
        downloadCsv(`sevendays-ledger-${viewMonth}.csv`, [CSV_HEADER, ...rows.map(rowOf)]);
        flash('月次CSVをダウンロードしました'); break;
      }
    }
  }, [selected, viewMonth, flash]);

  // toast auto-clear
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SCOPED_STYLE }} />
      <div className="ledgerPreview" style={VIEW_VARS[view] as React.CSSProperties} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: '26px', transform: 'translateX(-50%)', zIndex: 70, padding: '12px 20px', border: '1px solid rgba(0,234,255,.28)', borderRadius: '999px', background: 'rgba(10,7,20,.95)', color: '#eae7ff', fontFamily: "'Zen Kaku Gothic New',system-ui,sans-serif", fontWeight: 600, fontSize: '13px', boxShadow: '0 24px 60px -24px rgba(0,0,0,.8)' }}>
          {toast}
        </div>
      )}
    </>
  );
}
