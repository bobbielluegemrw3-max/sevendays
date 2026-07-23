'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import s from '../../horse-page-preview.module.css';

/* ============================================================================
 * /dev/horse-page-preview — 馬個別ページ 再デザイン(新デザイナーV2ハンドオフ)
 *
 * ★同梱正典 Horse Page Composition.html を全体そのまま写経(4状態×PC/モバイル)。
 *   マストヘッド / A アート / B 馬柱 / ③C/D 備える / E 文脈 を構造・インラインstyle・
 *   状態機械まで一致させる。推測での改変はしない。
 *   - アートだけは静的PNGでなく実 NftHorseArt(canvas・変更禁止部品)を埋め込む。
 *   - Decision(2026-07-23): アイテムはレース直前まで何度でも差し替え自由(調教本体はA案)。
 * 本番結線時: B は実 FormPanel(variant="v2")＋実データ、C/D は実V3パネルに置換。
 * R1: 生値なし・+デルタは演出用の代表値(確定+3/装着+1/装備+2)。
 * ========================================================================== */

type StateKey = 'active' | 'rookie' | 'grail' | 'listed';
type Vp = 'pc' | 'mobile';

/** CSSテキスト(正典からの写経)→ React style オブジェクト。 */
function css(text: string): CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    const v = decl.slice(i + 1).trim();
    if (!k) continue;
    const camel = k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_m: string, ch: string) => ch.toUpperCase());
    o[camel] = v;
  }
  return o;
}

interface RunRow { weather: string; ground: string; course: string; rank: number; entrants: number; m: number; }
interface ReadRow { name: string; runsText: string; hint: 'strong' | 'weak' | 'even' | 'unknown'; label: string; }
interface Breeder { name: string; pct: number; delta: string; you: boolean; }
interface Horse {
  kana: string; en: string; type: string; rarity: string; rarKey: string;
  day: number; total: number | null; dna: string; dnaText: string; seedText: string;
  statusLabel: string; statusKey: 'active' | 'listed'; groupLabel: string;
  forecast: { axis: string; val: string }[];
  runs: RunRow[]; reads: ReadRow[];
  verdict: { cls: 'strong' | 'weak' | 'even' | 'unknown'; mark: string; head: string; sub: string };
  band: { text: string; note: string; key: 'safe' } | null;
  isRookie?: boolean; isGrail?: boolean; isListed?: boolean;
  breeders: Breeder[];
}

// ---- 正典データ(canonical.html HORSES より写経) --------------------------
const HORSES: Record<StateKey, Horse> = {
  active: {
    kana: 'テンペスト', en: 'TEMPEST', type: 'バランス', rarity: 'RARE', rarKey: 'RARE',
    day: 4, total: 74, dna: 'seed-tempest-9f2c', dnaText: '0x9f2c…7a41 (mod 12)', seedText: '0x51be…c9d0',
    statusLabel: '出走中', statusKey: 'active', groupLabel: '出走中',
    forecast: [{ axis: '天候', val: '雨' }, { axis: '馬場', val: '道悪' }, { axis: 'コース', val: '芝' }],
    runs: [
      { weather: '晴', ground: '良', course: 'ダート', rank: 14, entrants: 1800, m: 0 },
      { weather: '雨', ground: '稍重', course: '芝', rank: 3, entrants: 2400, m: 3 },
      { weather: '曇', ground: '不良', course: '芝', rank: 9, entrants: 2100, m: 2 },
      { weather: '雨', ground: '高速', course: 'ダート', rank: 11, entrants: 1950, m: 1 },
      { weather: '晴', ground: '良', course: '芝', rank: 16, entrants: 2200, m: 1 },
    ],
    reads: [
      { name: '道悪', runsText: '3位 · 9位', hint: 'strong', label: '得意そうだ' },
      { name: '芝', runsText: '3位 · 9位', hint: 'strong', label: '得意そうだ' },
      { name: '雨', runsText: '3位 · 11位', hint: 'even', label: '五分か' },
    ],
    verdict: { cls: 'strong', mark: '◎', head: '今夜は狙える', sub: '道悪・芝 が今夜と噛み合っている' },
    band: { text: '今夜の想定 320 / 2,400 位', note: '安全圏', key: 'safe' },
    breeders: [{ name: 'あなた', pct: 64, delta: '8.4', you: true }, { name: 'nao***', pct: 36, delta: '4.7', you: false }],
  },
  rookie: {
    kana: 'ノヴァ', en: 'NOVA', type: 'バランス', rarity: 'UNCOMMON', rarKey: 'UNCOMMON',
    day: 1, total: null, dna: 'seed-nova-3a11', dnaText: '0x3a11…0fe2 (mod 4)', seedText: '0x77ac…1b90',
    statusLabel: '新馬', statusKey: 'active', groupLabel: '新馬',
    forecast: [{ axis: '天候', val: '雨' }, { axis: '馬場', val: '道悪' }, { axis: 'コース', val: '芝' }],
    runs: [],
    reads: [
      { name: '雨', runsText: 'まだ走っていない', hint: 'unknown', label: 'まだ読めない' },
      { name: '道悪', runsText: 'まだ走っていない', hint: 'unknown', label: 'まだ読めない' },
      { name: '芝', runsText: 'まだ走っていない', hint: 'unknown', label: 'まだ読めない' },
    ],
    verdict: { cls: 'unknown', mark: '？', head: '適性は謎', sub: '走らせて暴け' },
    band: null, isRookie: true,
    breeders: [{ name: 'あなた', pct: 100, delta: '0.0', you: true }],
  },
  grail: {
    kana: 'オーレリアス', en: 'AURELIUS', type: 'スピード', rarity: 'LEGENDARY', rarKey: 'LEGENDARY',
    day: 5, total: 93, dna: 'seed-aurelius-f0e1', dnaText: '0xf0e1…9c3b (mod 21)', seedText: '0x0ab2…44ff',
    statusLabel: '聖杯', statusKey: 'active', groupLabel: '出走中',
    forecast: [{ axis: '天候', val: '雨' }, { axis: '馬場', val: '道悪' }, { axis: 'コース', val: '芝' }],
    runs: [
      { weather: '雨', ground: '不良', course: '芝', rank: 1, entrants: 2600, m: 3 },
      { weather: '曇', ground: '稍重', course: '芝', rank: 2, entrants: 2450, m: 2 },
      { weather: '雨', ground: '不良', course: '芝', rank: 1, entrants: 2300, m: 3 },
      { weather: '晴', ground: '良', course: '芝', rank: 4, entrants: 2100, m: 1 },
      { weather: '雨', ground: '稍重', course: 'ダート', rank: 3, entrants: 2000, m: 2 },
    ],
    reads: [
      { name: '道悪', runsText: '1位 · 2位', hint: 'strong', label: '得意そうだ' },
      { name: '雨', runsText: '1位 · 3位', hint: 'strong', label: '得意そうだ' },
      { name: '芝', runsText: '1位 · 4位', hint: 'even', label: '五分か' },
    ],
    verdict: { cls: 'strong', mark: '◎', head: '今夜は聖杯級', sub: '道悪・雨 が今夜と噛み合っている' },
    band: { text: '今夜の想定 12 / 2,600 位', note: '安全圏', key: 'safe' }, isGrail: true,
    breeders: [{ name: 'あなた', pct: 78, delta: '21.6', you: true }, { name: 'kei***', pct: 22, delta: '6.1', you: false }],
  },
  listed: {
    kana: 'ゼファー', en: 'ZEPHYR', type: 'スタミナ', rarity: 'EPIC', rarKey: 'EPIC',
    day: 3, total: 68, dna: 'seed-zephyr-22dd', dnaText: '0x22dd…54a1 (mod 9)', seedText: '0x9cd0…7e33',
    statusLabel: '出品中', statusKey: 'listed', groupLabel: '出品中',
    forecast: [{ axis: '天候', val: '雨' }, { axis: '馬場', val: '道悪' }, { axis: 'コース', val: '芝' }],
    runs: [
      { weather: '曇', ground: '良', course: '芝', rank: 5, entrants: 2200, m: 1 },
      { weather: '晴', ground: '高速', course: '芝', rank: 7, entrants: 2050, m: 1 },
      { weather: '雨', ground: '不良', course: 'ダート', rank: 19, entrants: 1900, m: 2 },
      { weather: '晴', ground: '良', course: '芝', rank: 6, entrants: 2150, m: 1 },
    ],
    reads: [
      { name: '芝', runsText: '5位 · 6位', hint: 'strong', label: '得意そうだ' },
      { name: '道悪', runsText: '19位', hint: 'weak', label: '苦手そう' },
      { name: '雨', runsText: '19位', hint: 'even', label: '五分か' },
    ],
    verdict: { cls: 'even', mark: '○', head: '条件次第', sub: '芝は手堅い。道悪は苦しいかも' },
    band: null, isListed: true,
    breeders: [{ name: 'あなた', pct: 100, delta: '5.9', you: true }],
  },
};
const ORDER: StateKey[] = ['active', 'rookie', 'grail', 'listed'];
const PRICE = ['100.00', '110.00', '121.00', '133.10', '146.41', '161.05', '177.16'];

// ---- 条件・アイテム(canonical 写経) --------------------------------------
const EMBLEM: Record<string, string> = {
  雨: 'rain', 嵐: 'rain', 晴: 'sun', 曇: 'sun', 道悪: 'mud', 稍重: 'mud', 不良: 'mud',
  良馬場: 'firm', 良: 'firm', 高速: 'firm', 芝: 'turf', ダート: 'dirt',
};
const ICO = (v: string) => `/conditions/emblem_${EMBLEM[v] || 'rain'}.webp`;
const MENU = (k: string) => `/menus/menu_${k}.webp`;
const ITEM = (k: string) => `/items/${k}.webp`;
const COND_COLOR: Record<string, string> = {
  晴: '#ffd97a', 曇: '#aab4c8', 雨: '#6fc3ff', 嵐: '#c78cff',
  高速: '#00eaff', 良: '#35d07f', 良馬場: '#35d07f', 道悪: '#e6b24a', 稍重: '#e6b24a', 不良: '#d87b3a',
  芝: '#58d68d', ダート: '#d8a05a',
};
const condColor = (v: string) => COND_COLOR[v] || 'var(--text)';
const MENUS = [
  { key: 'hill', name: '坂路', cond: '道悪' }, { key: 'pool', name: '水泳', cond: '雨' },
  { key: 'wood', name: 'ウッド', cond: '芝' }, { key: 'gate', name: 'ゲート', cond: '良馬場' },
  { key: 'spar', name: '併せ馬', cond: 'ダート' }, { key: 'rest', name: '調整', cond: '晴' },
];
const TRAIN_ITEMS = [
  { key: 'feed_s', name: '強化フード 小', kind: '強化 +小' }, { key: 'feed_m', name: '強化フード 中', kind: '強化 +中' },
  { key: 'feed_l', name: '強化フード 大', kind: '強化 +大' }, { key: 'feed_xl', name: '強化フード 特大', kind: '強化 +特大' },
  { key: 'shield_1', name: '星霜の砂 ×1', kind: '減衰よけ 1走' }, { key: 'shield_3', name: '星霜の砂 ×3', kind: '減衰よけ 3走' },
];
const STRENGTHS = [{ s: 'weak', label: '弱' }, { s: 'mid', label: '中' }, { s: 'strong', label: '強' }];
// 6条件 → レースアイテムのベースキー(全条件を map)。
const condToKey: Record<string, string> = {
  雨: 'rain_cape', 晴: 'sun_hat', 道悪: 'mud_shoes', 良馬場: 'speed_shoes', 芝: 'turf_shoes', ダート: 'dirt_shoes',
};
// 生ラベル(TRACK_JA/WEATHER_JA = 稍重/不良/高速/良/嵐/曇 等)→ 6条件の群ラベルへ正規化。
// ★これが無いと、結線時に実データが生ラベルを渡したとき tonightConds が空 → D棚が無言で壊れる(レビュー指摘)。
const NORMALIZE_COND: Record<string, string> = { 嵐: '雨', 曇: '晴', 稍重: '道悪', 不良: '道悪', 高速: '良馬場', 良: '良馬場' };
const normCond = (v: string) => NORMALIZE_COND[v] ?? v;
const ALL_CONDS = ['雨', '晴', '道悪', '良馬場', '芝', 'ダート'];
const INS = [
  { key: 'full_ready_std', name: '完全装備', note: '3条件を標準で底上げ' },
  { key: 'full_ready_max', name: '野営一式', note: '3条件を最大で底上げ' },
];

// ---- style helpers(canonical 写経) ---------------------------------------
function rarStyle(k: string): string {
  const base = 'display:inline-flex;align-items:center;white-space:nowrap;padding:3px 9px;border-radius:6px;font-family:var(--font-display);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border:1px solid transparent;';
  const map: Record<string, string> = {
    COMMON: 'color:#c3ccd8;border-color:#8a92a0;background:rgba(130,140,160,.14);',
    UNCOMMON: 'color:var(--good-soft);border-color:var(--good);background:rgba(53,208,127,.15);',
    RARE: 'color:#a9f6ff;border-color:var(--cyan);background:rgba(0,234,255,.16);',
    EPIC: 'color:var(--magenta-soft);border-color:var(--magenta);background:rgba(255,45,196,.16);',
    LEGENDARY: 'color:#0a0813;border-color:transparent;background:linear-gradient(92deg,var(--gold),#f7eccb);',
  };
  return base + (map[k] || map.COMMON);
}
function statusStyle(k: string): string {
  const base = 'display:inline-flex;align-items:center;white-space:nowrap;padding:3px 9px;border-radius:6px;font-family:var(--font-display);font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;border:1px solid transparent;';
  if (k === 'listed') return base + 'color:var(--warn);border-color:rgba(230,178,74,.5);background:rgba(230,178,74,.1);';
  return base + 'color:var(--cyan);border-color:rgba(0,234,255,.4);background:rgba(0,234,255,.08);';
}
function hintStyle(hint: string): string {
  const base = 'margin-left:auto;font-family:var(--font-mono);font-size:9px;font-weight:600;letter-spacing:.06em;white-space:nowrap;padding:3px 8px;border-radius:999px;border:1px solid transparent;';
  if (hint === 'strong') return base + 'color:var(--good);border-color:var(--good-dim);background:rgba(53,208,127,.1);';
  if (hint === 'weak') return base + 'color:var(--magenta-soft);border-color:rgba(255,143,228,.4);background:rgba(255,45,196,.08);';
  if (hint === 'even') return base + 'color:var(--muted);border-color:var(--border);';
  return base + 'color:var(--faint);border-color:rgba(143,138,194,.3);';
}
function verdictStyle(cls: string): string {
  const base = 'display:flex;align-items:center;gap:11px;padding:11px 12px;border-radius:12px;margin-bottom:10px;border:1px solid transparent;';
  if (cls === 'strong') return base + 'border-color:var(--good-dim);background:linear-gradient(100deg,rgba(53,208,127,.14),rgba(53,208,127,.03));';
  if (cls === 'weak') return base + 'border-color:rgba(255,143,228,.4);background:linear-gradient(100deg,rgba(255,45,196,.12),rgba(255,45,196,.02));';
  if (cls === 'even') return base + 'border-color:var(--border);background:rgba(255,255,255,.03);';
  return base + 'border-color:rgba(143,138,194,.35);background:repeating-linear-gradient(135deg,rgba(255,255,255,.02) 0 7px,transparent 7px 14px);';
}
const verdictMarkColor = (cls: string) => cls === 'strong' ? 'var(--good)' : cls === 'weak' ? 'var(--magenta-soft)' : cls === 'even' ? 'var(--muted)' : 'var(--faint)';
const verdictHeadColor = (cls: string) => cls === 'strong' ? 'var(--good)' : cls === 'weak' ? 'var(--magenta-soft)' : 'var(--text)';

export function HorsePagePreview() {
  const [stateKey, setStateKey] = useState<StateKey>('active');
  const [vp, setVp] = useState<Vp>('pc');
  const h = HORSES[stateKey];
  const isListed = !!h.isListed;
  const isRookie = !!h.isRookie;
  const isGrail = !!h.isGrail;
  const isActive = !isRookie && !isListed; // C/D を出す(出走中・聖杯)
  const runsTonight = !isListed;
  const isMobile = vp === 'mobile';

  // 状態機械(正典) + アイテム差し替え(Decision 2026-07-23)
  const [trainPhase, setTrainPhase] = useState<'pick' | 'confirm' | 'done'>('pick');
  const [itemPhase, setItemPhase] = useState<'locked' | 'pick' | 'attached' | 'skipped'>('locked');
  const [menus, setMenus] = useState<string[]>([]);
  const [trainItemKey, setTrainItemKey] = useState('');
  const [attachedKey, setAttachedKey] = useState<string | null>(null);
  const [raceKey, setRaceKey] = useState('');
  const [raceApplied, setRaceApplied] = useState<string | null>(null);
  const [raceEditing, setRaceEditing] = useState(false);
  const [displayTotal, setDisplayTotal] = useState(h.total ?? 0);
  const [auraOn, setAuraOn] = useState(false);

  const dispRef = useRef(h.total ?? 0);
  const targetRef = useRef(h.total ?? 0);
  const rafRef = useRef<number | null>(null);
  const auraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // reduced-motion: 値は即時反映し、オーラ/光スイープ/装着ポップ等の演出は止める(依頼書§4)。
  const [prefersReduce, setPrefersReduce] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion:reduce)');
    const on = () => setPrefersReduce(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  /** reduced-motion のときインライン animation を空にする(モジュールCSSでは拾えないため JS で外す)。 */
  const anim = (spec: string) => (prefersReduce ? '' : spec);

  useEffect(() => {
    setTrainPhase('pick'); setItemPhase('locked'); setMenus([]); setTrainItemKey('');
    setAttachedKey(null); setRaceKey(''); setRaceApplied(null); setRaceEditing(false);
    const base = h.total ?? 0;
    setDisplayTotal(base); setAuraOn(false); dispRef.current = base; targetRef.current = base;
  }, [stateKey, h.total]);

  const baseTotal = h.total ?? 0;
  const targetTotal = baseTotal + (trainPhase === 'done' ? 3 : 0) + (attachedKey ? 1 : 0) + (raceApplied ? 2 : 0);
  useEffect(() => {
    if (targetTotal === targetRef.current) return;
    const increased = targetTotal > targetRef.current;
    targetRef.current = targetTotal;
    const from = dispRef.current; const target = targetTotal;
    // reduced-motion / SSR: 値だけ即時反映し、オーラも count-up も出さない
    if (typeof window === 'undefined' || prefersReduce) { dispRef.current = target; setDisplayTotal(target); return; }
    if (increased) {
      setAuraOn(true);
      if (auraTimer.current) clearTimeout(auraTimer.current);
      auraTimer.current = setTimeout(() => setAuraOn(false), 1200);
    }
    const start = performance.now(); const dur = increased ? 800 : 450;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - p, 3);
      const val = from + (target - from) * e; dispRef.current = val; setDisplayTotal(Math.round(val));
      if (p < 1) rafRef.current = requestAnimationFrame(step); else { dispRef.current = target; setDisplayTotal(target); }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, [targetTotal]);

  // ---- handlers ----
  function toggleMenu(key: string) {
    if (trainPhase !== 'pick') return;
    setMenus((prev) => {
      const m = prev.slice();
      if (m.length >= 2) { const idx = m.indexOf(key); if (idx >= 0) m.splice(idx, 1); else return prev; } else m.push(key);
      return m;
    });
  }
  const removeMenuAt = (i: number) => setMenus((prev) => { const m = prev.slice(); m.splice(i, 1); return m; });
  const startConfirm = () => { if (menus.length === 0) return; setTrainPhase('confirm'); };
  const cancelConfirm = () => setTrainPhase('pick');
  const confirmTraining = () => { setTrainPhase('done'); setItemPhase('pick'); };
  const selectTrainItem = (key: string) => setTrainItemKey(key);
  const attachTrainItem = () => { if (!trainItemKey) return; setAttachedKey(trainItemKey); setItemPhase('attached'); };
  const swapTrainItem = () => { setTrainItemKey(attachedKey ?? ''); setItemPhase('pick'); };
  const removeTrainItem = () => { setAttachedKey(null); setTrainItemKey(''); setItemPhase('pick'); };
  const skipTrainItem = () => { setAttachedKey(null); setTrainItemKey(''); setItemPhase('skipped'); };
  const unskipTrainItem = () => setItemPhase('pick');
  const selectRace = (key: string) => setRaceKey(key);
  const applyRace = () => { if (!raceKey) return; setRaceApplied(raceKey); setRaceEditing(false); };
  const swapRace = () => { setRaceEditing(true); setRaceKey(raceApplied ?? ''); };
  const cancelRace = () => { setRaceApplied(null); setRaceEditing(false); setRaceKey(''); };

  // ---- computed(renderVals 写経) ----
  const value = PRICE[h.day]; const valueLabel = isListed ? '出品価格' : '現在価値';
  const heroFrameStyle = 'border-radius:18px;padding:1px;box-shadow:0 18px 40px -18px rgba(0,0,0,.7);height:100%;'
    + (isGrail ? 'background:conic-gradient(from 140deg,#5a4a1e,#f2e4bf,#fff6da,var(--gold-bright),#f2e4bf,#c9a86a,#5a4a1e);'
              : 'background:conic-gradient(from 140deg,#3a2f18,var(--gold),#f2e4bf,var(--cyan),var(--magenta),var(--gold),#3a2f18);');
  const totalColor = isGrail ? 'var(--gold-bright)' : ((h.total ?? 0) >= 85 ? 'var(--gold-bright)' : (h.total ?? 0) >= 70 ? '#a9f6ff' : 'var(--text)');
  const totalStyle = `font-family:var(--font-display);font-weight:900;font-size:38px;line-height:1;color:${totalColor};` + (auraOn ? 'text-shadow:0 0 18px rgba(242,228,191,.7);' : '');
  const pips = Array.from({ length: 7 }, (_, idx) => {
    const i = idx + 1; let bg = 'rgba(255,255,255,.1)';
    if (i <= h.day) bg = 'var(--cyan)'; if (i === h.day + 1 && runsTonight) bg = 'var(--magenta)';
    const extra = (i === h.day + 1 && runsTonight) ? 'box-shadow:0 0 7px var(--magenta);' : '';
    return `flex:1;height:6px;border-radius:2px;background:${bg};${extra}`;
  });
  const bandColor = h.band && h.band.key === 'safe' ? '#35d07f' : 'var(--muted)';
  const bandStyle = `font-family:var(--font-mono);font-size:11px;margin-top:9px;letter-spacing:.04em;color:${bandColor};`;
  const cellBase = 'font-size:11px;text-align:center;padding:7px 5px;border-bottom:1px solid var(--border-soft);';
  const formTvStyle = `font-family:var(--font-display);font-weight:900;font-size:22px;line-height:1;color:${h.total == null ? 'var(--faint)' : 'var(--cyan)'};font-variant-numeric:tabular-nums;`;

  const numOn = 'width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:11px;color:#04141a;background:var(--cyan);flex:none;';
  const numDone = 'width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:11px;color:var(--good);background:rgba(53,208,127,.15);border:1px solid var(--good-dim);flex:none;';
  const numLock = 'width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:11px;color:var(--faint);background:rgba(255,255,255,.05);border:1px solid var(--border);flex:none;';
  const trainDone = trainPhase === 'done'; const trainConfirming = trainPhase === 'confirm'; const trainPicking = trainPhase === 'pick';
  const step1NumStyle = trainDone ? numDone : numOn;
  const step1Title = trainDone ? '① 調教を確定した' : '① 調教を確定する';
  const itemAttached = itemPhase === 'attached'; const itemSkipped = itemPhase === 'skipped'; const itemPicking = itemPhase === 'pick'; const itemLocked = itemPhase === 'locked';
  const step2NumStyle = (itemAttached || itemSkipped) ? numDone : (itemPicking ? numOn : numLock);
  const step2Title = itemAttached ? '② 調教アイテムを装着した' : itemSkipped ? '② 調教アイテム — 見送り' : '② 調教アイテムで上乗せする';
  const step2TitleColor = itemLocked ? 'var(--faint)' : 'var(--text)';

  const menuCards = MENUS.map((m) => {
    const count = menus.filter((x) => x === m.key).length; const on = count > 0;
    const style = 'appearance:none;text-align:left;cursor:pointer;display:flex;flex-direction:column;border-radius:11px;padding:8px;color:inherit;transition:border-color .15s;'
      + (on ? 'border:1px solid var(--cyan);box-shadow:0 0 0 2px rgba(0,234,255,.25);background:rgba(0,234,255,.06);' : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
    return { ...m, img: MENU(m.key), count, style };
  });
  const pickedChips = menus.map((k, i) => ({ label: MENUS.find((x) => x.key === k)!.name, i }));
  const submitDisabled = menus.length === 0;
  const submitBtnStyle = 'appearance:none;border-radius:11px;padding:9px 16px;font-family:var(--font-display);font-weight:700;font-size:12px;letter-spacing:.04em;cursor:pointer;border:none;'
    + (submitDisabled ? 'color:var(--faint);background:rgba(255,255,255,.05);cursor:not-allowed;' : 'color:#04141a;background:linear-gradient(100deg,var(--cyan),#5ff5ff 55%,var(--cyan));box-shadow:0 10px 24px -8px rgba(0,234,255,.7);');
  const submitBtnLabel = submitDisabled ? 'メニューを選ぶ' : `確認へ進む（${menus.length}/2）`;
  const trainItemCards = TRAIN_ITEMS.map((it) => {
    const on = trainItemKey === it.key;
    const style = 'appearance:none;text-align:left;cursor:pointer;display:flex;flex-direction:column;border-radius:10px;padding:7px;color:inherit;'
      + (on ? 'border:1px solid var(--cyan);box-shadow:0 0 0 2px rgba(0,234,255,.25);background:rgba(0,234,255,.06);' : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
    return { ...it, img: ITEM(it.key), style };
  });
  const selTrain = TRAIN_ITEMS.find((x) => x.key === trainItemKey);
  const editingTrainItem = itemPicking && !!attachedKey;
  const trainItemHint = selTrain ? `${selTrain.kind} — 確定済みの調教へ1個だけ上乗せ` : 'カードを選ぶと効果が出ます。';
  const attachBtnStyle = 'appearance:none;border-radius:11px;padding:9px 16px;font-family:var(--font-display);font-weight:700;font-size:12px;cursor:pointer;border:none;'
    + (trainItemKey ? 'color:#04141a;background:linear-gradient(100deg,var(--cyan),#5ff5ff);box-shadow:0 10px 24px -8px rgba(0,234,255,.7);' : 'color:var(--faint);background:rgba(255,255,255,.05);cursor:not-allowed;');
  const attachBtnLabel = selTrain ? (editingTrainItem && selTrain.key !== attachedKey ? `${selTrain.name}に差し替える` : `${selTrain.name}を購入して装着`) : 'アイテムを選ぶ';
  const attachedItem = attachedKey ? TRAIN_ITEMS.find((x) => x.key === attachedKey) : null;

  const tonightConds = h.forecast.map((f) => normCond(f.val)).filter((v) => condToKey[v]);
  const raceGroups = tonightConds.map((cond) => {
    const base = condToKey[cond]!;
    const items = STRENGTHS.map((st) => {
      const key = `${base}_${st.s}`; const on = raceKey === key;
      const style = 'appearance:none;text-align:center;cursor:pointer;display:flex;flex-direction:column;border-radius:10px;padding:7px;color:inherit;'
        + (on ? 'border:1px solid var(--magenta);box-shadow:0 0 0 2px rgba(255,45,196,.28);background:rgba(255,45,196,.08);' : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
      return { img: ITEM(key), strengthLabel: st.label, key, style };
    });
    return { label: cond, ico: ICO(cond), items };
  });
  const insuranceItems = INS.map((it) => {
    const on = raceKey === it.key;
    const style = 'appearance:none;cursor:pointer;display:flex;align-items:center;gap:9px;border-radius:10px;padding:8px 9px;color:inherit;'
      + (on ? 'border:1px solid var(--gold);box-shadow:0 0 0 2px rgba(201,168,106,.28);background:rgba(201,168,106,.08);' : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
    return { ...it, img: ITEM(it.key), style };
  });
  // 今夜の3条件以外を畳む(予報駆動)。生ラベルでも normCond 済みなので取りこぼさない。
  const otherConds = ALL_CONDS.filter((cc) => !tonightConds.includes(cc)).map((cc) => ({ label: cc, ico: ICO(cc) }));
  const raceSelName = (() => {
    if (!raceKey) return '';
    const ins = INS.find((x) => x.key === raceKey); if (ins) return ins.name;
    const parts = raceKey.split('_'); const st = parts.pop()!;
    const sl = ({ weak: '弱', mid: '中', strong: '強' } as Record<string, string>)[st] || '';
    const cond = Object.keys(condToKey).find((k) => condToKey[k] === parts.join('_'));
    return `${cond || ''} ${sl}`;
  })();
  const raceHint = raceKey ? `${raceSelName} を装備 — 的中で上限側 / 外れは下限側` : '今夜の条件のアイテムから選ぶ。横スクロールなし。';
  const raceApplyBtnStyle = 'appearance:none;border-radius:11px;padding:9px 16px;font-family:var(--font-display);font-weight:700;font-size:12px;cursor:pointer;border:none;'
    + (raceKey ? 'color:#fff;background:linear-gradient(100deg,var(--magenta),#ff6bd6);box-shadow:0 10px 24px -8px rgba(255,45,196,.6);' : 'color:var(--faint);background:rgba(255,255,255,.05);cursor:not-allowed;');
  const raceApplyBtnLabel = raceKey ? (raceEditing ? `${raceSelName}に差し替える` : `${raceSelName}を購入して装備`) : 'アイテムを選ぶ';
  const appliedRace = raceApplied ? (() => {
    const ins = INS.find((x) => x.key === raceApplied); if (ins) return { name: ins.name, img: ITEM(ins.key) };
    const parts = raceApplied.split('_'); const st = parts.pop()!;
    const sl = ({ weak: '弱', mid: '中', strong: '強' } as Record<string, string>)[st] || '';
    const cond = Object.keys(condToKey).find((k) => condToKey[k] === parts.join('_'));
    return { name: `${cond || ''} ${sl}`, img: ITEM(raceApplied) };
  })() : null;

  const ladder = Array.from({ length: 7 }, (_, i) => {
    const price = PRICE[i]!; const hgt = Math.max(24, Math.round((Number(price) / 200) * 100));
    let bar = 'background:rgba(255,255,255,.06);';
    if (i < h.day) bar = 'background:linear-gradient(180deg,rgba(0,234,255,.5),rgba(0,234,255,.12));';
    else if (i === h.day) bar = 'background:linear-gradient(180deg,var(--magenta),rgba(255,45,196,.25));box-shadow:0 0 12px rgba(255,45,196,.5);';
    else if (i === h.day + 1 && runsTonight) bar = 'background:linear-gradient(180deg,var(--cyan),rgba(0,234,255,.3));box-shadow:0 0 12px rgba(0,234,255,.5);';
    return { price, day: `Day${i}`, barStyle: `width:100%;border-radius:4px 4px 0 0;height:${hgt}%;${bar}` };
  });
  ladder.push({ price: '200', day: '走破', barStyle: 'width:100%;border-radius:4px 4px 0 0;height:100%;background:linear-gradient(180deg,var(--gold-bright),var(--gold));box-shadow:0 0 14px rgba(201,168,106,.55);' });
  const ladderNextLabel = h.day >= 6 ? '走破報酬' : '生存で'; const ladderNextVal = h.day >= 6 ? '200' : PRICE[h.day + 1];
  const look = deriveNftLook(h.dna, h.en);

  const outerStyle = `display:flex;justify-content:center;padding:${isMobile ? '22px 12px 0' : '22px 22px 0'};`;
  const frameStyle = isMobile
    ? 'width:390px;max-width:100%;display:flex;flex-direction:column;gap:14px;border:1px solid var(--border);border-radius:26px;padding:16px 14px 26px;background:rgba(8,6,17,.4);box-shadow:0 30px 80px -30px rgba(0,0,0,.8);'
    : 'width:100%;max-width:1180px;display:flex;flex-direction:column;gap:16px;';
  const mainGridStyle = isMobile ? 'display:flex;flex-direction:column;gap:16px;'
    : isActive ? 'display:grid;grid-template-columns:minmax(0,0.84fr) minmax(0,1.16fr);gap:18px;align-items:start;'
    : 'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start;';
  const artColStyle = !isMobile ? 'position:sticky;top:20px;' : '';

  return (
    <div className={s.wrap}>
      {/* プレビュー用ツールバー */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 20px', background: 'rgba(8,6,16,.86)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--hpp-border)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.16em', color: 'var(--hpp-gold)' }}>馬個別ページ 再デザインV2(正典を全体写経)</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {ORDER.map((k) => (
            <button key={k} onClick={() => setStateKey(k)} style={{ fontSize: 10, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--hpp-border)', background: stateKey === k ? 'rgba(201,168,106,.22)' : 'none', color: stateKey === k ? 'var(--hpp-gold-bright)' : 'var(--hpp-muted)' }}>{HORSES[k].statusLabel}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['pc', 'mobile'] as Vp[]).map((k) => (
            <button key={k} onClick={() => setVp(k)} style={{ fontSize: 10, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--hpp-border)', background: vp === k ? 'rgba(255,255,255,.1)' : 'none', color: vp === k ? 'var(--hpp-text)' : 'var(--hpp-muted)' }}>{k === 'pc' ? 'PC' : 'モバイル390'}</button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--hpp-faint)' }}>正典HTMLを写経 · アートは実NftHorseArt · アイテムはレース直前まで差し替え自由</span>
      </div>

      <div style={css(outerStyle)}>
        <div style={css(frameStyle)}>
          <a href="#" onClick={(e) => e.preventDefault()} style={css('font-family:var(--font-display);font-size:10px;letter-spacing:.14em;color:var(--muted)')}>‹ 厩舎へ</a>

          {/* MASTHEAD */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                <span style={css('font-family:var(--font-display);font-weight:800;font-size:27px;letter-spacing:.01em;color:var(--text)')}>{h.kana}</span>
                <span style={css('display:inline-flex;align-items:center;white-space:nowrap;padding:3px 9px;border-radius:6px;font-family:var(--font-display);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border:1px solid rgba(0,234,255,.28);background:rgba(0,234,255,.06);')}>{h.type}</span>
                <span style={css(statusStyle(h.statusKey))}>{h.statusLabel}</span>
                <span style={css(rarStyle(h.rarKey))}>{h.rarity}</span>
              </div>
              <div style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;color:var(--faint);margin-top:6px')}>{h.en} · LV.{h.day}/7</div>
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={css('font-family:var(--font-mono);font-size:9.5px;letter-spacing:.12em;color:var(--muted)')}>{valueLabel}</div>
              <div style={css(`font-family:var(--font-display);font-weight:800;font-size:30px;line-height:1;color:${isListed ? 'var(--warn)' : 'var(--gold-bright)'};`)}>{value}<small style={css('font-family:var(--font-mono);font-weight:400;font-size:12px;color:var(--muted);margin-left:6px')}>USDT</small></div>
            </div>
          </div>

          {/* MAIN GRID */}
          <div style={css(mainGridStyle)}>

            {/* ===== A · 誰の馬か(HERO ART) ===== */}
            <div style={css(artColStyle)}>
              <div style={css(heroFrameStyle)}>
                <div style={{ borderRadius: 17, background: 'linear-gradient(180deg,#12101d,#0a0813)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ position: 'relative', background: 'radial-gradient(90% 80% at 50% 42%,rgba(0,234,255,.07),transparent 70%)', height: isMobile ? 320 : 380, display: 'flex' }}>
                    {isGrail ? <span aria-hidden="true" style={css('position:absolute;inset:-30%;z-index:0;pointer-events:none;background:conic-gradient(from 0deg,transparent,rgba(242,228,191,.16),transparent 30%,rgba(0,234,255,.12),transparent 55%,rgba(255,45,196,.12),transparent 80%,rgba(242,228,191,.16));' + anim('animation:sddGrailSpin 14s linear infinite'))} /> : null}

                    <div className={s.artZoom} style={{ zIndex: 1 }}><NftHorseArt look={look} /></div>

                    {auraOn ? (
                      <>
                        <span aria-hidden="true" style={css('position:absolute;inset:8px;border-radius:14px;pointer-events:none;z-index:4;animation:sddAura 1.6s ease-out')} />
                        <span aria-hidden="true" style={css('position:absolute;inset:0;z-index:4;pointer-events:none;mix-blend-mode:color-dodge;background:linear-gradient(112deg,transparent 42%,rgba(242,228,191,.85) 50%,transparent 58%);background-size:260% 100%;animation:sddSweep 1.1s ease-out')} />
                      </>
                    ) : null}
                    {isGrail ? <span title="聖杯" style={css('position:absolute;top:12px;right:14px;z-index:5;color:#ffd977;font-size:26px;line-height:1;text-shadow:0 0 14px #ffcf4bdd,0 0 4px #fff;pointer-events:none')}>★</span> : null}

                    <div style={css('position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,8,19,0) 46%,rgba(10,8,19,.92) 96%);pointer-events:none')} />

                    <a href="#" onClick={(e) => { e.preventDefault(); setStateKey(ORDER[(ORDER.indexOf(stateKey) - 1 + ORDER.length) % ORDER.length]!); }} title="前の馬へ" style={css('position:absolute;left:8px;top:50%;transform:translateY(-50%);z-index:6;width:40px;height:58px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:700;font-size:30px;color:var(--text);background:rgba(10,8,19,.55);border:1px solid rgba(255,255,255,.14);border-radius:12px;backdrop-filter:blur(6px);text-decoration:none')}>‹</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); setStateKey(ORDER[(ORDER.indexOf(stateKey) + 1) % ORDER.length]!); }} title="次の馬へ" style={css('position:absolute;right:8px;top:50%;transform:translateY(-50%);z-index:6;width:40px;height:58px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:700;font-size:30px;color:var(--text);background:rgba(10,8,19,.55);border:1px solid rgba(255,255,255,.14);border-radius:12px;backdrop-filter:blur(6px);text-decoration:none')}>›</a>
                    <div style={css('position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:6;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;color:var(--muted);background:rgba(10,8,19,.5);border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 11px;white-space:nowrap')}>{h.groupLabel} · {ORDER.indexOf(stateKey) + 1} / 4</div>

                    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', rowGap: 6, textShadow: '0 2px 10px rgba(5,4,9,.85)' }}>
                      <div>
                        <div style={css('font-family:var(--font-mono);font-size:9.5px;color:var(--muted);letter-spacing:.08em')}>{h.en}</div>
                        <div style={css('font-family:var(--font-display);font-weight:800;font-size:15px;color:var(--text);letter-spacing:.02em')}>{h.type}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flex: 'none' }}>
                        {h.total != null ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={css('font-family:var(--font-display);font-size:8.5px;color:var(--faint);letter-spacing:.14em')}>TOTAL</div>
                            <div style={css(totalStyle)}>{Math.round(displayTotal)}</div>
                          </div>
                        ) : null}
                        <div style={{ textAlign: 'right' }}>
                          <div style={css('font-family:var(--font-display);font-size:8.5px;color:var(--faint);letter-spacing:.14em')}>DAY</div>
                          <div style={css('font-family:var(--font-display);font-weight:800;font-size:26px;color:var(--cyan);line-height:1')}>{h.day}<small style={css('font-size:13px;color:var(--faint)')}>/7</small></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '13px 16px 15px' }}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {pips.map((p, i) => <span key={i} style={css(p)} />)}
                    </div>
                    {h.band ? <div style={css(bandStyle)}>{h.band.text}<span style={css('color:var(--faint);font-size:.92em')}> — {h.band.note}</span></div> : null}
                  </div>
                </div>
              </div>
            </div>

            {/* ===== RIGHT RAIL: B 読む → C/D 備える → E 文脈 ===== */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>

              {/* section tag B */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={css('font-family:var(--font-display);font-weight:800;font-size:11px;letter-spacing:.06em;color:#04141a;background:var(--cyan);border-radius:5px;padding:2px 7px')}>B</span>
                <span style={css('font-family:var(--font-display);font-size:12px;letter-spacing:.14em;color:var(--text)')}>読む — 馬柱</span>
                <span style={css('font-family:var(--font-jp);font-size:11px;color:var(--faint)')}>予報 × 成績 × 読解</span>
              </div>

              {/* ===== 馬柱パネル(A案・色分けテキスト) ===== */}
              <div style={css('border:1px solid var(--border);border-radius:16px;background:var(--panel);overflow:hidden;position:relative')}>
                <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 15px 12px;background:linear-gradient(180deg,rgba(255,255,255,.04),transparent);border-bottom:1px solid var(--border-soft)')}>
                  <div>
                    <div style={css('font-family:var(--font-display);font-weight:800;font-size:16px;letter-spacing:.01em;color:var(--text);line-height:1.15')}>{h.kana}</div>
                    <div style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.1em;color:var(--faint);margin-top:3px')}>{h.en}</div>
                    <span style={css('display:inline-block;margin-top:5px;white-space:nowrap;font-family:var(--font-mono);font-size:8px;letter-spacing:.1em;color:var(--muted);border:1px solid var(--border);border-radius:5px;padding:2px 6px')}>{h.type}</span>
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <div style={css(formTvStyle)}>{h.total == null ? '—' : String(h.total)}</div>
                    <div style={css('font-family:var(--font-mono);font-size:7.5px;letter-spacing:.14em;color:var(--faint);margin-top:3px')}>総合値</div>
                  </div>
                </div>

                {/* ① 今夜の予報 */}
                <div style={css('padding:12px 15px;background:linear-gradient(100deg,rgba(0,234,255,.09),rgba(0,234,255,.02));border-bottom:1px solid var(--border-soft)')}>
                  <div style={css('font-family:var(--font-display);font-size:9px;letter-spacing:.18em;color:var(--cyan);margin-bottom:9px;display:flex;align-items:center;gap:7px')}>今夜の予報<span style={css('margin-left:auto;color:var(--faint);letter-spacing:.08em;font-family:var(--font-mono);font-size:8px')}>的中率70% · 目安</span></div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                    {h.forecast.map((cc) => (
                      <span key={cc.axis} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;color:var(--faint)')}>{cc.axis}</span>
                        <b style={css(`font-family:var(--font-sans);font-weight:800;font-size:16px;color:${condColor(cc.val)};`)}>{cc.val}</b>
                      </span>
                    ))}
                  </div>
                </div>

                {/* ② 馬柱 = 材料 */}
                <div style={{ padding: '10px 8px 4px' }}>
                  <div style={css('font-family:var(--font-display);font-size:8.5px;letter-spacing:.16em;color:var(--muted);padding:4px 7px 8px;display:flex;align-items:center;gap:6px')}>成績表 — 推理の材料（直近{h.runs.length}走）<span style={css('margin-left:auto;font-family:var(--font-mono);font-size:8px;color:var(--faint);letter-spacing:.04em;display:flex;align-items:center;gap:5px')}><i style={css('width:9px;height:9px;border-radius:2px;background:rgba(0,234,255,.35);border:1px solid var(--border-strong);display:inline-block')} />予報に一致した走</span></div>
                  {h.runs.length > 0 ? (
                    <table style={css('width:100%;border-collapse:collapse;font-family:var(--font-mono)')}>
                      <thead>
                        <tr>
                          {['天候', '馬場', 'コース'].map((th) => <th key={th} style={css('font-size:8px;letter-spacing:.12em;color:var(--faint);font-weight:500;text-align:center;padding:4px 5px;border-bottom:1px solid var(--border)')}>{th}</th>)}
                          <th style={css('font-size:8px;letter-spacing:.12em;color:var(--faint);font-weight:500;text-align:right;padding:4px 9px 4px 5px;border-bottom:1px solid var(--border)')}>着順</th>
                        </tr>
                      </thead>
                      <tbody>
                        {h.runs.map((r, i) => {
                          const hi = r.m >= 2; const dim = r.m === 0;
                          const trStyle = hi ? 'background:linear-gradient(90deg,rgba(0,234,255,.08),transparent);' : dim ? 'opacity:.5;' : '';
                          return (
                            <tr key={i} style={css(trStyle)}>
                              <td style={css(cellBase + 'font-weight:600;color:' + condColor(r.weather) + ';' + (hi ? 'box-shadow:inset 3px 0 0 var(--cyan);' : ''))}>{r.weather}</td>
                              <td style={css(cellBase + 'font-weight:600;color:' + condColor(r.ground) + ';')}>{r.ground}</td>
                              <td style={css(cellBase + 'font-weight:600;color:' + condColor(r.course) + ';')}>{r.course}</td>
                              <td style={css(cellBase + 'text-align:right;padding-right:9px;')}><b style={css('font-size:13px;font-weight:600;color:' + (hi ? 'var(--cyan)' : 'var(--text)') + ';')}>{r.rank}</b><span style={css('color:var(--faint);font-size:9px')}>/{r.entrants}</span>{hi ? <span style={css('color:var(--cyan);font-size:9px;margin-left:3px')}>◂根拠</span> : null}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : null}
                  {isRookie ? <div style={css('padding:6px 7px 2px;font-family:var(--font-mono);font-size:11px;color:var(--faint);line-height:1.7')}>まだ走っていない。<span style={css('color:var(--cyan)')}>走らせて</span>適性を暴く。</div> : null}
                </div>

                {/* ③ レース予想板 */}
                <div style={css('padding:12px 15px 15px;border-top:1px solid var(--border);background:linear-gradient(180deg,rgba(255,255,255,.015),transparent)')}>
                  <div style={css('font-family:var(--font-display);font-size:8.5px;letter-spacing:.16em;color:var(--muted);margin-bottom:10px')}>レース予想板</div>
                  <div style={css(verdictStyle(h.verdict.cls))}>
                    <div style={css(`font-family:var(--font-display);font-weight:900;font-size:26px;line-height:1;width:34px;text-align:center;flex:none;color:${verdictMarkColor(h.verdict.cls)};`)}>{h.verdict.mark}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={css(`font-family:var(--font-sans);font-weight:900;font-size:15px;line-height:1.2;color:${verdictHeadColor(h.verdict.cls)};`)}>{h.verdict.head}</div>
                      <div style={css('font-family:var(--font-mono);font-size:8.5px;color:var(--muted);margin-top:3px;letter-spacing:.04em')}>{h.verdict.sub}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {h.reads.map((a) => (
                      <div key={a.name} style={css('display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:9px;background:rgba(255,255,255,.025);border:1px solid var(--border-soft)')}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={css(`font-family:var(--font-sans);font-weight:800;font-size:12px;color:${condColor(a.name)};white-space:nowrap`)}>「{a.name}」</div>
                          <div style={css('font-family:var(--font-mono);font-size:9.5px;color:var(--muted)')}>{a.runsText}</div>
                        </div>
                        <div style={css(hintStyle(a.hint))}>{a.label}</div>
                      </div>
                    ))}
                  </div>
                  {isRookie ? (
                    <>
                      <div style={css('font-family:var(--font-mono);font-size:9.5px;color:var(--muted);line-height:1.7;padding:9px 2px 0')}>走ったぶんだけ、この馬の得意が<b style={css('color:var(--cyan)')}>読めてくる</b>。今は材料が少ない＝これからの推理枠。</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 9 }}>
                        <span style={css('flex:1;height:3px;border-radius:2px;background:var(--cyan)')} />
                        {[0, 1, 2, 3].map((i) => <span key={i} style={css('flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.08)')} />)}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>

              {/* ===== 出品中バナー ===== */}
              {isListed ? (
                <div style={css('border:1px solid rgba(230,178,74,.35);border-radius:16px;padding:16px 18px;background:linear-gradient(150deg,rgba(230,178,74,.08),transparent 72%)')}>
                  <div style={css('font-family:var(--font-display);font-weight:800;font-size:16px;color:var(--warn)')}>出品中 — 今夜は走りません</div>
                  <div style={css('font-size:12.5px;color:#c3ccd8;line-height:1.7;margin-top:6px')}>この馬はマーケットに出ています。上の馬柱は<b style={css('color:var(--gold-bright)')}>買い手の目利き材料</b>。調教・レースアイテムは非表示です。</div>
                </div>
              ) : null}

              {/* ===== 備える(出走中・聖杯のみ) ===== */}
              {isActive ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* ③ 今夜の条件ドライバーバー */}
                  <div style={css('border:1px solid var(--border-strong);border-radius:14px;padding:12px 15px;background:linear-gradient(100deg,rgba(0,234,255,.08),rgba(255,45,196,.05))')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={css('font-family:var(--font-display);font-size:10px;letter-spacing:.14em;color:var(--text)')}>今夜はこの3つに備える</span>
                      <span style={css('font-family:var(--font-mono);font-size:8px;color:var(--faint);letter-spacing:.06em')}>予報 70% · 目安</span>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                        {h.forecast.map((cc) => (
                          <span key={cc.axis} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                            <span style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.1em;color:var(--faint)')}>{cc.axis}</span>
                            <b style={css(`font-family:var(--font-sans);font-weight:800;font-size:12px;color:${condColor(cc.val)};`)}>{cc.val}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* section tag C */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 2 }}>
                    <span style={css('font-family:var(--font-display);font-weight:800;font-size:11px;letter-spacing:.06em;color:#04141a;background:var(--cyan);border-radius:5px;padding:2px 7px')}>C</span>
                    <span style={css('font-family:var(--font-display);font-size:12px;letter-spacing:.14em;color:var(--text)')}>備える① 調教</span>
                    <span style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.06em;color:var(--good);border:1px solid rgba(53,208,127,.45);border-radius:5px;padding:1px 7px')}>無料 · 1日1回</span>
                  </div>

                  {/* ===== C 調教パネル(cyan) ===== */}
                  <div style={css('border:1px solid rgba(0,234,255,.4);border-radius:16px;padding:15px 17px;background:linear-gradient(150deg,rgba(0,234,255,.10),transparent 70%);display:flex;flex-direction:column;gap:14px')}>
                    {/* STEP 1 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={css(step1NumStyle)}>1</span>
                        <span style={css('font-family:var(--font-display);font-weight:700;font-size:12px;color:var(--text)')}>{step1Title}</span>
                      </div>

                      {trainDone ? (
                        <div style={css('display:flex;flex-direction:column;gap:8px;border:1px solid var(--border-strong);border-radius:12px;padding:12px;background:rgba(10,8,22,.6)')}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {pickedChips.map((m, i) => <span key={i} style={css('font-family:var(--font-mono);font-size:11px;color:var(--text);border:1px solid var(--border);border-radius:999px;padding:2px 10px;background:rgba(10,8,22,.5)')}>{m.label}</span>)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={css('font-family:var(--font-display);font-weight:800;font-size:15px;color:var(--good)')}>手応えあり</span>
                            <span style={css('font-family:var(--font-mono);font-size:10px;color:var(--muted)')}>総合値が {h.total} → <b style={{ color: 'var(--good)' }}>{Math.round(displayTotal)}</b> に上がった</span>
                          </div>
                          <div style={css('font-family:var(--font-jp);font-size:10.5px;color:var(--muted)')}>このサイクルの調教は確定。次のレースへ持ち越します。</div>
                        </div>
                      ) : null}

                      {trainConfirming ? (
                        <div style={css('display:flex;flex-direction:column;gap:10px;min-height:300px;border:1px solid var(--border-strong);border-radius:12px;padding:14px;background:rgba(10,8,22,.6)')}>
                          <div style={css('font-family:var(--font-display);font-weight:700;font-size:13px;color:var(--text)')}>この内容で確定しますか？</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {pickedChips.map((m, i) => <span key={i} style={css('font-family:var(--font-mono);font-size:11px;color:var(--text);border:1px solid var(--border);border-radius:999px;padding:2px 10px;background:rgba(10,8,22,.5)')}>{m.label}</span>)}
                          </div>
                          <div style={css('font-family:var(--font-jp);font-size:11px;color:var(--cyan);border:1px dashed rgba(0,234,255,.4);border-radius:9px;padding:7px 10px;background:rgba(0,234,255,.05)')}>確定後このサイクルは変更できません。</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button type="button" onClick={confirmTraining} style={css('appearance:none;border:none;border-radius:11px;padding:9px 16px;font-family:var(--font-display);font-weight:700;font-size:12px;letter-spacing:.04em;cursor:pointer;color:#04141a;background:linear-gradient(100deg,var(--cyan),#5ff5ff 55%,var(--cyan));box-shadow:0 10px 24px -8px rgba(0,234,255,.7)')}>確定する</button>
                            <button type="button" onClick={cancelConfirm} style={css('appearance:none;background:transparent;border:1px dashed var(--border);color:var(--muted);border-radius:9px;padding:8px 14px;font-family:var(--font-display);font-size:11px;cursor:pointer')}>戻る</button>
                          </div>
                        </div>
                      ) : null}

                      {trainPicking ? (
                        <>
                          <div style={css('font-family:var(--font-jp);font-size:11px;color:var(--muted)')}>6メニューから2つ選ぶ。</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                            {menuCards.map((mc) => (
                              <button key={mc.key} type="button" onClick={() => toggleMenu(mc.key)} style={css(mc.style)}>
                                <span style={{ position: 'relative', width: '100%', aspectRatio: '16/10', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,.35)', display: 'block' }}>
                                  <img src={mc.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  {mc.count ? <span style={css('position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:10px;color:#04141a;background:var(--cyan)')}>{mc.count}</span> : null}
                                </span>
                                <span style={css('font-family:var(--font-display);font-weight:700;font-size:11px;color:var(--text);margin-top:6px;display:block')}>{mc.name}</span>
                                <span style={css('font-family:var(--font-mono);font-size:9px;color:var(--muted)')}>〔{mc.cond}〕</span>
                              </button>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minHeight: 24 }}>
                            {pickedChips.map((m) => <button key={m.i} type="button" onClick={() => removeMenuAt(m.i)} style={css('font-family:var(--font-mono);font-size:11px;color:var(--cyan);cursor:pointer;border:1px solid rgba(0,234,255,.35);border-radius:999px;padding:2px 9px;background:rgba(0,234,255,.06)')}>{m.label} ✕</button>)}
                          </div>
                          <button type="button" onClick={startConfirm} style={css(submitBtnStyle)}>{submitBtnLabel}</button>
                        </>
                      ) : null}
                    </div>

                    {/* STEP 2 調教アイテム */}
                    <div style={css('display:flex;flex-direction:column;gap:9px;border-top:1px solid var(--border-soft);padding-top:13px')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={css(step2NumStyle)}>2</span>
                        <span style={css(`font-family:var(--font-display);font-weight:700;font-size:12px;color:${step2TitleColor}`)}>{step2Title}</span>
                        <span style={css('font-family:var(--font-mono);font-size:8.5px;color:var(--faint);border:1px solid var(--border);border-radius:5px;padding:1px 6px')}>任意</span>
                      </div>

                      {itemAttached && attachedItem ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                          <div style={css('position:relative;display:flex;align-items:center;gap:10px;border:1px solid rgba(53,208,127,.4);border-radius:11px;padding:9px 11px;background:rgba(53,208,127,.06);overflow:hidden;' + anim('animation:sddAttach .55s cubic-bezier(.15,1.4,.4,1)'))}>
                            <span aria-hidden="true" style={css('position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;background:linear-gradient(112deg,transparent 42%,rgba(157,255,196,.7) 50%,transparent 58%);background-size:260% 100%;' + anim('animation:sddSweep 1s ease-out'))} />
                            <img src={ITEM(attachedItem.key)} alt="" style={css('width:34px;height:34px;border-radius:7px;object-fit:cover;' + anim('animation:sddPop .5s cubic-bezier(.15,1.5,.4,1)'))} />
                            <span style={css('font-family:var(--font-jp);font-size:12px;color:var(--text)')}>{attachedItem.name} を装着</span>
                            <span style={{ flex: 1 }} />
                            <span style={css('font-family:var(--font-display);font-weight:800;font-size:13px;color:var(--good)')}>上乗せ済み</span>
                          </div>
                          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                            <a href="#" onClick={(e) => { e.preventDefault(); swapTrainItem(); }} style={css('font-family:var(--font-display);font-size:10.5px;color:var(--cyan)')}>別のに差し替える</a>
                            <a href="#" onClick={(e) => { e.preventDefault(); removeTrainItem(); }} style={css('font-family:var(--font-display);font-size:10.5px;color:var(--muted)')}>取り外す</a>
                            <span style={{ flex: 1 }} />
                            <span style={css('font-family:var(--font-mono);font-size:8.5px;color:var(--faint)')}>レース直前まで何度でも差し替え可</span>
                          </div>
                        </div>
                      ) : null}

                      {itemLocked ? <div style={css('font-family:var(--font-jp);font-size:11px;color:var(--faint)')}>まず①の調教を確定してください。</div> : null}

                      {itemPicking ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                            {trainItemCards.map((it) => (
                              <button key={it.key} type="button" onClick={() => selectTrainItem(it.key)} style={css(it.style)}>
                                <span style={{ width: '100%', aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,.35)', display: 'block' }}><img src={it.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></span>
                                <span style={css('font-family:var(--font-jp);font-weight:700;font-size:10.5px;color:var(--text);margin-top:5px;display:block;line-height:1.3')}>{it.name}</span>
                                <span style={css('font-family:var(--font-mono);font-size:8.5px;color:var(--muted)')}>{it.kind}</span>
                              </button>
                            ))}
                          </div>
                          <div style={css('font-family:var(--font-mono);font-size:10px;color:var(--muted);min-height:1.1rem')}>{trainItemHint}</div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <button type="button" onClick={attachTrainItem} style={css(attachBtnStyle)}>{attachBtnLabel}</button>
                            <a href="#" onClick={(e) => { e.preventDefault(); skipTrainItem(); }} style={css('font-family:var(--font-display);font-size:10.5px;letter-spacing:.04em;color:var(--muted)')}>使わない</a>
                          </div>
                        </>
                      ) : null}

                      {itemSkipped ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={css('font-family:var(--font-jp);font-size:11px;color:var(--faint)')}>見送りました</span><a href="#" onClick={(e) => { e.preventDefault(); unskipTrainItem(); }} style={css('font-family:var(--font-display);font-size:10.5px;color:var(--cyan)')}>やっぱり使う</a></div>
                      ) : null}
                    </div>
                  </div>

                  {/* section tag D */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 2 }}>
                    <span style={css('font-family:var(--font-display);font-weight:800;font-size:11px;letter-spacing:.06em;color:#fff;background:var(--magenta);border-radius:5px;padding:2px 7px')}>D</span>
                    <span style={css('font-family:var(--font-display);font-size:12px;letter-spacing:.14em;color:var(--text)')}>備える② レースアイテム</span>
                    <span style={css('font-family:var(--font-mono);font-size:9px;color:var(--faint)')}>予報駆動 · 今夜のだけ前に</span>
                  </div>

                  {/* ===== D レースアイテム棚(magenta) ===== */}
                  <div style={css('border:1px solid rgba(255,45,196,.4);border-radius:16px;padding:15px 17px;background:linear-gradient(150deg,rgba(255,45,196,.09),transparent 70%);display:flex;flex-direction:column;gap:14px')}>
                    {raceApplied && !raceEditing && appliedRace ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <div style={css('position:relative;display:flex;align-items:center;gap:11px;min-height:120px;border:1px solid rgba(255,45,196,.45);border-radius:12px;padding:14px;background:rgba(255,45,196,.06);overflow:hidden;' + anim('animation:sddAttachMag .55s cubic-bezier(.15,1.4,.4,1)'))}>
                          <span aria-hidden="true" style={css('position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;background:linear-gradient(112deg,transparent 42%,rgba(255,143,228,.7) 50%,transparent 58%);background-size:260% 100%;' + anim('animation:sddSweep 1s ease-out'))} />
                          <img src={appliedRace.img} alt="" style={css('width:48px;height:48px;border-radius:8px;object-fit:cover;' + anim('animation:sddPop .5s cubic-bezier(.15,1.5,.4,1)'))} />
                          <div style={{ minWidth: 0 }}>
                            <span style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.08em;color:var(--magenta-soft);border:1px solid var(--magenta);border-radius:5px;padding:2px 7px')}>装備予定</span>
                            <b style={css('display:block;margin-top:6px;font-family:var(--font-jp);font-size:14px;color:var(--text)')}>{appliedRace.name}</b>
                          </div>
                          <span style={{ flex: 1 }} />
                          <button type="button" onClick={swapRace} style={css('appearance:none;background:rgba(255,45,196,.1);color:var(--magenta-soft);border:1px solid rgba(255,45,196,.5);border-radius:9px;padding:6px 12px;font-family:var(--font-display);font-size:10.5px;cursor:pointer;align-self:flex-start')}>差し替える</button>
                          <button type="button" onClick={cancelRace} style={css('appearance:none;background:transparent;color:var(--muted);border:1px dashed var(--border);border-radius:9px;padding:6px 12px;font-family:var(--font-display);font-size:10.5px;cursor:pointer;align-self:flex-start')}>取消</button>
                        </div>
                        <span style={css('font-family:var(--font-mono);font-size:8.5px;color:var(--faint)')}>レース直前まで何度でも差し替え可。凍結時に確定・課金します。</span>
                      </div>
                    ) : (
                      <>
                        <div style={css('font-family:var(--font-jp);font-size:11px;color:var(--muted)')}>予報（的中率70%）を読んで次のレースに備える。的中なら適性が上限側へ、<b style={{ color: 'var(--magenta-soft)' }}>外れたら下限側へ下がる</b>。</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {raceGroups.map((g) => (
                            <div key={g.label}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                                <span style={css('width:20px;height:20px;border-radius:5px;overflow:hidden;display:inline-flex;border:1px solid rgba(255,255,255,.1)')}><img src={g.ico} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
                                <span style={css('font-family:var(--font-display);font-weight:700;font-size:11.5px;color:var(--text)')}>{g.label}</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                                {g.items.map((it) => (
                                  <button key={it.key} type="button" onClick={() => selectRace(it.key)} style={css(it.style)}>
                                    <span style={{ width: '100%', aspectRatio: '1/1', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,.35)', display: 'block' }}><img src={it.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></span>
                                    <span style={css('font-family:var(--font-jp);font-weight:700;font-size:10px;color:var(--text);margin-top:5px;display:block')}>{it.strengthLabel}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div style={css('border-top:1px solid var(--border-soft);padding-top:12px')}>
                          <div style={css('font-family:var(--font-display);font-size:10px;letter-spacing:.12em;color:var(--gold);margin-bottom:7px')}>保険 — どの条件でも底上げ</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 7 }}>
                            {insuranceItems.map((it) => (
                              <button key={it.key} type="button" onClick={() => selectRace(it.key)} style={css(it.style)}>
                                <img src={it.img} alt="" style={css('width:38px;height:38px;border-radius:7px;object-fit:cover;flex:none')} />
                                <span style={{ textAlign: 'left', minWidth: 0 }}>
                                  <span style={css('font-family:var(--font-jp);font-weight:700;font-size:11px;color:var(--text);display:block')}>{it.name}</span>
                                  <span style={css('font-family:var(--font-mono);font-size:8.5px;color:var(--muted);display:block')}>{it.note}</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div style={css('font-family:var(--font-mono);font-size:10px;color:var(--muted);min-height:1.1rem')}>{raceHint}</div>
                        <button type="button" onClick={applyRace} style={css(raceApplyBtnStyle)}>{raceApplyBtnLabel}</button>
                        <details style={css('border-top:1px solid var(--border-soft);padding-top:10px')}>
                          <summary style={css('cursor:pointer;list-style:none;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;color:var(--faint)')}>他の条件（{otherConds.map((o) => o.label).join('・')}）に備える ▸</summary>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                            {otherConds.map((o) => (
                              <div key={o.label} style={css('display:flex;align-items:center;gap:9px;padding:7px 9px;border:1px solid var(--border-soft);border-radius:9px;background:rgba(255,255,255,.02)')}>
                                <span style={css('width:22px;height:22px;border-radius:5px;overflow:hidden;display:inline-flex;border:1px solid rgba(255,255,255,.1)')}><img src={o.ico} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></span>
                                <span style={css('font-family:var(--font-display);font-weight:700;font-size:11px;color:var(--muted)')}>{o.label}</span>
                                <span style={{ flex: 1 }} />
                                <span style={css('font-family:var(--font-mono);font-size:9px;color:var(--faint)')}>弱 · 中 · 強</span>
                              </div>
                            ))}
                            <div style={css('font-family:var(--font-mono);font-size:9px;color:var(--faint);line-height:1.6')}>今夜と噛み合わない条件は畳んである。20点あっても、迷うのは「どの条件・どの強さ」だけ。</div>
                          </div>
                        </details>
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {/* ===== E 文脈(畳む) ===== */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={css('font-family:var(--font-display);font-weight:800;font-size:11px;letter-spacing:.06em;color:var(--faint);background:rgba(255,255,255,.05);border-radius:5px;padding:2px 7px')}>E</span>
                  <span style={css('font-family:var(--font-display);font-size:12px;letter-spacing:.14em;color:var(--muted)')}>文脈</span>
                </div>

                <details style={css('border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,rgba(20,18,34,0),var(--panel))')} open>
                  <summary style={css('cursor:pointer;list-style:none;padding:12px 15px;font-family:var(--font-display);font-size:10.5px;letter-spacing:.1em;color:var(--muted)')}>価値ラダー — 7日で上がる階段 ▸</summary>
                  <div style={{ padding: '0 16px 15px' }}>
                    <div style={css('font-family:var(--font-mono);font-size:11px;color:var(--muted);margin-bottom:12px')}>現在 <b style={css('font-family:var(--font-display);font-size:14px;color:var(--gold-bright)')}>{value}</b> USDT<span style={css('color:var(--faint)')}> → </span><span style={css('color:var(--cyan)')}>{ladderNextLabel}</span> <b style={css('font-family:var(--font-display);font-size:14px;color:var(--cyan)')}>{ladderNextVal}</b> USDT</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 120 }}>
                      {ladder.map((b, i) => (
                        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, height: '100%', minWidth: 0 }}>
                          <div style={css('font-family:var(--font-mono);font-size:8px;color:var(--faint);white-space:nowrap')}>{b.price}</div>
                          <div style={css(b.barStyle)} />
                          <div style={css('font-family:var(--font-mono);font-size:8px;color:var(--muted);white-space:nowrap')}>{b.day}</div>
                        </div>
                      ))}
                    </div>
                    <div style={css('font-family:var(--font-mono);font-size:9px;color:#4a4668;margin-top:10px;line-height:1.55')}>Day7 を走破すれば買い戻し 200 USDT（チャンピオン報酬）。数字は価格表（PRICE_TABLE_V1）の実値。</div>
                  </div>
                </details>

                <details style={css('border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,rgba(20,18,34,0),var(--panel))')}>
                  <summary style={css('cursor:pointer;list-style:none;padding:12px 15px;font-family:var(--font-display);font-size:10.5px;letter-spacing:.1em;color:var(--muted)')}>育成者クレジット — 誰が育てたか ▸</summary>
                  <div style={{ padding: '0 15px 14px' }}>
                    {h.breeders.map((b, i) => (
                      <div key={i} style={css('display:flex;align-items:baseline;gap:10px;padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px;border-radius:6px;' + (b.you ? 'background:rgba(53,208,127,.06);' : ''))}>
                        <span style={css(`flex:1;font-family:var(--font-jp);color:${b.you ? '#35d07f' : 'var(--text)'};font-weight:${b.you ? '700' : '400'}`)}>{b.name}</span>
                        <span style={css('font-family:var(--font-mono);color:var(--gold-bright);font-weight:700')}>{b.pct}%</span>
                        <span style={css('font-family:var(--font-mono);color:var(--muted)')}>+{b.delta}</span>
                      </div>
                    ))}
                    <div style={css('font-family:var(--font-mono);font-size:9px;color:#4a4668;margin-top:8px')}>所有権が移っても残る恒久記録。</div>
                  </div>
                </details>

                <details style={css('border:1px solid var(--border);border-radius:14px;background:linear-gradient(180deg,rgba(20,18,34,0),#0f0d1a)')}>
                  <summary style={css('cursor:pointer;list-style:none;padding:12px 15px;font-family:var(--font-display);font-size:10.5px;letter-spacing:.1em;color:var(--faint)')}>PROVENANCE — 検証情報 ▸</summary>
                  <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline' }}><span style={css('font-family:var(--font-mono);font-size:10px;color:var(--faint)')}>DNA HASH</span><span style={css('font-family:var(--font-mono);font-size:10.5px;color:var(--muted);word-break:break-all;text-align:right')}>{h.dnaText}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 9 }}><span style={css('font-family:var(--font-mono);font-size:10px;color:var(--faint)')}>MINT SEED</span><span style={css('font-family:var(--font-mono);font-size:10.5px;color:var(--muted);word-break:break-all;text-align:right')}>{h.seedText}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 9 }}><span style={css('font-family:var(--font-mono);font-size:10px;color:var(--faint)')}>GEN VERSION</span><span style={css('font-family:var(--font-mono);font-size:10.5px;color:var(--muted)')}>v3.0</span></div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
