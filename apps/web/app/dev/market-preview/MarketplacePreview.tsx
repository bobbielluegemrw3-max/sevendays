'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * /market 3幕再デザイン(マーケットプレイス)— デザイナー正典 Marketplace.html の忠実写経。
 * 色/余白/角丸/タイポ/アニメの厳密値は正典が正(仕様書.md §2)。正典のインラインスタイル文字列を
 * そのまま保持してドリフトを排除する。fixture(代表値)・本番は API 値へ差し替え。
 *
 * ★これはプレビュー(視覚承認用)。経済機構(キュー/割当/精算/価格ラダー/Market Lock)には触れない。
 * 手放し手数料 5% は表示のみ(PRE_RACE_RELEASE_FEE_RATE=0.05・裏機構は別途休眠実装済み)。
 */

// ── 正典の定数(§renderVals) ────────────────────────────────────────────────
const LADDER = [100, 110, 121, 133.1, 146.41, 161.05, 177.16]; // PRICE_TABLE_V1
const RELEASE_FEE = 0.05;
const CHAMP_DAY = 7;
const BALANCE = 6480;
const PRESETS = [200, 600, 1000, 2000, 6000];
const ART = (n: string) => `/horses/nft/${n}_full.png`;

const fmt = (n: number) => n.toFixed(2);
const commas = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const receive = (p: number) => fmt(Math.floor(p * (1 - RELEASE_FEE) * 100) / 100);
// 総合値ティア色(tv-tier近似): 金/銀/シアン/翠/鉄
const tvColor = (v: number) =>
  v >= 170 ? '#f2e4bf' : v >= 150 ? '#cfe0f5' : v >= 130 ? '#a9f6ff' : v >= 110 ? '#9dffc4' : '#8f8ac2';
const tvStyle = (v: number) =>
  `font:800 14px/1 var(--font-display);font-variant-numeric:tabular-nums;color:${tvColor(v)}`;

const raceLabel = (day: number) => {
  const l = CHAMP_DAY - day;
  return l <= 1
    ? 'あと 1 走で走破 ＝ チャンピオン 200 に届きます'
    : `あと ${l} 走で走破 ＝ チャンピオン 200`;
};

interface Apt {
  label: string;
  grade: string;
}
interface MineHorse {
  id: string;
  name: string;
  art: string;
  gen: number;
  day: number;
  dayStr: string;
  overall: number;
  lv: number;
  apt: Apt[];
  record: string;
  trackPct: string;
  priceStr: string;
  receiveStr: string;
  giveMain: string;
}
interface Listed {
  id: string;
  name: string;
  art: string;
  mode: string;
}

function makeMine(
  id: string,
  name: string,
  art: string,
  gen: number,
  day: number,
  overall: number,
  lv: number,
  apt: Apt[],
  record: string,
): MineHorse {
  const price = LADDER[day]!;
  return {
    id,
    name,
    art: ART(art),
    gen,
    day,
    dayStr: `DAY ${day}`,
    overall,
    lv,
    apt,
    record,
    trackPct: `${Math.round((day / 6) * 100)}%`,
    priceStr: fmt(price),
    receiveStr: receive(price),
    giveMain: raceLabel(day),
  };
}

const INITIAL_MINE: MineHorse[] = [
  makeMine('h1', 'ソゴ・ノヴァ', 'v8', 214, 6, 187, 7, [{ label: '芝', grade: '◎' }, { label: '道悪', grade: '○' }], '6 戦 6 生存'),
  makeMine('h2', 'カゲロウ・ブルー', 'v7', 188, 3, 142, 4, [{ label: 'ダート', grade: '◎' }, { label: '晴', grade: '○' }], '3 戦 3 生存'),
];
const INITIAL_LISTED: Listed[] = [{ id: 'l1', name: 'テツ・オーレン', art: ART('v5'), mode: 'スマート出品' }];

const POOL_FIXTURE = [
  { art: 'v8', name: 'ソラノ・ハテ', overall: 168, lv: 6 },
  { art: 'v5', name: 'リン・ドーロ', overall: 142, lv: 5 },
  { art: 'v7', name: 'アオ・グラス', overall: 121, lv: 3 },
  { art: 'v8', name: 'ノゾミ・カゼ', overall: 155, lv: 5 },
  { art: 'v5', name: 'クロ・ハガネ', overall: 109, lv: 2 },
  { art: 'v7', name: 'ハルカ・ミナモ', overall: 133, lv: 4 },
  { art: 'v8', name: 'テン・ノ・ヤ', overall: 177, lv: 7 },
  { art: 'v5', name: 'シズカ・ウミ', overall: 114, lv: 3 },
];
const FEED_FIXTURE = [
  { kind: 'SOLD', name: 'ソラノ・ハテ', buyer: 'U-8f3a', priceStr: '133.10', time: '07-24 20:00' },
  { kind: '新規発行', name: 'テン・ノ・ヤ', buyer: 'U-2c91', priceStr: '102.00', time: '07-24 20:00' },
  { kind: 'SOLD', name: 'リン・ドーロ', buyer: 'U-77b0', priceStr: '146.41', time: '07-24 08:00' },
  { kind: '新規発行', name: 'アオ・グラス', buyer: 'U-4e12', priceStr: '102.00', time: '07-24 08:00' },
  { kind: 'SOLD', name: 'ハルカ・ミナモ', buyer: 'U-a055', priceStr: '121.00', time: '07-23 08:00' },
];

// ── 正典の :root トークン(ラッパー要素に載せて全体へ cascade・グローバル汚染を避ける) ──
const TOKENS = {
  '--bg': '#050409',
  '--bg-2': '#0a0714',
  '--panel': '#12101d',
  '--panel-2': '#16132a',
  '--border': 'rgba(255,255,255,.08)',
  '--border-strong': 'rgba(0,234,255,.28)',
  '--text': '#eae7ff',
  '--muted': '#8f8ac2',
  '--faint': '#5a5580',
  '--cyan': '#00eaff',
  '--cyan-deep': '#0088a0',
  '--magenta': '#ff2dc4',
  '--magenta-soft': '#ff8fe4',
  '--gold': '#c9a86a',
  '--gold-bright': '#f2e4bf',
  '--good': '#35d07f',
  '--good-soft': '#9dffc4',
  '--bad': '#ff5c5c',
  '--warn': '#e6b24a',
  '--radius': '16px',
  '--radius-sm': '11px',
  '--radius-xs': '8px',
  '--shadow': '0 24px 60px -24px rgba(0,0,0,.8)',
  '--font-display': "'Orbitron',system-ui,sans-serif",
  '--font-sans': "'Space Grotesk','Zen Kaku Gothic New',system-ui,sans-serif",
  '--font-jp': "'Zen Kaku Gothic New',system-ui,sans-serif",
  '--font-mono': "'IBM Plex Mono',ui-monospace,monospace",
} as const;

// keyframes / @property / reduced-motion はスタイルシートが要る(グローバルだが無害)。
const KEYFRAMES = `
@keyframes mpBeat{0%,100%{opacity:1}50%{opacity:.6}}
@keyframes mpFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes mpSheen{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
@property --featAngle{syntax:'<angle>';initial-value:0deg;inherits:false}
@keyframes featSpin{to{--featAngle:360deg}}
/* 出走予定カードの回転する光の枠線(正典 §2-1・featSpin conic-gradient ::before) */
.mp-scope .mpFeat{position:relative;isolation:isolate}
.mp-scope .mpFeat::before{content:'';position:absolute;inset:0;border-radius:12px;padding:1px;pointer-events:none;z-index:2;background:conic-gradient(from var(--featAngle,0deg),transparent 0deg,rgba(0,234,255,0) 44deg,#00eaff 84deg,#fff 96deg,#00eaff 108deg,rgba(0,234,255,0) 150deg,transparent 360deg);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;animation:featSpin 5s linear infinite}
@media (prefers-reduced-motion:reduce){.mp-scope *{animation:none!important}}
`;

const hhmmss = (s: number) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

interface Vals {
  view: 'pc' | 'mobile';
  amount: number;
  toast: string;
  mine: MineHorse[];
  listed: Listed[];
  releaseId: string | null;
  checked: boolean;
}

// 正典テンプレート(4218-4457)の写経: vals から HTML 文字列を組む。
// インラインスタイルは正典どおり保持。data-act で委譲。
function buildHtml(v: Vals): string {
  const amt = v.amount;
  const valid = amt >= 100 && amt <= BALANCE;

  const tab = (on: boolean) =>
    'appearance:none;padding:6px 15px;border:none;border-radius:999px;cursor:pointer;font:700 12px/1 var(--font-jp);' +
    (on ? 'background:var(--cyan);color:#04141a' : 'background:transparent;color:var(--muted)');

  const preset = (val: number) =>
    'font:700 12px/1 var(--font-display);cursor:pointer;border-radius:999px;padding:6px 14px;transition:border-color .15s ease;border:1px solid ' +
    (amt === val ? 'var(--cyan)' : 'var(--border)') +
    ';background:' +
    (amt === val ? 'rgba(0,234,255,.06)' : 'rgba(10,8,22,.5)') +
    ';color:var(--text)' +
    (amt === val ? ';box-shadow:0 0 0 2px rgba(0,234,255,.25)' : '');

  const presetsHtml = [
    ...PRESETS.map(
      (val) =>
        `<button data-act="preset" data-v="${val}" style="${preset(val)}">${val.toLocaleString('en-US')}$</button>`,
    ),
    `<button data-act="preset" data-v="${BALANCE}" style="${preset(BALANCE)}">全額</button>`,
  ].join('');

  const pool = POOL_FIXTURE.map((p, i) => ({ ...p, rank: i + 1 }));
  const poolHtml = pool
    .map(
      (h) => `
      <div class="mpFeat" style="border:1px solid var(--border);border-radius:12px;background:linear-gradient(160deg,rgba(255,255,255,.02),var(--panel-2));padding:11px 11px 13px;text-align:center">
        <span style="position:absolute;top:-8px;left:-6px;font:400 9px/1 var(--font-mono);color:var(--faint);background:#0a0816;border:1px solid var(--border);border-radius:5px;padding:2px 6px;z-index:3">#${h.rank}</span>
        <div style="width:104px;height:104px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid var(--border)">
          <img src="${ART(h.art)}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
        <div style="font:700 12px/1.3 var(--font-display);color:var(--text);margin-top:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${h.name}</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:7px">
          <span style="display:inline-flex;align-items:baseline;gap:4px;white-space:nowrap"><span style="font:400 8px/1 var(--font-mono);letter-spacing:.14em;color:var(--faint)">総合値</span><b style="${tvStyle(h.overall)}">${h.overall}</b></span>
          <span style="font:700 9.5px/1 var(--font-mono);letter-spacing:.06em;color:var(--muted)">LV${h.lv}</span>
        </div>
      </div>`,
    )
    .join('');

  const mineHtml = v.mine
    .map((h) => {
      const apt = h.apt
        .map(
          (a) =>
            `<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--radius-xs);background:rgba(255,255,255,.02);font:600 11px/1 var(--font-jp);color:var(--muted);white-space:nowrap">${a.label}<b style="color:var(--gold-bright);font-family:var(--font-mono);font-size:12px">${a.grade}</b></span>`,
        )
        .join('');
      return `
      <div style="position:relative;border:1px solid rgba(201,168,106,.32);border-radius:var(--radius);background:linear-gradient(158deg,#1c1733 0%,var(--panel) 62%,#0c0a16 100%);box-shadow:0 30px 70px -42px #000,inset 0 1px 0 rgba(242,228,191,.13);overflow:hidden">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(242,228,191,.6),transparent)"></div>
        <div style="display:flex;gap:15px;padding:17px 17px 13px;flex-wrap:wrap">
          <div style="flex:0 0 auto;width:96px;height:96px;border-radius:14px;overflow:hidden;border:1px solid rgba(201,168,106,.4);box-shadow:0 0 0 3px rgba(201,168,106,.07),0 14px 30px -14px #000;position:relative">
            <img src="${h.art}" alt="" style="width:100%;height:100%;object-fit:cover">
            <div style="position:absolute;inset:0;background:linear-gradient(150deg,rgba(242,228,191,.14),transparent 46%)"></div>
          </div>
          <div style="flex:1 1 200px;min-width:0">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
              <div style="min-width:0">
                <div style="font:800 19px/1.15 var(--font-display);letter-spacing:.03em;color:var(--gold-bright);text-shadow:0 1px 12px rgba(242,228,191,.15)">${h.name}</div>
                <div style="font:500 10.5px/1 var(--font-mono);color:var(--faint);margin-top:6px;letter-spacing:.08em">GEN ${h.gen} ・ ${h.dayStr}</div>
              </div>
              <span style="flex:0 0 auto;font:700 11px/1 var(--font-display);letter-spacing:.06em;color:var(--gold-bright);border:1px solid rgba(201,168,106,.4);border-radius:6px;padding:5px 9px;background:rgba(201,168,106,.1)">${h.dayStr}</span>
            </div>
            <div style="display:flex;align-items:flex-end;gap:18px;margin-top:12px">
              <div>
                <div style="font:400 9px/1 var(--font-mono);letter-spacing:.14em;color:var(--faint);text-transform:uppercase">総合値</div>
                <div style="font:800 27px/1 var(--font-display);color:var(--gold-bright);font-variant-numeric:tabular-nums;margin-top:4px;text-shadow:0 0 16px rgba(242,228,191,.3)">${h.overall}</div>
              </div>
              <div style="width:1px;height:30px;background:var(--border)"></div>
              <div>
                <div style="font:400 9px/1 var(--font-mono);letter-spacing:.14em;color:var(--faint);text-transform:uppercase">レベル</div>
                <div style="font:800 27px/1 var(--font-display);color:var(--cyan);font-variant-numeric:tabular-nums;margin-top:4px">${h.lv}</div>
              </div>
            </div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:0 17px 13px">
          ${apt}
          <span style="margin-left:auto;font:600 11px/1 var(--font-mono);letter-spacing:.04em;color:var(--good-soft)">${h.record}</span>
        </div>
        <div style="margin:0 17px 15px;padding:13px 15px;border:1px solid var(--border);border-radius:var(--radius-sm);background:rgba(255,255,255,.015)">
          <div style="display:flex;justify-content:space-between;font:500 10px/1 var(--font-mono);color:var(--faint);margin-bottom:9px">
            <span>発行 100.00</span><span style="color:var(--gold-bright)">走破 200.00</span>
          </div>
          <div style="height:7px;border-radius:4px;background:rgba(255,255,255,.08);overflow:hidden">
            <div style="height:100%;width:${h.trackPct};background:linear-gradient(90deg,var(--gold),var(--gold-bright));box-shadow:0 0 10px rgba(242,228,191,.4)"></div>
          </div>
          <div style="text-align:center;margin-top:9px;font:400 11px/1 var(--font-jp);color:var(--muted)">現在値 <b style="font:800 15px/1 var(--font-display);color:var(--text)">${h.priceStr}</b> USDT（生存で +10% / 日）</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;margin:0 12px;background:var(--border);border-radius:var(--radius-sm);overflow:hidden">
          <div style="padding:14px 15px;background:var(--panel)">
            <div style="font:400 10px/1 var(--font-mono);letter-spacing:.12em;color:var(--faint);text-transform:uppercase;margin-bottom:9px">今 手放すと</div>
            <div style="font-size:10.5px;color:var(--muted);font-family:var(--font-jp);margin-bottom:3px">受け取る</div>
            <div style="font:800 25px/1 var(--font-display);color:var(--text);font-variant-numeric:tabular-nums">${h.receiveStr}<span style="font-size:11px;color:var(--faint);font-weight:500;font-family:var(--font-mono)"> USDT</span></div>
            <div style="font-size:10.5px;color:var(--faint);font-family:var(--font-mono);margin-top:6px">現在値 ${h.priceStr} − 手数料 5%</div>
          </div>
          <div style="padding:14px 15px;background:rgba(201,168,106,.05)">
            <div style="font:400 10px/1 var(--font-mono);letter-spacing:.12em;color:var(--gold);text-transform:uppercase;margin-bottom:9px">走り続ければ</div>
            <div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:7px">
              <span style="font-size:15px;line-height:1.1;filter:saturate(.7)">🏆</span>
              <span style="font-size:12.5px;line-height:1.4;color:var(--gold-bright);font-family:var(--font-jp)">${h.giveMain}</span>
            </div>
            <div style="font-size:11.5px;color:var(--muted);font-family:var(--font-jp)">＋ 生存するたび 価値 +10% / 日</div>
          </div>
        </div>
        <div style="padding:14px 12px 16px">
          <button data-act="release" data-id="${h.id}" style="width:100%;padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-strong);background:rgba(255,255,255,.04);color:var(--text);font:700 13px/1 var(--font-display);letter-spacing:.06em;cursor:pointer">この馬を手放す</button>
        </div>
      </div>`;
    })
    .join('');

  const badge = (m: string) =>
    'font:700 9px/1 var(--font-display);letter-spacing:.06em;border-radius:5px;padding:3px 7px;white-space:nowrap;' +
    (m === 'スマート出品'
      ? 'color:var(--cyan);border:1px solid rgba(0,234,255,.4);background:rgba(0,234,255,.07)'
      : 'color:var(--muted);border:1px solid var(--border);background:rgba(255,255,255,.02)');

  const listedHtml = v.listed.length
    ? `
    <div style="font:700 10.5px/1 var(--font-mono);letter-spacing:.14em;color:var(--faint);text-transform:uppercase;margin:20px 0 11px">手放し待ち — 次の清算で買い手を待っています</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${v.listed
        .map(
          (h) => `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:9px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 13px">
          <div style="flex:0 0 auto;width:42px;height:42px;border-radius:9px;overflow:hidden;border:1px solid var(--border);filter:grayscale(.35) brightness(.9)">
            <img src="${h.art}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
          <span style="font:700 14px/1.2 var(--font-display);color:var(--text)">${h.name}</span>
          <span style="${badge(h.mode)}">${h.mode}</span>
          <span style="font:400 11px/1.5 var(--font-mono);color:var(--faint)">出走停止中 — DAY／価値は凍結されます</span>
          <span style="flex:1"></span>
          <button data-act="return" data-id="${h.id}" style="flex:0 0 auto;padding:8px 13px;border-radius:var(--radius-xs);border:1px solid rgba(255,45,196,.5);background:rgba(255,45,196,.1);color:var(--magenta-soft);font:700 12px/1 var(--font-display);letter-spacing:.04em;cursor:pointer">厩舎に戻す</button>
        </div>`,
        )
        .join('')}
    </div>`
    : '';

  const kind = (k: string) => {
    const c =
      k === 'SOLD'
        ? { t: 'var(--good-soft)', b: 'rgba(53,208,127,.4)', bg: 'rgba(53,208,127,.1)' }
        : { t: 'var(--gold-bright)', b: 'rgba(201,168,106,.5)', bg: 'rgba(201,168,106,.1)' };
    return `flex:0 0 auto;font:700 9.5px/1 var(--font-display);letter-spacing:.08em;border-radius:5px;padding:4px 8px;color:${c.t};border:1px solid ${c.b};background:${c.bg}`;
  };
  const feedHtml = FEED_FIXTURE.map(
    (f) => `
      <div style="display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);padding:11px 2px;font-family:var(--font-mono)">
        <span style="${kind(f.kind === 'SOLD' ? 'SOLD' : 'MINT')}">${f.kind}</span>
        <span style="flex:1;min-width:0;font:700 13px/1.2 var(--font-display);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</span>
        <span style="font:700 14px/1 var(--font-display);color:var(--gold-bright);font-variant-numeric:tabular-nums">${f.priceStr}</span>
        <span style="font-size:11px;color:var(--faint)">→ ${f.buyer}</span>
        <span style="font-size:11px;color:var(--faint)">${f.time}</span>
      </div>`,
  ).join('');

  const acquireStyle =
    'flex:0 0 auto;border:none;border-radius:10px;padding:11px 22px;font:700 13px/1 var(--font-display);letter-spacing:.05em;cursor:' +
    (valid ? 'pointer' : 'not-allowed') +
    ';color:#04141a;background:linear-gradient(100deg,var(--cyan),#5ff5ff 55%,var(--cyan));box-shadow:0 10px 24px -8px rgba(0,234,255,.7);opacity:' +
    (valid ? '1' : '.5');

  // ── モーダル(手放し確認) ──
  const target = v.mine.find((x) => x.id === v.releaseId);
  const checkBoxStyle =
    'flex:0 0 auto;width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font:800 13px/1 var(--font-mono);border:1px solid ' +
    (v.checked ? 'var(--cyan)' : 'var(--border-strong)') +
    ';background:' +
    (v.checked ? 'var(--cyan)' : 'transparent') +
    ';color:#04141a';
  const confirmStyle =
    'padding:11px 22px;border-radius:var(--radius-sm);font:700 13px/1 var(--font-display);letter-spacing:.05em;cursor:' +
    (v.checked ? 'pointer' : 'not-allowed') +
    ';border:1px solid ' +
    (v.checked ? 'var(--border-strong)' : 'var(--border)') +
    ';background:' +
    (v.checked ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.02)') +
    ';color:' +
    (v.checked ? 'var(--text)' : 'var(--faint)') +
    ';opacity:' +
    (v.checked ? '1' : '.6');
  const modalHtml = target
    ? `
    <div data-act="closeRelease" style="position:fixed;inset:0;z-index:60;background:rgba(3,2,8,.78);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:16px;animation:mpFade .22s ease both">
      <div data-act="stop" style="width:min(470px,100%);background:linear-gradient(180deg,var(--panel-2),var(--panel));border:1px solid var(--border-strong);border-radius:var(--radius);padding:22px;box-shadow:var(--shadow)">
        <div style="display:flex;align-items:center;gap:13px;margin-bottom:6px">
          <div style="flex:0 0 auto;width:48px;height:48px;border-radius:11px;overflow:hidden;border:1px solid rgba(201,168,106,.4)">
            <img src="${target.art}" alt="" style="width:100%;height:100%;object-fit:cover"></div>
          <div style="min-width:0">
            <div style="font:400 10.5px/1 var(--font-mono);letter-spacing:.1em;color:var(--faint);text-transform:uppercase">手放しの確認</div>
            <div style="font:700 17px/1.25 var(--font-display);letter-spacing:.04em;color:var(--gold-bright);margin-top:4px">${target.name} を手放しますか？</div>
          </div>
        </div>
        <div style="border:1px solid rgba(230,178,74,.5);background:rgba(230,178,74,.08);border-radius:var(--radius-sm);padding:12px 14px;margin:14px 0;font:400 12.5px/1.75 var(--font-jp);color:var(--warn)">
          手放すと <b>次のレースから出走しません</b>。次の清算で買い手が付けば <b style="color:var(--gold-bright)">${target.receiveStr} USDT</b> を受け取ります（手数料 5% 込み）。付かなければ厩舎に戻せます。出品操作は馬ごとに 1 日 1 回です。
        </div>
        <label data-act="toggleCheck" style="display:flex;align-items:flex-start;gap:11px;font:400 12.5px/1.5 var(--font-jp);color:var(--text);cursor:pointer">
          <span style="${checkBoxStyle}">${v.checked ? '✓' : ''}</span>
          <span>手放すと、この馬は <b style="color:var(--gold-bright)">チャンピオンを目指せなくなる</b> ことを理解しました。</span>
        </label>
        <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end">
          <button data-act="closeRelease" style="padding:11px 18px;border-radius:var(--radius-sm);border:1px solid rgba(255,45,196,.5);background:rgba(255,45,196,.1);color:var(--magenta-soft);font:700 13px/1 var(--font-display);letter-spacing:.05em;cursor:pointer">キャンセル</button>
          <button data-act="confirmRelease" style="${confirmStyle}">手放す</button>
        </div>
      </div>
    </div>`
    : '';

  const toastHtml = v.toast
    ? `<div style="position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:70;padding:12px 20px;border:1px solid var(--border-strong);border-radius:999px;background:rgba(10,7,20,.95);color:var(--text);font:600 13px/1 var(--font-jp);box-shadow:var(--shadow);animation:mpFade .25s ease both">${v.toast}</div>`
    : '';

  return `
  <div style="position:fixed;top:14px;right:14px;z-index:80;display:flex;gap:2px;padding:3px;border:1px solid var(--border);border-radius:999px;background:rgba(10,7,20,.92);backdrop-filter:blur(8px);box-shadow:var(--shadow)">
    <button data-act="setMobile" style="${tab(v.view === 'mobile')}">モバイル</button>
    <button data-act="setPc" style="${tab(v.view === 'pc')}">PC</button>
  </div>
  <div style="max-width:var(--colW);margin:0 auto;padding:22px var(--padX) 96px;display:flex;flex-direction:column;gap:18px">

    <header style="position:relative;overflow:hidden;border:1px solid var(--border);border-radius:20px;background:radial-gradient(120% 130% at 50% 128%,rgba(0,234,255,.16),transparent 55%),linear-gradient(180deg,#0c0918,#070510);box-shadow:var(--shadow)">
      <div style="position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0,transparent 62px,rgba(0,234,255,.04) 62px,rgba(0,234,255,.04) 63px);mask:linear-gradient(180deg,transparent 40%,#000 130%)"></div>
      <div style="position:absolute;left:0;right:0;bottom:0;height:1px;background:linear-gradient(90deg,transparent,rgba(0,234,255,.7),rgba(255,45,196,.5),transparent)"></div>
      <div style="position:absolute;top:0;left:0;right:0;height:100%;pointer-events:none;overflow:hidden"><div style="position:absolute;top:0;bottom:0;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.045),transparent);animation:mpSheen 7s ease-in-out infinite"></div></div>
      <div style="position:relative;padding:var(--padH)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:clamp(14px,2.5vw,26px)">
          <div style="display:inline-flex;align-items:center;gap:10px">
            <span style="width:9px;height:20px;border-radius:2px;background:linear-gradient(180deg,var(--cyan),var(--magenta));box-shadow:0 0 12px rgba(0,234,255,.6)"></span>
            <span style="display:flex;flex-direction:column;line-height:.9"><span style="font:500 7px/1 var(--font-mono);letter-spacing:.3em;color:var(--muted)">SEVEN DAYS</span><span style="font:800 15px/1 var(--font-display);letter-spacing:.1em;color:var(--text)">DERBY</span></span>
          </div>
          <span style="display:inline-flex;align-items:center;gap:7px;font:700 9.5px/1 var(--font-mono);letter-spacing:.14em;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:6px 12px"><span style="width:6px;height:6px;border-radius:50%;background:#ff3b5c;box-shadow:0 0 8px rgba(255,59,92,.9);animation:mpBeat 1.5s ease-in-out infinite"></span>NIGHT&nbsp;SETTLEMENT</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:20px">
          <div style="min-width:220px">
            <div style="font:700 11px/1 var(--font-mono);letter-spacing:.34em;color:var(--cyan);text-transform:uppercase;margin-bottom:11px">MARKETPLACE</div>
            <h1 style="margin:0;font:900 clamp(30px,5.5vw,46px)/1 var(--font-display);letter-spacing:.04em;color:var(--text)">マーケットプレイス</h1>
            <p style="margin:12px 0 0;max-width:40ch;color:var(--muted);font-size:13px;font-family:var(--font-jp);line-height:1.7">朝 8:00・夜 20:00（GMT+8）の清算で、馬が厩舎を出入りします。次の清算までに、今夜の顔ぶれを整えましょう。</p>
          </div>
          <div style="flex:0 0 auto;text-align:right">
            <div style="font:700 10px/1 var(--font-mono);letter-spacing:.2em;color:var(--faint);text-transform:uppercase;margin-bottom:9px">次の清算まで</div>
            <div data-countdown style="font:900 clamp(38px,7.5vw,64px)/.92 var(--font-display);letter-spacing:.01em;color:var(--cyan);text-shadow:0 0 34px rgba(0,234,255,.5);font-variant-numeric:tabular-nums">${hhmmss(13330)}</div>
          </div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:10px 22px;margin-top:clamp(16px,2.6vw,26px);padding-top:15px;border-top:1px solid var(--border)">
          <span style="font:500 11px/1 var(--font-mono);color:var(--faint)">次のバッチ <b style="color:var(--text);font-weight:600">夜 20:00 GMT+8</b></span>
          <span style="font:500 11px/1 var(--font-mono);color:var(--faint)">出走予定 <b style="color:var(--text);font-weight:600">164 頭</b></span>
          <span style="font:500 11px/1 var(--font-mono);color:var(--faint)">今夜の清算 <b style="color:var(--gold-bright);font-weight:600">${FEED_FIXTURE.length} 件</b></span>
          <span style="margin-left:auto;font:500 11px/1 var(--font-jp);color:var(--faint)">残高 <b style="color:var(--gold-bright);font-weight:600;font-family:var(--font-mono)">${commas(BALANCE)}</b> USDT</span>
        </div>
      </div>
    </header>

    <section style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:mpFade .5s ease both">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="width:6px;height:38px;border-radius:3px;background:linear-gradient(180deg,var(--cyan),var(--magenta));box-shadow:0 0 14px rgba(0,234,255,.5)"></span>
        <div><div style="font:700 10px/1 var(--font-mono);letter-spacing:.28em;color:var(--cyan)">ACT&nbsp;01</div><h2 style="margin:4px 0 0;font:800 21px/1 var(--font-display);letter-spacing:.05em;text-transform:none;color:var(--text)">馬を迎える</h2></div>
        <span style="margin-left:auto;font-size:11.5px;color:var(--muted);font-family:var(--font-jp)">次のレースに向けて、あたらしい馬を迎える</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:11px;border:1px solid var(--border);border-radius:14px;padding:16px;background:rgba(10,8,22,.6);margin-top:15px">
        <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div style="font:800 13px/1.3 var(--font-display);letter-spacing:.04em;color:var(--text)">プール予約 — 予算いっぱい馬を迎える</div>
          <div style="font:500 12px/1 var(--font-mono);color:var(--muted)">残高 <b style="color:var(--gold-bright);font-weight:600">${commas(BALANCE)}</b> USDT</div>
        </div>
        <p style="margin:0;font:400 12.5px/1.7 var(--font-jp);color:var(--muted)">予算額をロックすると、次のレース（朝8:00／夜20:00）のバッチで、出品馬 → 新規発行（102 USDT）の順に予算のかぎり自動で割り当てられます。総合値は割り当てられて初めて分かります — 同じ予算でも、迎える馬は一頭ごとに違います。</p>
        <div style="display:flex;gap:7px;flex-wrap:wrap">${presetsHtml}</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input data-input="amount" value="${amt ? String(amt) : ''}" inputmode="numeric" placeholder="金額を自由入力（最低100・上限は残高）" style="flex:1;min-width:180px;font:500 14px/1 var(--font-mono);color:var(--text);border:1px solid var(--border);border-radius:10px;padding:11px 12px;background:rgba(10,8,22,.5)">
          <button data-act="acquire" style="${acquireStyle}">予約する</button>
        </div>
      </div>
      <div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:20px">
        <h3 style="margin:0;font:700 14px/1 var(--font-display);letter-spacing:.06em;color:var(--text)">次回のレースに出走予定の馬</h3>
        <span style="font:500 11px/1 var(--font-mono);color:var(--muted);text-align:right">指名購入はありません — 一斉マッチング（先着順）で公平に成立</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:11px;margin-top:13px">${poolHtml}</div>
      <p style="margin:12px 0 0;font:400 11.5px/1.7 var(--font-mono);color:var(--faint)">表示は先頭 ${pool.length} 頭 ・ ほか 156 頭が出走予定。予約すると、この中の馬か新規発行馬が割り当たります。</p>
    </section>

    <section style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:mpFade .6s ease both">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="width:6px;height:38px;border-radius:3px;background:linear-gradient(180deg,var(--gold-bright),var(--gold));box-shadow:0 0 14px rgba(201,168,106,.45)"></span>
        <div><div style="font:700 10px/1 var(--font-mono);letter-spacing:.28em;color:var(--gold)">ACT&nbsp;02</div><h2 style="margin:4px 0 0;font:800 21px/1 var(--font-display);letter-spacing:.05em;text-transform:none;color:var(--text)">馬を手放す</h2></div>
        <span style="margin-left:auto;font-size:11.5px;color:var(--muted);font-family:var(--font-jp)">育てた馬を売って、利益を確定する</span>
      </div>
      <div style="font:700 10.5px/1 var(--font-mono);letter-spacing:.14em;color:var(--faint);text-transform:uppercase;margin:16px 0 12px">出品可能なあなたの馬</div>
      <div style="display:flex;flex-direction:column;gap:15px">${mineHtml}</div>
      ${listedHtml}
      <p style="margin:16px 0 0;font:400 11.5px/1.75 var(--font-jp);color:var(--faint)">保証はありません。次の清算で買い手が付けば成約、付かなければ厩舎に戻せます（手放し中はレースに出走しません）。価格は当日のLV価格で固定。出品操作は馬ごとに 1 日 1 回です。</p>
    </section>

    <section style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:mpFade .7s ease both">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:6px">
        <span style="width:6px;height:38px;border-radius:3px;background:linear-gradient(180deg,var(--muted),var(--faint))"></span>
        <div><div style="font:700 10px/1 var(--font-mono);letter-spacing:.28em;color:var(--muted)">ACT&nbsp;03</div><h2 style="margin:4px 0 0;font:800 21px/1 var(--font-display);letter-spacing:.05em;text-transform:none;color:var(--text)">今夜／直近の清算</h2></div>
        <span style="margin-left:auto;font-size:11.5px;color:var(--muted);font-family:var(--font-jp)">馬が厩舎を出入りした記録</span>
      </div>
      ${feedHtml}
      <p style="margin:12px 0 0;font:400 11px/1.6 var(--font-jp);color:var(--faint);text-align:center">実際に成約した清算のみを表示しています</p>
    </section>

    <div style="text-align:center;font:400 10.5px/1.6 var(--font-mono);letter-spacing:.08em;color:var(--faint)">価格・順位・残高は代表値（fixture）— 本番は API 値へ差し替え</div>
  </div>
  ${modalHtml}
  ${toastHtml}`;
}

export function MarketplacePreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const secsRef = useRef(13330);
  const [view, setView] = useState<'pc' | 'mobile'>('pc');
  const [amount, setAmount] = useState(600);
  const [toast, setToast] = useState('');
  const [mine, setMine] = useState<MineHorse[]>(INITIAL_MINE);
  const [listed, setListed] = useState<Listed[]>(INITIAL_LISTED);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2600);
  }, []);

  // カウントダウンは ref+DOM直更新(React再レンダーを起こさない=入力フォーカス保持)
  useEffect(() => {
    const t = setInterval(() => {
      secsRef.current = secsRef.current > 0 ? secsRef.current - 1 : 0;
      const el = rootRef.current?.querySelector('[data-countdown]');
      if (el) el.textContent = hhmmss(secsRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const html = buildHtml({ view, amount, toast, mine, listed, releaseId, checked });

  // innerHTML 再構築後、金額入力のフォーカス/キャレットを復元(タイプ中に外れない)
  const wasEditingAmount = useRef(false);
  useEffect(() => {
    if (wasEditingAmount.current) {
      const input = rootRef.current?.querySelector<HTMLInputElement>('[data-input="amount"]');
      if (input) {
        input.focus();
        const end = input.value.length;
        input.setSelectionRange(end, end);
      }
      wasEditingAmount.current = false;
    }
    // カウントダウンは再構築で初期文字列に戻るので現在値へ即同期
    const el = rootRef.current?.querySelector('[data-countdown]');
    if (el) el.textContent = hhmmss(secsRef.current);
  }, [html]);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      const id = el.dataset.id;
      if (act === 'stop') return;
      if (act === 'setMobile') setView('mobile');
      else if (act === 'setPc') setView('pc');
      else if (act === 'preset') setAmount(Number(el.dataset.v));
      else if (act === 'acquire') {
        if (amount >= 100 && amount <= BALANCE)
          flash(`${commas(amount)} USDT ぶんを予約しました — 夜 20:00 の清算で割り当てます`);
      } else if (act === 'release') {
        setReleaseId(id ?? null);
        setChecked(false);
      } else if (act === 'return') {
        const h = listed.find((x) => x.id === id);
        setListed((s) => s.filter((x) => x.id !== id));
        if (h) flash(`${h.name} を厩舎に戻しました`);
      } else if (act === 'closeRelease') {
        setReleaseId(null);
        setChecked(false);
      } else if (act === 'toggleCheck') setChecked((c) => !c);
      else if (act === 'confirmRelease') {
        const h = mine.find((x) => x.id === releaseId);
        if (!h || !checked) return;
        setMine((s) => s.filter((x) => x.id !== h.id));
        setListed((s) => [{ id: h.id, name: h.name, art: h.art, mode: '手動出品' }, ...s]);
        setReleaseId(null);
        setChecked(false);
        flash(`${h.name} を手放しました — 次の清算を待ちます`);
      }
    },
    [amount, checked, flash, listed, mine, releaseId],
  );

  const onInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.dataset.input === 'amount') {
      wasEditingAmount.current = true;
      const raw = (t as HTMLInputElement).value.replace(/[^0-9]/g, '');
      setAmount(Math.min(BALANCE, parseInt(raw, 10) || 0));
    }
  }, []);

  // view に応じた列幅トークン(正典 applyView)。ラッパーに載せて cascade。
  const viewVars =
    view === 'mobile'
      ? { '--colW': '402px', '--padX': '16px', '--padS': '15px', '--padH': '18px' }
      : {
          '--colW': '1040px',
          '--padX': 'clamp(14px,4vw,26px)',
          '--padS': 'clamp(15px,2.6vw,22px)',
          '--padH': 'clamp(18px,3vw,26px)',
        };

  return (
    <div
      className="mp-scope"
      ref={rootRef}
      onClick={onClick}
      onInput={onInput}
      style={{
        ...(TOKENS as Record<string, string>),
        ...viewVars,
        minHeight: '100vh',
        color: 'var(--text)',
        fontFamily: 'var(--font-sans)',
        lineHeight: 1.6,
        WebkitFontSmoothing: 'antialiased',
        background:
          'radial-gradient(900px 500px at 50% -8%,#1a0b2e 0%,#0a0714 46%,var(--bg) 100%),var(--bg)',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
