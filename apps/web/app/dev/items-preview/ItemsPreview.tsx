'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * /items 2本柱再デザイン(道具部屋)— デザイナー正典 Items.html の忠実写経。
 * 🔵強くする(調教アイテム)／🔴今夜に賭ける(レースアイテム)の2本柱。色/余白/角丸/タイポの
 * 厳密値は正典が正(仕様書.md §3)。正典のインラインスタイル文字列を保持しドリフトを排除。
 *
 * ★これはプレビュー(視覚承認用)。機構(buy/gift/inventory/conditions API・効果ルール)には
 * 一切触れない。カタログ/在庫/予報は代表値(fixture)。本番結線は承認後(ItemsView・別作業)。
 */

// ── V3カタログ fixture(items-v3.ts より・15 TRAINING + 15 RACE + burn drops) ──
const TRAIN: [string, string, string, string, string, string, [string, string][]][] = [
  ['carrot_cube', 'にんじんキューブ', 'Carrot Cubes', 'BASIC', '2', '調教の確定ロールに+1.0（固定）。下振れなしの入口。', [['+1.0 固定', 'b']]],
  ['highland_hay', '高原の干し草', 'Highland Hay', 'BASIC', '3', '調教の確定ロールに+1.0〜+2.0。', [['+1.0〜+2.0', 'b']]],
  ['protein_mash', 'プロテインマッシュ', 'Protein Mash', 'STANDARD', '5', '調教の確定ロールに+2.0〜+3.5。', [['+2.0〜+3.5', 'b']]],
  ['royal_banquet', 'ロイヤルフィースト', 'Royal Banquet', 'PREMIUM', '8', '「化けさせる」主力。確定ロールに+3.0〜+5.0。', [['+3.0〜+5.0', 'b']]],
  ['masters_eye', '名伯楽の眼', 'Masters Eye', 'PREMIUM', '6', '保険：確定ロールの合計が0を下回ったら0に引き上げ（下振れ無効）。', [['下振れ無効', 's']]],
  ['farrier_kit', '装蹄キット', 'Farrier Kit', 'STANDARD', '4', 'RESTを含む確定専用：減衰無効＋さらに+1.0〜+2.0。', [['REST専用', 'm']]],
  ['foal_milk', '若駒のミルク', 'Foal Milk', 'BASIC', '3', 'LV0〜1限定：確定ロールに+2.0〜+3.0。若馬の伸び。', [['LV0〜1', 'd']]],
  ['awakening_elixir', '覚醒のエリキシル', 'Awakening Elixir', 'PREMIUM', '10', '下振れなし・振れ幅の大きい夢枠。確定ロールに+2.0〜+6.0。', [['+2.0〜+6.0', 'b']]],
  ['hill_manual', '坂路の心得', 'Hill Manual', 'BASIC', '3', 'HILLを含む確定専用：+1.5〜+2.5。', [['HILL専用', 'm']]],
  ['pool_float', 'プールの浮き具', 'Pool Float', 'BASIC', '3', 'POOLを含む確定専用：+1.5〜+2.5。', [['POOL専用', 'm']]],
  ['spar_guard', '併せ馬の防具', 'Sparring Guard', 'STANDARD', '4', 'SPARを含む確定専用：+1.5〜+2.5。', [['SPAR専用', 'm']]],
  ['gate_bell', 'ゲートの鈴', 'Gate Bell', 'BASIC', '3', 'GATEを含む確定専用：+1.5〜+2.5。', [['GATE専用', 'm']]],
  ['wood_premium', '極上ウッドチップ', 'Premium Wood Chips', 'BASIC', '3', 'WOODを含む確定専用：+1.5〜+2.5。', [['WOOD専用', 'm']]],
  ['elder_blanket', '古馬の毛布', 'Elder Blanket', 'STANDARD', '5', 'LV4以上限定：確定ロールに+2.0〜+3.5。高価値馬の防衛。', [['LV4+', 'd']]],
  ['synergy_incense', '好物の香', 'Synergy Incense', 'PREMIUM', '6', '大好物シナジーが発動した確定でボーナス2倍。', [['シナジー2倍', 's']]],
];
const RACE: [string, string, string, string, string, string, string, string][] = [
  ['rain_cape', '雨のケープ', 'Rain Cape', '2', '雨系（雨・嵐）への備え・弱。', '雨系', '+1.5', '−1.0'],
  ['storm_armor', '嵐の完全装具', 'Storm Armor', '5', '雨系への備え・強。', '雨系', '+2.0', '−2.0'],
  ['sun_visor', '陽よけのバイザー', 'Sun Visor', '2', '晴れ系（晴れ・曇り）への備え・弱。', '晴れ系', '+1.5', '−1.0'],
  ['solar_silks', '快晴の勝負服', 'Solar Silks', '5', '晴れ系への備え・強。', '晴れ系', '+2.0', '−2.0'],
  ['mud_shoes', '道悪蹄鉄', 'Mud Shoes', '2', '道悪系（稍重・不良）への備え・弱。', '道悪系', '+1.5', '−1.0'],
  ['mud_plates', '重馬場プレート', 'Mud Plates', '5', '道悪系への備え・強。', '道悪系', '+2.0', '−2.0'],
  ['speed_calks', '快速カルクス', 'Speed Calks', '2', '良系（高速・良）への備え・弱。', '良系', '+1.5', '−1.0'],
  ['glass_plates', '良馬場プレート', 'Glass Plates', '5', '良系への備え・強。', '良系', '+2.0', '−2.0'],
  ['full_harness', '完全装備', 'Full Harness', '8', '天候と馬場を1つずつ選んで備える。両的中で器の頂点（+4）へ。', '両軸', '+2.0', '−2.0'],
  ['storm_eye', '嵐の眼', 'Eye of the Storm', '3', 'ピンポイント：嵐のみ的中。', '嵐', '+2.0', '−1.5'],
  ['clear_plume', '快晴の羽根飾り', 'Clear-Sky Plume', '3', 'ピンポイント：晴れのみ的中。', '晴れ', '+2.0', '−1.5'],
  ['deep_tread', '不良の深爪', 'Deep Treads', '3', 'ピンポイント：不良馬場のみ的中。', '不良', '+2.0', '−1.5'],
  ['firm_grip', '堅良のグリップ', 'Firm Grip', '3', 'ピンポイント：高速馬場のみ的中。', '高速', '+2.0', '−1.5'],
  ['field_kit', '野営一式', 'Field Kit', '4', '両軸・弱。天候と馬場を1つずつ選んで軽く備える。', '両軸', '+1.5', '−1.0'],
  ['steady_tack', '堅実な馬具', 'Steady Tack', '4', '両軸の適性を0未満にしない保険。得意を伸ばさず苦手を消すだけ。', '保険', 'floor 0', '—'],
];
const HIST: [string, string, string, string, string][] = [
  ['07/05', '晴れ', '良', '芝', 'SUNNY'], ['07/06', '雨', '不良', 'ダート', 'RAIN'],
  ['07/07', '曇り', '稍重', '芝', 'CLOUDY'], ['07/08', '嵐', '不良', '芝', 'STORM'],
];
const WX_COLOR: Record<string, string> = { SUNNY: '#f2e4bf', CLOUDY: '#8f8ac2', RAIN: '#7fb8ff', STORM: '#c9b3ff' };
const WX_CHAR: Record<string, string> = { SUNNY: '晴', CLOUDY: '曇', RAIN: '雨', STORM: '嵐' };
const PROB: Record<string, [string, number, string][]> = {
  '天候': [['晴れ', .4, '#f2e4bf'], ['曇り', .3, '#8f8ac2'], ['雨', .2, '#7fb8ff'], ['嵐', .1, '#c9b3ff']],
  '馬場': [['高速', .25, '#a9b6c8'], ['良', .4, '#a9b6c8'], ['稍重', .25, '#a9b6c8'], ['不良', .1, '#a9b6c8']],
  'コース': [['芝', .6, '#9dc7a8'], ['ダート', .4, '#cbb089']],
};

const TOKENS: Record<string, string> = {
  '--bg': '#050409', '--panel': '#12101d', '--panel-2': '#16132a', '--panel-3': '#1b1730',
  '--border': 'rgba(255,255,255,.08)', '--border-cyan': 'rgba(0,234,255,.28)', '--border-gold': 'rgba(201,168,106,.34)',
  '--text': '#eae7ff', '--muted': '#8f8ac2', '--faint': '#5a5580',
  '--cyan': '#00eaff', '--cyan-deep': '#0088a0', '--magenta': '#ff2dc4', '--magenta-soft': '#ff8fe4',
  '--gold': '#c9a86a', '--gold-bright': '#f2e4bf', '--good': '#35d07f', '--good-soft': '#9dffc4', '--bad': '#ff5c5c', '--warn': '#e6b24a',
  '--radius': '16px', '--radius-sm': '11px', '--radius-xs': '8px', '--shadow': '0 24px 60px -24px rgba(0,0,0,.8)',
  '--font-display': "'Orbitron',system-ui,sans-serif",
  '--font-sans': "'Space Grotesk','Zen Kaku Gothic New',system-ui,sans-serif",
  '--font-jp': "'Zen Kaku Gothic New',system-ui,sans-serif",
  '--font-mono': "'IBM Plex Mono',ui-monospace,monospace",
};
const KEYFRAMES = `
@keyframes itFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.it-scope summary{cursor:pointer;list-style:none}.it-scope summary::-webkit-details-marker{display:none}
@media (prefers-reduced-motion:reduce){.it-scope *{animation:none!important}}
`;

interface State { view: 'pc' | 'mobile'; trainBand: string; toast: string; }

function buildHtml(st: State): string {
  const tab = (on: boolean) =>
    'appearance:none;padding:6px 15px;border:none;border-radius:999px;cursor:pointer;font:700 12px/1 var(--font-jp);' +
    (on ? 'background:var(--cyan);color:#04141a' : 'background:transparent;color:var(--muted)');
  const buyStyle = (accent: 'cyan' | 'gold') =>
    'width:100%;padding:11px;border-radius:var(--radius-xs);border:none;cursor:pointer;font:700 13px/1 var(--font-display);letter-spacing:.05em;color:#04141a;' +
    (accent === 'cyan'
      ? 'background:linear-gradient(100deg,var(--cyan),#5ff5ff 60%,var(--cyan));box-shadow:0 8px 20px -8px rgba(0,234,255,.6)'
      : 'background:linear-gradient(100deg,var(--gold),var(--gold-bright) 60%,var(--gold));box-shadow:0 8px 20px -8px rgba(201,168,106,.55);color:#1a1408');
  const tagStyle = (k: string) => {
    const m = { b: ['var(--good-soft)', 'rgba(53,208,127,.35)', 'rgba(53,208,127,.08)'], s: ['var(--cyan)', 'var(--border-cyan)', 'rgba(0,234,255,.06)'], m: ['var(--muted)', 'var(--border)', 'rgba(255,255,255,.03)'], d: ['var(--gold-bright)', 'var(--border-gold)', 'rgba(201,168,106,.08)'] }[k]!;
    return `font:600 10px/1 var(--font-mono);letter-spacing:.04em;border-radius:5px;padding:4px 8px;white-space:nowrap;color:${m[0]};border:1px solid ${m[1]};background:${m[2]}`;
  };

  // 🔵 調教
  const bandLabel: Record<string, string> = { ALL: 'すべて', BASIC: 'ベーシック 2–3', STANDARD: 'スタンダード 4–5', PREMIUM: 'プレミアム 6–10' };
  const trainBands = ['ALL', 'BASIC', 'STANDARD', 'PREMIUM'].map((b) =>
    `<button data-act="band" data-v="${b}" style="font:700 11.5px/1 var(--font-jp);cursor:pointer;border-radius:999px;padding:6px 13px;border:1px solid ${st.trainBand === b ? 'var(--cyan)' : 'var(--border)'};background:${st.trainBand === b ? 'rgba(0,234,255,.08)' : 'rgba(10,8,22,.5)'};color:${st.trainBand === b ? 'var(--cyan)' : 'var(--muted)'}">${bandLabel[b]}</button>`).join('');
  const trainItems = TRAIN.filter((t) => st.trainBand === 'ALL' || t[3] === st.trainBand).map((t) => {
    const tags = t[6].map((g) => `<span style="${tagStyle(g[1])}">${g[0]}</span>`).join('');
    return `
      <div style="display:flex;flex-direction:column;border:1px solid var(--border);border-top:2px solid rgba(0,234,255,.5);border-radius:var(--radius-sm);background:linear-gradient(165deg,rgba(0,234,255,.045),var(--panel-2));overflow:hidden">
        <div style="padding:13px 14px 0"><img src="/items/${t[0]}.webp" alt="" loading="lazy" style="display:block;width:100%;aspect-ratio:1;border-radius:10px;object-fit:cover;border:1px solid var(--border-cyan);background:radial-gradient(circle at 50% 40%,rgba(0,234,255,.13),rgba(10,8,22,.7))"></div>
        <div style="padding:11px 14px 0;display:flex;justify-content:space-between;gap:9px;align-items:flex-start">
          <div style="min-width:0"><div style="font:700 15px/1.2 var(--font-display);color:var(--text)">${t[1]}</div><div style="font:400 10.5px/1 var(--font-mono);color:var(--faint);margin-top:5px;letter-spacing:.04em">${t[2]}</div></div>
          <div style="flex:0 0 auto;font:800 18px/1 var(--font-display);color:var(--gold-bright);font-variant-numeric:tabular-nums">${t[4]}<span style="font:500 9px/1 var(--font-mono);color:var(--faint);margin-left:2px">USDT</span></div>
        </div>
        <div style="padding:11px 14px 0;flex:1 1 auto"><div style="font-size:12.5px;line-height:1.55;color:var(--muted);font-family:var(--font-jp)">${t[5]}</div></div>
        <div style="padding:11px 14px 0;display:flex;flex-wrap:wrap;gap:6px">${tags}</div>
        <div style="padding:13px 14px"><button data-act="buy" data-name="${t[1]}" style="${buyStyle('cyan')}">購入する</button></div>
      </div>`;
  }).join('');

  // 🔴 レース
  const affColor = (a: string) => (({ '雨系': '#7fb8ff', '晴れ系': '#f2e4bf', '道悪系': '#c9a86a', '良系': '#9dc7a8', '両軸': '#c9b3ff', '嵐': '#c9b3ff', '晴れ': '#f2e4bf', '不良': '#c9a86a', '高速': '#a9b6c8', '保険': '#8f8ac2' } as Record<string, string>)[a] ?? '#8f8ac2');
  const raceItems = RACE.map((t) => {
    const c = affColor(t[5]);
    return `
      <div style="display:flex;flex-direction:column;border:1px solid var(--border);border-top:2px solid rgba(201,168,106,.55);border-radius:var(--radius-sm);background:linear-gradient(165deg,rgba(201,168,106,.05),var(--panel-2));overflow:hidden">
        <div style="padding:13px 14px 0;position:relative">
          <img src="/items/${t[0]}.webp" alt="" loading="lazy" style="display:block;width:100%;aspect-ratio:1;border-radius:10px;object-fit:cover;border:1px solid var(--border-gold);background:radial-gradient(circle at 50% 40%,rgba(201,168,106,.15),rgba(10,8,22,.7))">
          <span style="font:700 11px/1 var(--font-jp);border-radius:6px;padding:5px 9px;white-space:nowrap;color:${c};border:1px solid ${c}66;background:rgba(8,6,16,.82);backdrop-filter:blur(3px);box-shadow:0 2px 8px -2px #000;position:absolute;top:20px;left:21px">${t[5]}</span>
        </div>
        <div style="padding:11px 14px 0;display:flex;justify-content:space-between;gap:9px;align-items:flex-start">
          <div style="min-width:0"><div style="font:700 14px/1.2 var(--font-display);color:var(--text)">${t[1]}</div><div style="font:400 10px/1 var(--font-mono);color:var(--faint);margin-top:4px">${t[2]}</div></div>
          <div style="flex:0 0 auto;font:800 18px/1 var(--font-display);color:var(--gold-bright);font-variant-numeric:tabular-nums">${t[3]}<span style="font:500 9px/1 var(--font-mono);color:var(--faint);margin-left:2px">USDT</span></div>
        </div>
        <div style="padding:11px 14px 0;flex:1 1 auto"><div style="font-size:12px;line-height:1.5;color:var(--muted);font-family:var(--font-jp)">${t[4]}</div></div>
        <div style="margin:12px 14px 0;display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border-radius:var(--radius-xs);overflow:hidden">
          <div style="padding:8px 10px;background:rgba(53,208,127,.08);text-align:center"><div style="font:400 8.5px/1 var(--font-mono);letter-spacing:.1em;color:var(--good);text-transform:uppercase;margin-bottom:4px">的中</div><div style="font:800 15px/1 var(--font-display);color:var(--good-soft)">${t[6]}</div></div>
          <div style="padding:8px 10px;background:rgba(143,138,194,.08);text-align:center"><div style="font:400 8.5px/1 var(--font-mono);letter-spacing:.1em;color:var(--muted);text-transform:uppercase;margin-bottom:4px">外れ</div><div style="font:800 15px/1 var(--font-display);color:var(--muted)">${t[7]}</div></div>
        </div>
        <div style="padding:12px 14px"><button data-act="buy" data-name="${t[1]}" style="${buyStyle('gold')}">購入する</button></div>
      </div>`;
  }).join('');

  const last = HIST[HIST.length - 1]!;
  const probAxes = Object.entries(PROB).map(([label, rows]) => `
    <div>
      <div style="font:400 9.5px/1 var(--font-mono);letter-spacing:.14em;color:var(--faint);text-transform:uppercase;margin-bottom:8px">${label}</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${rows.map((r) => `<div style="display:flex;align-items:center;gap:8px">
          <span style="flex:0 0 42px;font:600 11px/1 var(--font-jp);color:${r[2]}">${r[0]}</span>
          <span style="flex:1 1 auto;height:5px;border-radius:3px;background:rgba(255,255,255,.07);overflow:hidden"><span style="display:block;height:100%;width:${Math.round(r[1] * 100)}%;background:${r[2]};border-radius:3px"></span></span>
          <span style="flex:0 0 auto;font:500 10px/1 var(--font-mono);color:var(--faint);font-variant-numeric:tabular-nums">${Math.round(r[1] * 100)}%</span>
        </div>`).join('')}
      </div>
    </div>`).join('');

  // カレンダー(7月・fixture)
  const byDate: Record<string, string[]> = {};
  HIST.forEach((h) => { byDate[h[0]] = h; });
  const dow = ['日', '月', '火', '水', '木', '金', '土'];
  const calDow = dow.map((d) => `<div style="text-align:center;font:600 9px/1 var(--font-mono);color:var(--faint);padding-bottom:2px">${d}</div>`).join('');
  let calCells = '';
  for (let i = 0; i < 3; i++) calCells += `<div style="aspect-ratio:1"></div>`;
  for (let d = 1; d <= 31; d++) {
    const key = '07/' + String(d).padStart(2, '0');
    const h = byDate[key];
    const today = d === 8;
    const mark = h ? WX_CHAR[h[4]!]! : (today ? '?' : '');
    const color = h ? WX_COLOR[h[4]!]! : 'var(--faint)';
    calCells += `<div style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;border-radius:7px;border:1px solid ${today ? 'var(--border-gold)' : 'var(--border)'};background:${today ? 'rgba(201,168,106,.08)' : 'rgba(255,255,255,.015)'}"><span style="font:400 8px/1 var(--font-mono);color:var(--faint)">${d}</span><span style="font:700 13px/1 var(--font-jp);color:${color}">${mark}</span></div>`;
  }

  // マイアイテム
  const nameByKey: Record<string, [string, string, string]> = {};
  TRAIN.forEach((t) => { nameByKey[t[0]] = [t[1], '調教アイテム', 'cyan']; });
  RACE.forEach((t) => { nameByKey[t[0]] = [t[1], 'レースアイテム', 'gold']; });
  const dot = (c: string) => `flex:0 0 auto;width:9px;height:30px;border-radius:2px;background:${c === 'cyan' ? 'linear-gradient(180deg,var(--cyan),var(--cyan-deep))' : 'linear-gradient(180deg,var(--gold-bright),var(--gold))'}`;
  const ownedKeys: Record<string, number> = { carrot_cube: 3, storm_armor: 1, mud_plates: 1 };
  const ownedArr = Object.entries(ownedKeys).map(([k, n]) => { const m = nameByKey[k] ?? [k, 'アイテム', 'cyan']; return { key: k, name: m[0], kind: m[1], n, dotStyle: dot(m[2]) }; });
  const owned = ownedArr.map((o) => `
    <div style="display:flex;align-items:center;gap:11px;border:1px solid var(--border);border-radius:var(--radius-sm);padding:11px 13px;background:rgba(255,255,255,.015)">
      <span style="${o.dotStyle}"></span>
      <img src="/items/${o.key}.webp" alt="" loading="lazy" style="flex:0 0 auto;width:38px;height:38px;border-radius:9px;object-fit:cover;border:1px solid var(--border);background:rgba(10,8,22,.6)">
      <div style="flex:1 1 auto;min-width:0"><div style="font:700 13px/1.2 var(--font-display);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${o.name}</div><div style="font-size:10.5px;color:var(--faint);font-family:var(--font-jp);margin-top:3px">${o.kind}</div></div>
      <span style="flex:0 0 auto;font:700 13px/1 var(--font-mono);color:var(--gold-bright)">×${o.n}</span>
    </div>`).join('');

  const burnDrops = [
    ['keepsake_shoe', '形見の蹄鉄', 'Keepsake Shoe', '完全装備と同じ両軸の備えを1回。'],
    ['farewell_wreath', '追悼の花冠', 'Farewell Wreath', '調教の確定ロールに+2.0〜+4.0。'],
    ['testament_mane', '遺志のたてがみ', 'Testament Mane', '確定ロールの合計が0未満なら0に引き上げ。'],
    ['roar_soul', '咆哮の魂', 'Roar Soul', '大好物メニューを含む確定専用：+3.0〜+5.0。'],
    ['aeon_sand', '星霜の砂', 'Aeon Sand', '使った瞬間から減衰を2レース分無効。'],
  ].map((b) => `
    <div style="display:flex;flex-direction:column;border:1px solid rgba(255,92,92,.24);border-top:2px solid rgba(255,92,92,.6);border-radius:var(--radius-sm);background:linear-gradient(165deg,rgba(255,92,92,.055),var(--panel-2));overflow:hidden">
      <div style="padding:12px 13px 0;position:relative">
        <img src="/items/${b[0]}.webp" alt="" loading="lazy" style="display:block;width:100%;aspect-ratio:1;border-radius:10px;object-fit:cover;border:1px solid rgba(255,92,92,.28);background:radial-gradient(circle at 50% 40%,rgba(255,92,92,.14),rgba(10,8,22,.7))">
        <span style="position:absolute;top:19px;left:20px;font:700 8.5px/1 var(--font-display);letter-spacing:.06em;color:var(--bad);border:1px solid rgba(255,92,92,.5);border-radius:5px;padding:3px 7px;white-space:nowrap;background:rgba(8,6,16,.82);backdrop-filter:blur(3px)">非売品</span>
      </div>
      <div style="padding:11px 13px 0"><div style="font:700 14px/1.2 var(--font-display);color:var(--text)">${b[1]}</div><div style="font:400 10px/1 var(--font-mono);color:var(--faint);margin-top:4px">${b[2]}</div></div>
      <div style="padding:8px 13px 13px;flex:1 1 auto"><div style="font-size:11.5px;line-height:1.5;color:var(--muted);font-family:var(--font-jp)">${b[3]}</div></div>
    </div>`).join('');

  const txns = [
    ['購入', '嵐の完全装具', 'ショップで購入', '+1', 'var(--good-soft)', 'rgba(53,208,127,.35)', 'rgba(53,208,127,.08)', '07/06 12:00'],
    ['受取', 'にんじんキューブ', 'friend@example.com から', '+2', 'var(--good-soft)', 'rgba(53,208,127,.35)', 'rgba(53,208,127,.08)', '07/07 09:30'],
    ['使用', '芝の名手の鞍', '→ Golden Wind', '-1', 'var(--muted)', 'var(--border)', 'rgba(255,255,255,.03)', '07/08 10:10'],
  ].map((t) => `
    <div style="display:flex;align-items:center;gap:11px;border-top:1px solid var(--border);padding:11px 2px">
      <span style="flex:0 0 auto;font:700 9.5px/1 var(--font-display);letter-spacing:.06em;border-radius:5px;padding:4px 8px;color:${t[4]};border:1px solid ${t[5]};background:${t[6]}">${t[0]}</span>
      <span style="flex:1 1 auto;min-width:0;font:700 13px/1.2 var(--font-display);color:var(--text)">${t[1]}<span style="font:400 11px/1 var(--font-jp);color:var(--faint);margin-left:9px">${t[2]}</span></span>
      <span style="font:700 13px/1 var(--font-mono);color:${t[4]}">${t[3]}</span>
      <span style="font-size:10.5px;color:var(--faint);font-family:var(--font-mono)">${t[7]}</span>
    </div>`).join('');

  const toastHtml = st.toast
    ? `<div style="position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:70;padding:12px 20px;border:1px solid var(--border-cyan);border-radius:999px;background:rgba(10,7,20,.95);color:var(--text);font:600 13px/1 var(--font-jp);box-shadow:var(--shadow);animation:itFade .25s ease both">${st.toast}</div>`
    : '';

  return `
  <div style="position:fixed;top:14px;right:14px;z-index:80;display:flex;gap:2px;padding:3px;border:1px solid var(--border);border-radius:999px;background:rgba(10,7,20,.92);backdrop-filter:blur(8px);box-shadow:var(--shadow)">
    <button data-act="setMobile" style="${tab(st.view === 'mobile')}">モバイル</button>
    <button data-act="setPc" style="${tab(st.view === 'pc')}">PC</button>
  </div>
  <div style="max-width:var(--colW);margin:0 auto;padding:22px var(--padX) 96px;display:flex;flex-direction:column;gap:18px">

    <header style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow)">
      <div style="font:700 11px/1 var(--font-mono);letter-spacing:.34em;color:var(--muted);text-transform:uppercase;margin-bottom:9px">ITEMS</div>
      <h1 style="margin:0;font:800 clamp(24px,4vw,34px)/1.04 var(--font-display);letter-spacing:.05em;color:var(--text)">道具部屋</h1>
      <p style="margin:11px 0 15px;max-width:60ch;color:var(--muted);font-size:13px;font-family:var(--font-jp);line-height:1.75">アイテムは2種類。効果はすべて公開ルールです。</p>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:11px">
        <a href="#pillar-train" style="display:flex;gap:12px;align-items:flex-start;padding:14px 15px;border:1px solid var(--border-cyan);border-radius:var(--radius-sm);background:linear-gradient(150deg,rgba(0,234,255,.07),transparent 70%)">
          <span style="flex:0 0 auto;width:10px;height:40px;border-radius:3px;background:linear-gradient(180deg,var(--cyan),var(--cyan-deep));box-shadow:0 0 12px rgba(0,234,255,.5)"></span>
          <div><div style="font:700 14px/1.2 var(--font-display);letter-spacing:.03em;color:var(--text)">強くする</div><div style="font-size:12px;color:var(--muted);font-family:var(--font-jp);margin-top:4px;line-height:1.5">調教アイテム。馬を永続的に強くする（総合値に合流）。</div></div>
        </a>
        <a href="#pillar-race" style="display:flex;gap:12px;align-items:flex-start;padding:14px 15px;border:1px solid var(--border-gold);border-radius:var(--radius-sm);background:linear-gradient(150deg,rgba(201,168,106,.08),transparent 70%)">
          <span style="flex:0 0 auto;width:10px;height:40px;border-radius:3px;background:linear-gradient(180deg,var(--gold-bright),var(--gold));box-shadow:0 0 12px rgba(201,168,106,.45)"></span>
          <div><div style="font:700 14px/1.2 var(--font-display);letter-spacing:.03em;color:var(--text)">今夜に賭ける</div><div style="font-size:12px;color:var(--muted);font-family:var(--font-jp);margin-top:4px;line-height:1.5">レースアイテム。予報を読んで条件に備える（的中で適性↑・外れで↓）。</div></div>
        </a>
      </div>
    </header>

    <section id="pillar-train" style="border:1px solid var(--border-cyan);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,rgba(0,234,255,.035),var(--panel));box-shadow:var(--shadow);animation:itFade .5s ease both">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="width:6px;height:38px;border-radius:3px;background:linear-gradient(180deg,var(--cyan),var(--cyan-deep));box-shadow:0 0 14px rgba(0,234,255,.5)"></span>
        <div style="flex:1 1 auto"><div style="font:700 10px/1 var(--font-mono);letter-spacing:.24em;color:var(--cyan)">STRENGTHEN</div><h2 style="margin:4px 0 0;font:800 20px/1 var(--font-display);letter-spacing:.04em;color:var(--text)">強くする — 調教アイテム</h2></div>
        <span style="font-size:11.5px;color:var(--muted);font-family:var(--font-jp);text-align:right;max-width:24ch">馬を永続的に強くする（総合値に合流・ソフトキャップ85）</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:7px;margin:15px 0 14px">${trainBands}</div>
      <div style="display:grid;grid-template-columns:var(--shelfCols);gap:12px">${trainItems}</div>
    </section>

    <section id="pillar-race" style="border:1px solid var(--border-gold);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,rgba(201,168,106,.04),var(--panel));box-shadow:var(--shadow);animation:itFade .6s ease both">
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <span style="width:6px;height:38px;border-radius:3px;background:linear-gradient(180deg,var(--gold-bright),var(--gold));box-shadow:0 0 14px rgba(201,168,106,.45)"></span>
        <div style="flex:1 1 auto"><div style="font:700 10px/1 var(--font-mono);letter-spacing:.24em;color:var(--gold)">BET ON TONIGHT</div><h2 style="margin:4px 0 0;font:800 20px/1 var(--font-display);letter-spacing:.04em;color:var(--text)">今夜に賭ける — レースアイテム</h2></div>
        <span style="font-size:11.5px;color:var(--muted);font-family:var(--font-jp);text-align:right;max-width:26ch">予報を読んで条件に備える（的中で適性が上限側へ・外れで下限側へ）</span>
      </div>

      <div style="margin-top:15px;border:1px solid var(--border);border-radius:var(--radius-sm);background:rgba(10,8,22,.5);padding:14px 15px">
        <div style="display:flex;flex-wrap:wrap;gap:14px 22px;align-items:center">
          <div style="flex:0 0 auto"><div style="font:400 9.5px/1 var(--font-mono);letter-spacing:.16em;color:var(--faint);text-transform:uppercase;margin-bottom:6px">直近のレース条件 · ${last[0]}</div>
            <div style="display:flex;align-items:center;gap:8px"><span style="font:800 20px/1 var(--font-display);color:${WX_COLOR[last[4]]}">${last[1]}</span><span style="font:500 12px/1 var(--font-mono);color:var(--muted)">${last[2]} / ${last[3]}</span></div>
          </div>
          <div style="width:1px;height:40px;background:var(--border)"></div>
          <div style="flex:0 0 auto"><div style="font:400 9.5px/1 var(--font-mono);letter-spacing:.16em;color:var(--faint);text-transform:uppercase;margin-bottom:6px">次のレースの条件</div>
            <div style="display:flex;align-items:baseline;gap:9px"><span style="font:800 22px/1 var(--font-display);color:var(--gold-bright)">?</span><span style="font-size:11px;color:var(--muted);font-family:var(--font-jp)">発走まで誰にも分かりません</span></div>
          </div>
        </div>
        <div style="margin-top:13px;padding-top:13px;border-top:1px solid var(--border);display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px">${probAxes}</div>
        <details style="margin-top:12px">
          <summary style="font:600 11.5px/1 var(--font-jp);color:var(--cyan);display:inline-flex;align-items:center;gap:6px">条件の履歴を見る（カレンダー）<span style="font-size:9px;color:var(--faint)">▼</span></summary>
          <div style="margin-top:12px;display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${calDow}${calCells}</div>
          <div style="margin-top:9px;font-size:10.5px;color:var(--faint);font-family:var(--font-jp);line-height:1.6">各レース（朝8:00／夜20:00 GMT+8）で公開された条件の履歴。抽選は毎回独立です。</div>
        </details>
      </div>

      <div style="display:grid;grid-template-columns:var(--shelfCols);gap:12px;margin-top:15px">${raceItems}</div>
    </section>

    <section style="border:1px solid var(--border);border-radius:var(--radius);padding:var(--padS);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:itFade .7s ease both">
      <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <h2 style="margin:0;font:800 18px/1 var(--font-display);letter-spacing:.04em;color:var(--text)">マイアイテム</h2>
        <span style="font-size:11.5px;color:var(--muted);font-family:var(--font-mono)">所持 ${ownedArr.length}種 · 適用予定 1件</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">${owned}</div>
      <div style="margin-top:11px;display:flex;flex-direction:column;gap:7px">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px 11px;border:1px dashed var(--border);border-radius:var(--radius-xs);padding:9px 12px">
          <span style="font:700 8.5px/1 var(--font-display);letter-spacing:.06em;color:var(--cyan);border:1px solid var(--border-cyan);border-radius:5px;padding:3px 7px">適用予定</span>
          <b style="font:700 13px/1.2 var(--font-display);color:var(--text)">芝の名手の鞍</b>
          <span style="font-size:11px;color:var(--muted);font-family:var(--font-jp)">→ Golden Wind</span>
          <span style="margin-left:auto;font:500 11px/1 var(--font-mono);color:var(--faint)">07/08 のレース</span>
        </div>
      </div>
      <div style="margin-top:11px;display:flex;align-items:center;gap:11px;border:1px solid rgba(255,92,92,.4);border-radius:var(--radius-sm);padding:11px 13px;background:linear-gradient(150deg,rgba(255,92,92,.1),transparent 72%)">
        <span style="flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:var(--bad);box-shadow:0 0 10px rgba(255,92,92,.7)"></span>
        <div style="flex:1 1 auto"><div style="font:700 13px/1.2 var(--font-display);color:var(--bad)">形見の蹄鉄</div><div style="font-size:10.5px;color:var(--muted);font-family:var(--font-jp);margin-top:3px">記念品 — Burnした馬の形見。買えません・譲れません。</div></div>
        <span style="flex:0 0 auto;font:700 13px/1 var(--font-mono);color:var(--bad)">×1</span>
      </div>

      <details style="margin-top:11px;border:1px solid rgba(255,92,92,.34);border-radius:var(--radius-sm);background:linear-gradient(150deg,rgba(255,92,92,.06),transparent 72%)">
        <summary style="display:flex;align-items:center;gap:10px;padding:13px 15px;font:700 13px/1 var(--font-display);letter-spacing:.03em;color:var(--bad)"><span style="font-size:9px;color:var(--faint)">▶</span>BURNで授与される記念品<span style="font:400 11px/1 var(--font-jp);color:var(--faint);margin-left:auto">買えません・譲れません（Burn時に1つ授与）</span></summary>
        <div style="padding:0 15px 15px;display:grid;grid-template-columns:var(--shelfCols);gap:10px">${burnDrops}</div>
      </details>

      <details style="margin-top:15px;border:1px solid var(--border);border-radius:var(--radius-sm);background:rgba(255,255,255,.012)">
        <summary style="display:flex;align-items:center;gap:10px;padding:13px 15px;font:700 13px/1 var(--font-display);letter-spacing:.03em;color:var(--text)"><span style="font-size:9px;color:var(--faint)">▶</span>仲間に贈る<span style="font:400 11px/1 var(--font-jp);color:var(--faint);margin-left:auto">所持アイテムをまとめて贈れます</span></summary>
        <div style="padding:0 15px 15px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
          <label style="flex:1 1 200px;font:500 10.5px/1 var(--font-jp);color:var(--muted)">相手のメールアドレス<input placeholder="friend@example.com" style="display:block;width:100%;margin-top:6px;font:400 13px/1 var(--font-sans);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px 11px;background:rgba(10,8,22,.5)"></label>
          <label style="flex:1 1 160px;font:500 10.5px/1 var(--font-jp);color:var(--muted)">贈るアイテム<input placeholder="選択…" style="display:block;width:100%;margin-top:6px;font:400 13px/1 var(--font-sans);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:10px 11px;background:rgba(10,8,22,.5)"></label>
          <button data-act="gift" style="flex:0 0 auto;padding:11px 20px;border-radius:var(--radius-xs);border:1px solid rgba(255,45,196,.5);background:rgba(255,45,196,.1);color:var(--magenta-soft);font:700 13px/1 var(--font-display);letter-spacing:.04em;cursor:pointer">贈る</button>
        </div>
        <div style="padding:0 15px 15px;font-size:10.5px;color:var(--faint);font-family:var(--font-jp);line-height:1.6">送付は即時確定で取り消せません。登録済みのメールアドレス宛にのみ届きます（1日20回まで）。</div>
      </details>
    </section>

    <details style="border:1px solid var(--border);border-radius:var(--radius);background:linear-gradient(180deg,var(--panel-2),var(--panel));box-shadow:var(--shadow);animation:itFade .8s ease both">
      <summary style="display:flex;align-items:center;gap:12px;padding:var(--padS)"><span style="font-size:10px;color:var(--faint)">▶</span><h2 style="margin:0;font:800 16px/1 var(--font-display);letter-spacing:.04em;color:var(--text)">アイテム履歴</h2><span style="font-size:11px;color:var(--muted);font-family:var(--font-jp);margin-left:auto">もらった · 送った · 使った · 購入</span></summary>
      <div style="padding:0 var(--padS) var(--padS)">${txns}</div>
    </details>

    <div style="text-align:center;font:400 10.5px/1.6 var(--font-mono);letter-spacing:.08em;color:var(--faint)">効果・価格・確率は公開ルール（V3カタログ）— 在庫・履歴は代表値（fixture）</div>
  </div>
  ${toastHtml}`;
}

export function ItemsPreview() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'pc' | 'mobile'>('pc');
  const [trainBand, setTrainBand] = useState('ALL');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const html = buildHtml({ view, trainBand, toast });

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'setMobile') setView('mobile');
      else if (act === 'setPc') setView('pc');
      else if (act === 'band') setTrainBand(el.dataset.v ?? 'ALL');
      else if (act === 'buy') flash(`${el.dataset.name ?? 'アイテム'} を購入しました。厩舎の馬詳細から使えます。`);
      else if (act === 'gift') flash('ギフトを送りました（プレビュー）。');
    },
    [flash],
  );

  const viewVars =
    view === 'mobile'
      ? { '--colW': '402px', '--padX': '16px', '--padS': '15px', '--shelfCols': 'repeat(2,1fr)' }
      : {
          '--colW': '1040px',
          '--padX': 'clamp(14px,4vw,26px)',
          '--padS': 'clamp(15px,2.6vw,22px)',
          '--shelfCols': 'repeat(auto-fill,minmax(210px,1fr))',
        };

  return (
    <div
      className="it-scope"
      ref={rootRef}
      onClick={onClick}
      style={{
        ...TOKENS,
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
