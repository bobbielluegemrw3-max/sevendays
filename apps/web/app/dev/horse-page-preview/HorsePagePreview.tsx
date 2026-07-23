'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { Surface, TrackCondition, Weather } from '@sevendays/domain';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import { FormPanel } from '@/components/FormPanel';
import { buildFormPanelData, type FormPanelSource } from '@/lib/form-panel-data';
import s from '../../horse-page-preview.module.css';

/* ============================================================================
 * /dev/horse-page-preview — 馬個別ページ 再デザイン(新デザイナーV2ハンドオフ)
 *
 * ★C/D(調教・調教アイテム・レースアイテム)は同梱正典 Horse Page Composition.html を
 *   そのまま写経(構造・インラインstyle・状態機械を一致)。推測での改変は入れない。
 *   - C 調教: STEP① メニュー選択→確認→確定 / STEP② 調教アイテムは①確定までロック
 *   - D レース: 今夜3条件を展開(弱中強)＋保険2点＋<details>で他条件を畳む
 *   - 手応え: TOTALメダルのカウントアップ＋金オーラ＋装着アニメ(sddAttach/sddSweep/sddPop)
 * A アート/B 馬柱(FormPanel variant="v2")は既存資産を2カラムに配置。
 * データ/API/canvasには触らない。R1: 生値なし・+デルタは演出用の代表値(確定+3/装着+1/装備+2)。
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

interface RunLite { weather: Weather; track: TrackCondition; surface: Surface; rank: number; entrants: number; }
interface Case {
  kana: string; en: string; dna: string; tv: number; type: string;
  day: number; value: number; cond: number; fat: number;
  band: 'safe' | 'mid'; bandText: string; group: string; shield: number;
  grail?: boolean; listed?: boolean; rookie?: boolean;
  forecast: { weather: Weather; track: TrackCondition; surface: Surface };
  runs: RunLite[]; breeder: string;
}

const CASES: Record<StateKey, Case> = {
  active: {
    kana: 'クリムゾン ノヴァ', en: 'Crimson Nova', dna: 'seed-crimson-nova-01', tv: 72, type: 'BALANCED',
    day: 3, value: 137.5, cond: 62, fat: 38, band: 'safe', bandText: 'LV帯内 4位/12頭 · 安全圏', group: '出走中 · 3/12', shield: 2,
    forecast: { weather: 'RAIN', track: 'SOFT', surface: 'TURF' },
    runs: [
      { weather: 'STORM', track: 'SOFT', surface: 'TURF', rank: 3, entrants: 38 },
      { weather: 'RAIN', track: 'HEAVY', surface: 'TURF', rank: 2, entrants: 40 },
      { weather: 'SUNNY', track: 'FAST', surface: 'DIRT', rank: 22, entrants: 38 },
      { weather: 'RAIN', track: 'SOFT', surface: 'DIRT', rank: 5, entrants: 36 },
      { weather: 'CLOUDY', track: 'GOOD', surface: 'TURF', rank: 14, entrants: 38 },
    ],
    breeder: '育成者 st***@gmail.com · 貢献 34% · 売却後も名誉として記録',
  },
  rookie: {
    kana: 'オニキス ドーン', en: 'Onyx Dawn', dna: 'seed-onyx-dawn-01', tv: 58, type: 'POWER',
    day: 0, value: 100, cond: 70, fat: 10, band: 'mid', bandText: 'LV帯内 —（初出走）· 目安なし', group: '出走中 · 8/12', shield: 0, rookie: true,
    forecast: { weather: 'RAIN', track: 'HEAVY', surface: 'DIRT' },
    runs: [{ weather: 'SUNNY', track: 'GOOD', surface: 'DIRT', rank: 16, entrants: 38 }],
    breeder: '育成者 あなた · 貢献 100% · この馬の最初の走りはこれから',
  },
  grail: {
    kana: 'サクレッド ゲイル', en: 'Sacred Gale', dna: 'seed-sacred-gale-01', tv: 93, type: 'SPRINTER',
    day: 5, value: 170.0, cond: 85, fat: 22, band: 'safe', bandText: 'LV帯内 1位/9頭 · 安全圏', group: 'チャンピオン候補 · 1/3', shield: 3, grail: true,
    forecast: { weather: 'SUNNY', track: 'GOOD', surface: 'TURF' },
    runs: [
      { weather: 'SUNNY', track: 'GOOD', surface: 'TURF', rank: 1, entrants: 40 },
      { weather: 'CLOUDY', track: 'FAST', surface: 'TURF', rank: 1, entrants: 38 },
      { weather: 'SUNNY', track: 'GOOD', surface: 'DIRT', rank: 3, entrants: 36 },
      { weather: 'RAIN', track: 'HEAVY', surface: 'TURF', rank: 8, entrants: 38 },
      { weather: 'SUNNY', track: 'FAST', surface: 'TURF', rank: 2, entrants: 40 },
    ],
    breeder: '育成者 ka***@gmail.com · 貢献 51% · 伝説の馬を育てた栄誉',
  },
  listed: {
    kana: 'エメラルド ゲイル', en: 'Emerald Gale', dna: 'seed-emerald-gale-01', tv: 78, type: 'SPRINTER',
    day: 2, value: 123.65, cond: 60, fat: 30, band: 'mid', bandText: '出品中 · 今夜は走らない', group: '出品中 · 2/5', shield: 0, listed: true,
    forecast: { weather: 'SUNNY', track: 'GOOD', surface: 'TURF' },
    runs: [
      { weather: 'SUNNY', track: 'GOOD', surface: 'TURF', rank: 1, entrants: 40 },
      { weather: 'CLOUDY', track: 'FAST', surface: 'TURF', rank: 4, entrants: 38 },
      { weather: 'RAIN', track: 'HEAVY', surface: 'TURF', rank: 19, entrants: 38 },
      { weather: 'SUNNY', track: 'GOOD', surface: 'DIRT', rank: 12, entrants: 36 },
      { weather: 'SUNNY', track: 'FAST', surface: 'TURF', rank: 2, entrants: 40 },
    ],
    breeder: '育成者 em***@gmail.com · 貢献 42%',
  },
};

// ---- 正典データ(canonical.html より写経) --------------------------------
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
  { key: 'hill', name: '坂路', cond: '道悪' },
  { key: 'pool', name: '水泳', cond: '雨' },
  { key: 'wood', name: 'ウッド', cond: '芝' },
  { key: 'gate', name: 'ゲート', cond: '良馬場' },
  { key: 'spar', name: '併せ馬', cond: 'ダート' },
  { key: 'rest', name: '調整', cond: '晴' },
];
const TRAIN_ITEMS = [
  { key: 'feed_s', name: '強化フード 小', kind: '強化 +小' },
  { key: 'feed_m', name: '強化フード 中', kind: '強化 +中' },
  { key: 'feed_l', name: '強化フード 大', kind: '強化 +大' },
  { key: 'feed_xl', name: '強化フード 特大', kind: '強化 +特大' },
  { key: 'shield_1', name: '星霜の砂 ×1', kind: '減衰よけ 1走' },
  { key: 'shield_3', name: '星霜の砂 ×3', kind: '減衰よけ 3走' },
];
const STRENGTHS = [
  { s: 'weak', label: '弱' },
  { s: 'mid', label: '中' },
  { s: 'strong', label: '強' },
];
const condToKey: Record<string, string> = { 雨: 'rain_cape', 道悪: 'mud_shoes', 芝: 'turf_shoes' };
const INS = [
  { key: 'full_ready_std', name: '完全装備', note: '3条件を標準で底上げ' },
  { key: 'full_ready_max', name: '野営一式', note: '3条件を最大で底上げ' },
];
const PRICE = [100, 111.2, 123.65, 137.5, 152.9, 170.0, 177.16];
const tierClass = (tv: number) => (tv >= 90 ? s.tGold : tv >= 70 ? s.tCyan : s.tSteel);

function srcOf(c: Case): FormPanelSource {
  return {
    kana: c.kana, en: c.en, totalValue: c.tv, horseType: c.type,
    runs: c.runs.map((r) => ({ weather: r.weather, track: r.track, surface: r.surface, rank: r.rank, entrants: r.entrants })),
    forecast: c.forecast,
  };
}
/** 今夜の予報(色分けテキスト用の {axis,val} 配列)。 */
function forecastOf(c: Case): { axis: string; val: string }[] {
  const w = ['RAIN', 'STORM'].includes(c.forecast.weather) ? (c.forecast.weather === 'STORM' ? '嵐' : '雨') : (c.forecast.weather === 'CLOUDY' ? '曇' : '晴');
  const g = ['SOFT', 'HEAVY'].includes(c.forecast.track) ? (c.forecast.track === 'HEAVY' ? '不良' : '道悪') : (c.forecast.track === 'FAST' ? '高速' : '良馬場');
  const co = c.forecast.surface === 'TURF' ? '芝' : 'ダート';
  return [{ axis: '天候', val: w }, { axis: '馬場', val: g }, { axis: 'コース', val: co }];
}
function statusBadge(k: StateKey): { label: string; cls: string } {
  if (k === 'grail') return { label: '聖杯 90+', cls: s.badgeGrail! };
  if (k === 'listed') return { label: '出品中', cls: s.badgeListed! };
  if (k === 'rookie') return { label: '新馬', cls: s.badgeActive! };
  return { label: '出走中', cls: s.badgeActive! };
}

export function HorsePagePreview() {
  const [state, setState] = useState<StateKey>('active');
  const [vp, setVp] = useState<Vp>('pc');
  const c = CASES[state];
  const forecast = forecastOf(c);
  const showPrepare = !c.rookie && !c.listed;
  const runsTonight = !c.listed;
  const badge = statusBadge(state);

  // 正典と同じ状態機械
  const [trainPhase, setTrainPhase] = useState<'pick' | 'confirm' | 'done'>('pick');
  const [itemPhase, setItemPhase] = useState<'locked' | 'pick' | 'attached' | 'skipped'>('locked');
  const [menus, setMenus] = useState<string[]>([]);
  const [trainItemKey, setTrainItemKey] = useState('');
  const [attachedKey, setAttachedKey] = useState<string | null>(null);
  const [raceKey, setRaceKey] = useState('');
  const [raceApplied, setRaceApplied] = useState<string | null>(null);
  const [displayTotal, setDisplayTotal] = useState(c.tv);
  const [auraOn, setAuraOn] = useState(false);

  const tvRaf = useRef<number | null>(null);
  const auraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTrainPhase('pick'); setItemPhase('locked'); setMenus([]); setTrainItemKey('');
    setAttachedKey(null); setRaceKey(''); setRaceApplied(null); setDisplayTotal(c.tv); setAuraOn(false);
  }, [state, c.tv]);

  const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  function countUp(before: number, target: number, dur: number) {
    if (typeof window === 'undefined' || reduce()) { setDisplayTotal(target); return; }
    setAuraOn(true);
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisplayTotal(Math.round(before + (target - before) * e));
      if (p < 1) tvRaf.current = requestAnimationFrame(step);
    };
    if (tvRaf.current) cancelAnimationFrame(tvRaf.current);
    tvRaf.current = requestAnimationFrame(step);
    if (auraTimer.current) clearTimeout(auraTimer.current);
    auraTimer.current = setTimeout(() => setAuraOn(false), dur + 850);
  }

  // ---- handlers(正典 resetInteractions / toggleMenu ... より写経) ----
  function toggleMenu(key: string) {
    if (trainPhase !== 'pick') return;
    setMenus((prev) => {
      const m = prev.slice();
      if (m.length >= 2) { const idx = m.indexOf(key); if (idx >= 0) m.splice(idx, 1); else return prev; }
      else m.push(key);
      return m;
    });
  }
  const removeMenuAt = (i: number) => setMenus((prev) => { const m = prev.slice(); m.splice(i, 1); return m; });
  const startConfirm = () => { if (menus.length === 0) return; setTrainPhase('confirm'); };
  const cancelConfirm = () => setTrainPhase('pick');
  function confirmTraining() {
    const before = c.tv; const target = before + 3;
    setTrainPhase('done'); setItemPhase('pick');
    countUp(before, target, 850);
  }
  const selectTrainItem = (key: string) => setTrainItemKey(key);
  function attachTrainItem() {
    if (!trainItemKey) return;
    const before = displayTotal; const target = before + 1;
    setAttachedKey(trainItemKey); setItemPhase('attached');
    countUp(before, target, 650);
  }
  const skipTrainItem = () => { setItemPhase('skipped'); setTrainItemKey(''); };
  const unskipTrainItem = () => setItemPhase('pick');
  const selectRace = (key: string) => setRaceKey(key);
  function applyRace() {
    if (!raceKey) return;
    const before = displayTotal; const target = before + 2;
    setRaceApplied(raceKey);
    countUp(before, target, 650);
  }
  const cancelRace = () => { setRaceApplied(null); setRaceKey(''); };

  // ---- computed(正典 renderVals より写経) ----
  const numOn = 'width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:11px;color:#04141a;background:var(--cyan);flex:none;';
  const numDone = 'width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:11px;color:var(--good);background:rgba(53,208,127,.15);border:1px solid var(--good-dim);flex:none;';
  const numLock = 'width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;font-size:11px;color:var(--faint);background:rgba(255,255,255,.05);border:1px solid var(--border);flex:none;';

  const trainDone = trainPhase === 'done';
  const trainConfirming = trainPhase === 'confirm';
  const trainPicking = trainPhase === 'pick';
  const step1NumStyle = trainDone ? numDone : numOn;
  const step1Title = trainDone ? '① 調教を確定した' : '① 調教を確定する';

  const itemAttached = itemPhase === 'attached';
  const itemSkipped = itemPhase === 'skipped';
  const itemPicking = itemPhase === 'pick';
  const itemLocked = itemPhase === 'locked';
  const step2NumStyle = (itemAttached || itemSkipped) ? numDone : (itemPicking ? numOn : numLock);
  const step2Title = itemAttached ? '② 調教アイテムを装着した' : itemSkipped ? '② 調教アイテム — 見送り' : '② 調教アイテムで上乗せする';
  const step2TitleColor = itemLocked ? 'var(--faint)' : 'var(--text)';

  const menuCards = MENUS.map((m) => {
    const count = menus.filter((x) => x === m.key).length;
    const on = count > 0;
    const style = 'appearance:none;text-align:left;cursor:pointer;display:flex;flex-direction:column;border-radius:11px;padding:8px;color:inherit;transition:border-color .15s;'
      + (on ? 'border:1px solid var(--cyan);box-shadow:0 0 0 2px rgba(0,234,255,.25);background:rgba(0,234,255,.06);'
            : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
    return { ...m, img: MENU(m.key), count, style };
  });
  const pickedChips = menus.map((k, i) => ({ label: MENUS.find((x) => x.key === k)!.name, i }));

  const submitDisabled = menus.length === 0;
  const submitBtnStyle = 'appearance:none;border-radius:11px;padding:9px 16px;font-family:var(--font-display);font-weight:700;font-size:12px;letter-spacing:.04em;cursor:pointer;border:none;'
    + (submitDisabled ? 'color:var(--faint);background:rgba(255,255,255,.05);cursor:not-allowed;'
                      : 'color:#04141a;background:linear-gradient(100deg,var(--cyan),#5ff5ff 55%,var(--cyan));box-shadow:0 10px 24px -8px rgba(0,234,255,.7);');
  const submitBtnLabel = submitDisabled ? 'メニューを選ぶ' : `確認へ進む（${menus.length}/2）`;

  const trainItemCards = TRAIN_ITEMS.map((it) => {
    const on = trainItemKey === it.key;
    const style = 'appearance:none;text-align:left;cursor:pointer;display:flex;flex-direction:column;border-radius:10px;padding:7px;color:inherit;'
      + (on ? 'border:1px solid var(--cyan);box-shadow:0 0 0 2px rgba(0,234,255,.25);background:rgba(0,234,255,.06);' : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
    return { ...it, img: ITEM(it.key), style };
  });
  const selTrain = TRAIN_ITEMS.find((x) => x.key === trainItemKey);
  const trainItemHint = selTrain ? `${selTrain.kind} — 確定済みの調教へ1個だけ上乗せ` : 'カードを選ぶと効果が出ます。';
  const attachBtnStyle = 'appearance:none;border-radius:11px;padding:9px 16px;font-family:var(--font-display);font-weight:700;font-size:12px;cursor:pointer;border:none;'
    + (trainItemKey ? 'color:#04141a;background:linear-gradient(100deg,var(--cyan),#5ff5ff);box-shadow:0 10px 24px -8px rgba(0,234,255,.7);' : 'color:var(--faint);background:rgba(255,255,255,.05);cursor:not-allowed;');
  const attachBtnLabel = selTrain ? `${selTrain.name}を購入して装着` : 'アイテムを選ぶ';
  const attachedItem = attachedKey ? TRAIN_ITEMS.find((x) => x.key === attachedKey) : null;

  const tonightConds = forecast.map((f) => f.val).filter((v) => condToKey[v]);
  const raceGroups = tonightConds.map((cond) => {
    const base = condToKey[cond]!;
    const items = STRENGTHS.map((st) => {
      const key = `${base}_${st.s}`;
      const on = raceKey === key;
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
  const otherConds = [
    { label: '晴', ico: ICO('晴') },
    { label: '良馬場', ico: ICO('良馬場') },
    { label: 'ダート', ico: ICO('ダート') },
  ];
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
  const raceApplyBtnLabel = raceKey ? `${raceSelName}を購入して装備` : 'アイテムを選ぶ';
  const appliedRace = raceApplied ? (() => {
    const ins = INS.find((x) => x.key === raceApplied); if (ins) return { name: ins.name, img: ITEM(ins.key) };
    const parts = raceApplied.split('_'); const st = parts.pop()!;
    const sl = ({ weak: '弱', mid: '中', strong: '強' } as Record<string, string>)[st] || '';
    const cond = Object.keys(condToKey).find((k) => condToKey[k] === parts.join('_'));
    return { name: `${cond || ''} ${sl}`, img: ITEM(raceApplied) };
  })() : null;

  return (
    <div className={s.wrap}>
      {/* 状態/ビューポート切替(プレビュー用ツールバー) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 20px', background: 'rgba(8,6,16,.86)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--hpp-border)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.16em', color: 'var(--hpp-gold)' }}>馬個別ページ 再デザインV2(正典どおり・PC2カラム)</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['active', 'rookie', 'grail', 'listed'] as StateKey[]).map((k) => (
            <button key={k} onClick={() => setState(k)}
              style={{ fontSize: 10, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--hpp-border)', background: state === k ? 'rgba(201,168,106,.22)' : 'none', color: state === k ? 'var(--hpp-gold-bright)' : 'var(--hpp-muted)' }}>
              {k === 'active' ? '出走中' : k === 'rookie' ? '新馬' : k === 'grail' ? '聖杯90+' : '出品中'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['pc', 'mobile'] as Vp[]).map((k) => (
            <button key={k} onClick={() => setVp(k)}
              style={{ fontSize: 10, padding: '6px 11px', borderRadius: 7, cursor: 'pointer', border: '1px solid var(--hpp-border)', background: vp === k ? 'rgba(255,255,255,.1)' : 'none', color: vp === k ? 'var(--hpp-text)' : 'var(--hpp-muted)' }}>
              {k === 'pc' ? 'PC' : 'モバイル430'}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--hpp-faint)' }}>C/Dは正典HTMLを写経 · 手応え=TOTALカウントアップ＋金オーラ＋装着アニメ</span>
      </div>

      <div className={s.stageWrap}>
        <div className={`${s.page} ${vp === 'mobile' ? s.mobile : ''}`}>

          {/* ===== MASTHEAD(全幅) ===== */}
          <div className={s.mast}>
            <div>
              <div className={s.mastTitleRow}>
                <span className={s.mastTitle}>{c.kana}</span>
                <span className={`${s.badge} ${s.badgeType}`}>{c.type}</span>
                <span className={`${s.badge} ${badge.cls}`}>{badge.label}</span>
                {c.shield ? <span className={s.badge} style={{ color: 'var(--hpp-cyan)', borderColor: 'rgba(0,234,255,.3)' }}>SHIELD ×{c.shield}</span> : null}
              </div>
              <div className={s.mastEn}>{c.en.toUpperCase()} · LV.{c.day}/7</div>
            </div>
            <div className={s.mastR}>
              <div className={s.mastValK}>{c.listed ? '出品価格' : '現在価値'}</div>
              <div className={s.mastVal}>{c.value.toFixed(2)}<small>USDT</small></div>
            </div>
          </div>

          {/* ===== MAIN GRID: A アート | B〜E ===== */}
          <div className={`${s.mainGrid} ${showPrepare ? '' : s.mainGridReadOnly}`}>

            {/* ---- A 誰の馬か(アートカード・sticky) ---- */}
            <div className={s.artCol}>
              <div className={`${s.hero} ${c.grail ? s.grail : ''} ${tierClass(c.tv)} ${s.auraHost} ${auraOn ? s.flash : ''}`}>
                <div className={s.artStage} style={{ height: vp === 'mobile' ? 340 : 420 }}>
                  {c.grail ? <div className={s.grailTag}>★ LEGENDARY · 総合値90+</div> : null}
                  <div className={s.pagerInfo}>{c.group}</div>
                  <div className={`${s.pager} ${s.prev}`} title="前の馬へ">‹</div>
                  <div className={`${s.pager} ${s.next}`} title="次の馬へ">›</div>
                  <div className={s.artZoom}>
                    <NftHorseArt look={deriveNftLook(c.dna, c.en)} />
                  </div>
                </div>
                <div className={s.idBar}>
                  <div><div className={s.tvNum} style={auraOn ? { textShadow: '0 0 18px rgba(242,228,191,.7)' } : undefined}>{Math.round(displayTotal)}</div><div className={s.tvCap}>総合値 TOTAL</div></div>
                  <div><div className={s.kana}>{c.kana}</div><div className={s.en}>{c.en}</div><span className={s.type}>{c.type}</span></div>
                  <div className={s.tvVal}>現在価値 {c.value.toFixed(2)} USDT</div>
                </div>
                <div className={s.dayRail}>
                  <span className={s.lv}>LV.{c.day}/7</span>
                  <div className={s.pips}>{Array.from({ length: 7 }, (_, i) => <span key={i} className={i <= c.day ? s.on : (i === c.day + 1 && runsTonight ? s.spark : '')} />)}</div>
                </div>
                <div className={s.vitals}>
                  <div className={s.vital}>
                    <div className={s.vTop}><span className={s.vName}>CONDITION 調子</span><span className={s.vNum}>{c.cond}</span></div>
                    <div className={`${s.vbar} ${s.cond}`}><i style={{ width: `${c.cond}%` }} /></div>
                  </div>
                  <div className={s.vital}>
                    <div className={s.vTop}><span className={s.vName}>FATIGUE 疲労</span><span className={s.vNum}>{c.fat}</span></div>
                    <div className={`${s.vbar} ${s.fat}`}><i style={{ width: `${c.fat}%` }} /></div>
                  </div>
                </div>
                <div className={s.bandRow}>
                  <span className={`${s.chip} ${c.band === 'safe' ? s.safe : s.mid}`}>{c.bandText}</span>
                  {c.shield ? <span className={`${s.chip} ${s.shield}`}>SHIELD ×{c.shield}</span> : null}
                </div>
              </div>
            </div>

            {/* ---- 右レール: B 読む → ③/C/D 備える → E 文脈 ---- */}
            <div className={s.rightRail}>

              {/* B 読む(馬柱・承認済み A案 = variant="v2") */}
              <div className={s.sec}>
                <div className={s.blkTag}><span className={`${s.n} ${s.read}`}>B</span><span className={s.t}>読む — 馬柱</span><span className={s.s}>予報 × 成績 × レース予想板</span></div>
                <FormPanel d={buildFormPanelData(srcOf(c))} variant="v2" />
              </div>

              {c.listed ? (
                <div className={s.listedNote}>■ この馬は<b style={{ color: 'var(--hpp-gold-bright)' }}>出品中</b>です。今夜は走りません（調教・レースアイテムは非表示）。上の馬柱は<b style={{ color: 'var(--hpp-gold-bright)' }}>買い手の目利き材料</b>として表示しています。</div>
              ) : c.rookie ? (
                <div className={s.listedNote}>■ この馬は<b style={{ color: 'var(--hpp-cyan)' }}>新馬</b>です。適性はまだ謎——<b style={{ color: 'var(--hpp-cyan)' }}>走らせて暴け</b>。走ったぶんだけ馬柱に読みが増えます。</div>
              ) : (
                /* ===== 備える(出走中/聖杯のみ・正典どおり写経) ===== */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  {/* ③ 今夜の条件ドライバーバー */}
                  <div style={css('border:1px solid var(--border-strong);border-radius:14px;padding:12px 15px;background:linear-gradient(100deg,rgba(0,234,255,.08),rgba(255,45,196,.05))')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={css('font-family:var(--font-display);font-size:10px;letter-spacing:.14em;color:var(--text)')}>今夜はこの3つに備える</span>
                      <span style={css('font-family:var(--font-mono);font-size:8px;color:var(--faint);letter-spacing:.06em')}>予報 70% · 目安</span>
                      <div style={{ flex: 1 }} />
                      <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                        {forecast.map((cc) => (
                          <span key={cc.axis} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
                            <span style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.1em;color:var(--faint)')}>{cc.axis}</span>
                            <b style={css(`font-family:var(--font-sans);font-weight:800;font-size:12px;color:${condColor(cc.val)}`)}>{cc.val}</b>
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

                    {/* STEP 1 メニュー */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={css(step1NumStyle)}>1</span>
                        <span style={css('font-family:var(--font-display);font-weight:700;font-size:12px;color:var(--text)')}>{step1Title}</span>
                      </div>

                      {trainDone ? (
                        <div style={css('display:flex;flex-direction:column;gap:8px;border:1px solid var(--border-strong);border-radius:12px;padding:12px;background:rgba(10,8,22,.6)')}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {pickedChips.map((m, i) => (
                              <span key={i} style={css('font-family:var(--font-mono);font-size:11px;color:var(--text);border:1px solid var(--border);border-radius:999px;padding:2px 10px;background:rgba(10,8,22,.5)')}>{m.label}</span>
                            ))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <span style={css('font-family:var(--font-display);font-weight:800;font-size:15px;color:var(--good)')}>手応えあり</span>
                            <span style={css('font-family:var(--font-mono);font-size:10px;color:var(--muted)')}>総合値が {c.tv} → <b style={{ color: 'var(--good)' }}>{Math.round(displayTotal)}</b> に上がった</span>
                          </div>
                          <div style={css('font-family:var(--font-jp);font-size:10.5px;color:var(--muted)')}>このサイクルの調教は確定。次のレースへ持ち越します。</div>
                        </div>
                      ) : null}

                      {trainConfirming ? (
                        <div style={css('display:flex;flex-direction:column;gap:10px;min-height:300px;border:1px solid var(--border-strong);border-radius:12px;padding:14px;background:rgba(10,8,22,.6)')}>
                          <div style={css('font-family:var(--font-display);font-weight:700;font-size:13px;color:var(--text)')}>この内容で確定しますか？</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {pickedChips.map((m, i) => (
                              <span key={i} style={css('font-family:var(--font-mono);font-size:11px;color:var(--text);border:1px solid var(--border);border-radius:999px;padding:2px 10px;background:rgba(10,8,22,.5)')}>{m.label}</span>
                            ))}
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
                            {pickedChips.map((m) => (
                              <button key={m.i} type="button" onClick={() => removeMenuAt(m.i)} style={css('font-family:var(--font-mono);font-size:11px;color:var(--cyan);cursor:pointer;border:1px solid rgba(0,234,255,.35);border-radius:999px;padding:2px 9px;background:rgba(0,234,255,.06)')}>{m.label} ✕</button>
                            ))}
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
                        <div style={css('position:relative;display:flex;align-items:center;gap:10px;border:1px solid rgba(53,208,127,.4);border-radius:11px;padding:9px 11px;background:rgba(53,208,127,.06);overflow:hidden;animation:sddAttach .55s cubic-bezier(.15,1.4,.4,1)')}>
                          <span aria-hidden="true" style={css('position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;background:linear-gradient(112deg,transparent 42%,rgba(157,255,196,.7) 50%,transparent 58%);background-size:260% 100%;animation:sddSweep 1s ease-out')} />
                          <img src={ITEM(attachedItem.key)} alt="" style={css('width:34px;height:34px;border-radius:7px;object-fit:cover;animation:sddPop .5s cubic-bezier(.15,1.5,.4,1)')} />
                          <span style={css('font-family:var(--font-jp);font-size:12px;color:var(--text)')}>{attachedItem.name} を装着</span>
                          <span style={{ flex: 1 }} />
                          <span style={css('font-family:var(--font-display);font-weight:800;font-size:13px;color:var(--good)')}>上乗せ済み</span>
                        </div>
                      ) : null}

                      {itemLocked ? (
                        <div style={css('font-family:var(--font-jp);font-size:11px;color:var(--faint)')}>まず①の調教を確定してください。</div>
                      ) : null}

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

                    {appliedRace ? (
                      <div style={css('position:relative;display:flex;align-items:center;gap:11px;min-height:120px;border:1px solid rgba(255,45,196,.45);border-radius:12px;padding:14px;background:rgba(255,45,196,.06);overflow:hidden;animation:sddAttachMag .55s cubic-bezier(.15,1.4,.4,1)')}>
                        <span aria-hidden="true" style={css('position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen;background:linear-gradient(112deg,transparent 42%,rgba(255,143,228,.7) 50%,transparent 58%);background-size:260% 100%;animation:sddSweep 1s ease-out')} />
                        <img src={appliedRace.img} alt="" style={css('width:48px;height:48px;border-radius:8px;object-fit:cover;animation:sddPop .5s cubic-bezier(.15,1.5,.4,1)')} />
                        <div style={{ minWidth: 0 }}>
                          <span style={css('font-family:var(--font-mono);font-size:9px;letter-spacing:.08em;color:var(--magenta-soft);border:1px solid var(--magenta);border-radius:5px;padding:2px 7px')}>装備予定</span>
                          <b style={css('display:block;margin-top:6px;font-family:var(--font-jp);font-size:14px;color:var(--text)')}>{appliedRace.name}</b>
                        </div>
                        <span style={{ flex: 1 }} />
                        <button type="button" onClick={cancelRace} style={css('appearance:none;background:rgba(255,45,196,.1);color:var(--magenta-soft);border:1px solid rgba(255,45,196,.5);border-radius:9px;padding:6px 12px;font-family:var(--font-display);font-size:10.5px;cursor:pointer;align-self:flex-start')}>取消</button>
                      </div>
                    ) : (
                      <>
                        <div style={css('font-family:var(--font-jp);font-size:11px;color:var(--muted)')}>予報（的中率70%）を読んで次のレースに備える。的中なら適性が上限側へ、<b style={{ color: 'var(--magenta-soft)' }}>外れたら下限側へ下がる</b>。</div>

                        {/* tonight condition groups */}
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

                        {/* insurance */}
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

                        {/* other conditions collapsed */}
                        <details style={css('border-top:1px solid var(--border-soft);padding-top:10px')}>
                          <summary style={css('cursor:pointer;list-style:none;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.08em;color:var(--faint)')}>他の条件（晴・良馬場・ダート）に備える ▸</summary>
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
              )}

              {/* ===== E 文脈(畳む) ===== */}
              <div className={s.sec}>
                <div className={s.blkTag}><span className={`${s.n} ${s.ctx}`}>E</span><span className={s.t}>文脈</span><span className={s.s}>今夜の判断に不要なものは畳む</span></div>
                <Fold title="価値ラダー — 7日間の価格と走破" open>
                  <div className={s.ladder}>
                    {PRICE.map((p, i) => (
                      <div key={i} className={`${s.d} ${i === c.day ? s.on : ''} ${i === 6 ? s.win : ''}`}><div className={s.dl}>LV.{i}</div><div className={s.dv}>{p}</div></div>
                    ))}
                  </div>
                  <div className={s.credLine} style={{ marginTop: 9 }}>7日走り切ると <b>200 USDT で買い戻し</b>＋記念NFT。表の値は各LVの現在価値（PRICE_TABLE_V1）。</div>
                </Fold>
                <Fold title="育成者クレジット"><div className={s.credLine}>{c.breeder}</div></Fold>
                <Fold title="PROVENANCE — 検証情報"><div className={s.prov}><b>DNA</b> {c.dna}… · <b>SEED</b> 0x7d3e…2b · <b>世代</b> G2 · 決定論生成（誰でも再現・検証可能）</div></Fold>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Fold({ title, open, children }: { title: string; open?: boolean; children: React.ReactNode }) {
  const [o, setO] = useState(!!open);
  return (
    <div className={`${s.fold} ${o ? s.open : ''}`}>
      <div className={s.foldHead} onClick={() => setO((v) => !v)}>{title}<span className={s.arw}>›</span></div>
      <div className={s.foldBody}>{children}</div>
    </div>
  );
}
