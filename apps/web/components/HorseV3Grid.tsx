'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { NftHorseArt } from '@/components/NftHorseArt';
import { HeroArtFx } from '@/components/HeroArtFx';
import { HeroReactionOverlay } from '@/components/HeroReactionOverlay';
import { deriveNftLook, NIGHT_LOOK } from '@/lib/nft-visual';
import s from '../app/horse-detail.module.css';

/* ============================================================================
 * HorseV3Grid — 馬個別ページ V3 の 2カラム構図(ヒーロー＋B＋C/D＋E)を1つの
 * クライアント部品に統合。★これにより「アイテム使用→総合値カウントアップ＋アートの
 * 金オーラ一閃」がモック(/dev/horse-page-preview)どおり連動する。
 * B(馬柱)・E(文脈)・結末カード・管理系はサーバー側で描画してスロットで受け取る。
 * ハンドオフ正典を忠実移植。+デルタ(確定+3/装着+1/装備+2)は演出用の代表値。
 * ========================================================================== */

function css(text: string): CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of text.split(';')) {
    const i = decl.indexOf(':'); if (i < 0) continue;
    const k = decl.slice(0, i).trim(); const v = decl.slice(i + 1).trim();
    if (!k) continue;
    o[k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_m: string, ch: string) => ch.toUpperCase())] = v;
  }
  return o;
}

const HERO_COLOR: Record<string, string> = {
  black: 'rgba(6,6,10,0.72)', red: '#e5322d', blue: '#2f6bff', yellow: '#ffcf1f', green: '#22c55e',
};
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
const condToKey: Record<string, string> = {
  雨: 'rain_cape', 晴: 'sun_hat', 道悪: 'mud_shoes', 良馬場: 'speed_shoes', 芝: 'turf_shoes', ダート: 'dirt_shoes',
};
const NORMALIZE_COND: Record<string, string> = { 嵐: '雨', 曇: '晴', 稍重: '道悪', 不良: '道悪', 高速: '良馬場', 良: '良馬場' };
const normCond = (v: string) => NORMALIZE_COND[v] ?? v;
const ALL_CONDS = ['雨', '晴', '道悪', '良馬場', '芝', 'ダート'];
const INS = [
  { key: 'full_ready_std', name: '完全装備', note: '3条件を標準で底上げ' },
  { key: 'full_ready_max', name: '野営一式', note: '3条件を最大で底上げ' },
];

export interface HorseV3Data {
  id: string; name: string; horse_type: string; dna_hash: string; current_day: number;
  total_value?: number | null;
  tonight_rank?: number | null; tonight_entrants?: number | null; tonight_band?: 'SAFE' | 'MID' | 'RISK' | null;
  night_variant?: boolean; golden_star?: boolean; golden_aura?: boolean;
  revenge_flame?: boolean; revenge_gold?: boolean; milestone?: boolean;
  color_variant?: 'black' | 'red' | 'blue' | 'yellow' | 'green' | null;
  decay_shield_v2?: number;
  race_item_v2?: { item_key: string } | null;
}

export function HorseV3Grid({
  horse, forecast, pagerSlot, isActive, lvMode, footSlot, markFlame, markMilestone,
  formSlot, controlsSlot, contextSlot, outcomeSlot,
}: {
  horse: HorseV3Data;
  /** 群ラベルの今夜予報 {axis,val}。 */
  forecast: { axis: string; val: string }[];
  pagerSlot?: ReactNode;
  isActive: boolean;
  lvMode: boolean;
  /** アート下部の1行(順位バンド or 状態行)。常に何か出して空にしない。 */
  footSlot: ReactNode;
  markFlame: string; markMilestone: string;
  formSlot: ReactNode;         // B 馬柱(FormPanel v2)
  controlsSlot?: ReactNode;    // 管理系(非売指定・転送)
  contextSlot: ReactNode;      // E 文脈(価値ラダー/育成者/PROVENANCE)
  outcomeSlot?: ReactNode;     // 非ACTIVE の結末/出品カード
}) {
  const look = horse.night_variant ? NIGHT_LOOK : deriveNftLook(horse.dna_hash, horse.name);
  const isGrail = (horse.total_value ?? 0) >= 90;
  const baseTotal = Math.round(horse.total_value ?? 0);
  const hasTotal = horse.total_value != null;

  // ---- 状態機械(正典) ----
  const [trainPhase, setTrainPhase] = useState<'pick' | 'confirm' | 'done'>('pick');
  const [itemPhase, setItemPhase] = useState<'locked' | 'pick' | 'attached' | 'skipped'>('locked');
  const [menus, setMenus] = useState<string[]>([]);
  const [trainItemKey, setTrainItemKey] = useState('');
  const [attachedKey, setAttachedKey] = useState<string | null>(null);
  const [raceKey, setRaceKey] = useState('');
  const [raceApplied, setRaceApplied] = useState<string | null>(null);
  const [raceEditing, setRaceEditing] = useState(false);
  const [displayTotal, setDisplayTotal] = useState(baseTotal);
  const [auraOn, setAuraOn] = useState(false);
  const [prefersReduce, setPrefersReduce] = useState(false);

  const dispRef = useRef(baseTotal);
  const targetRef = useRef(baseTotal);
  const rafRef = useRef<number | null>(null);
  const auraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion:reduce)');
    const on = () => setPrefersReduce(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const anim = (spec: string) => (prefersReduce ? '' : spec);

  const targetTotal = baseTotal + (trainPhase === 'done' ? 3 : 0) + (attachedKey ? 1 : 0) + (raceApplied ? 2 : 0);
  useEffect(() => {
    if (targetTotal === targetRef.current) return;
    const increased = targetTotal > targetRef.current;
    targetRef.current = targetTotal;
    const from = dispRef.current; const target = targetTotal;
    if (typeof window === 'undefined' || prefersReduce) { dispRef.current = target; setDisplayTotal(target); return; }
    if (increased) {
      setAuraOn(true);
      if (auraTimer.current) clearTimeout(auraTimer.current);
      auraTimer.current = setTimeout(() => setAuraOn(false), 1400);
    }
    const start = performance.now(); const dur = increased ? 800 : 450;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - p, 3);
      const val = from + (target - from) * e; dispRef.current = val; setDisplayTotal(Math.round(val));
      if (p < 1) rafRef.current = requestAnimationFrame(step); else { dispRef.current = target; setDisplayTotal(target); }
    };
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, [targetTotal, prefersReduce]);

  // ---- handlers ----
  function toggleMenu(key: string) {
    if (trainPhase !== 'pick') return;
    setMenus((prev) => { const m = prev.slice(); if (m.length >= 2) { const idx = m.indexOf(key); if (idx >= 0) m.splice(idx, 1); else return prev; } else m.push(key); return m; });
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

  // ---- computed ----
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

  const tonightConds = forecast.map((f) => normCond(f.val)).filter((v) => condToKey[v]);
  const raceGroups = tonightConds.map((cond) => {
    const base = condToKey[cond]!;
    const items = STRENGTHS.map((stt) => {
      const key = `${base}_${stt.s}`; const on = raceKey === key;
      const style = 'appearance:none;text-align:center;cursor:pointer;display:flex;flex-direction:column;border-radius:10px;padding:7px;color:inherit;'
        + (on ? 'border:1px solid var(--magenta);box-shadow:0 0 0 2px rgba(255,45,196,.28);background:rgba(255,45,196,.08);' : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
      return { img: ITEM(key), strengthLabel: stt.label, key, style };
    });
    return { label: cond, ico: ICO(cond), items };
  });
  const insuranceItems = INS.map((it) => {
    const on = raceKey === it.key;
    const style = 'appearance:none;cursor:pointer;display:flex;align-items:center;gap:9px;border-radius:10px;padding:8px 9px;color:inherit;'
      + (on ? 'border:1px solid var(--gold);box-shadow:0 0 0 2px rgba(201,168,106,.28);background:rgba(201,168,106,.08);' : 'border:1px solid var(--border);background:rgba(10,8,22,.5);');
    return { ...it, img: ITEM(it.key), style };
  });
  const otherConds = ALL_CONDS.filter((cc) => !tonightConds.includes(cc)).map((cc) => ({ label: cc, ico: ICO(cc) }));
  const raceSelName = (() => {
    if (!raceKey) return '';
    const ins = INS.find((x) => x.key === raceKey); if (ins) return ins.name;
    const parts = raceKey.split('_'); const stt = parts.pop()!;
    const sl = ({ weak: '弱', mid: '中', strong: '強' } as Record<string, string>)[stt] || '';
    const cond = Object.keys(condToKey).find((k) => condToKey[k] === parts.join('_'));
    return `${cond || ''} ${sl}`;
  })();
  const raceHint = raceKey ? `${raceSelName} を装備 — 的中で上限側 / 外れは下限側` : '今夜の条件のアイテムから選ぶ。横スクロールなし。';
  const raceApplyBtnStyle = 'appearance:none;border-radius:11px;padding:9px 16px;font-family:var(--font-display);font-weight:700;font-size:12px;cursor:pointer;border:none;'
    + (raceKey ? 'color:#fff;background:linear-gradient(100deg,var(--magenta),#ff6bd6);box-shadow:0 10px 24px -8px rgba(255,45,196,.6);' : 'color:var(--faint);background:rgba(255,255,255,.05);cursor:not-allowed;');
  const raceApplyBtnLabel = raceKey ? (raceEditing ? `${raceSelName}に差し替える` : `${raceSelName}を購入して装備`) : 'アイテムを選ぶ';
  const appliedRace = raceApplied ? (() => {
    const ins = INS.find((x) => x.key === raceApplied); if (ins) return { name: ins.name, img: ITEM(ins.key) };
    const parts = raceApplied.split('_'); const stt = parts.pop()!;
    const sl = ({ weak: '弱', mid: '中', strong: '強' } as Record<string, string>)[stt] || '';
    const cond = Object.keys(condToKey).find((k) => condToKey[k] === parts.join('_'));
    return { name: `${cond || ''} ${sl}`, img: ITEM(raceApplied) };
  })() : null;

  // hero
  const heroFrameStyle = 'border-radius:18px;padding:1px;box-shadow:0 18px 40px -18px rgba(0,0,0,.7);'
    + (isGrail ? 'background:conic-gradient(from 140deg,#5a4a1e,#f2e4bf,#fff6da,var(--gold-bright),#f2e4bf,#c9a86a,#5a4a1e);'
              : 'background:conic-gradient(from 140deg,#3a2f18,var(--gold),#f2e4bf,var(--cyan),var(--magenta),var(--gold),#3a2f18);');
  const totalColor = isGrail ? 'var(--gold-bright)' : (baseTotal >= 85 ? 'var(--gold-bright)' : baseTotal >= 70 ? '#a9f6ff' : 'var(--text)');
  const totalStyle = `font-family:var(--font-display);font-weight:900;font-size:38px;line-height:1;color:${totalColor};` + (auraOn ? 'text-shadow:0 0 18px rgba(242,228,191,.7);' : '');
  const pips = Array.from({ length: 7 }, (_, idx) => {
    const i = idx + 1; let bg = 'rgba(255,255,255,.1)';
    if (i <= horse.current_day) bg = 'var(--cyan)';
    if (i === horse.current_day + 1 && isActive) bg = 'var(--magenta)';
    const ex = (i === horse.current_day + 1 && isActive) ? 'box-shadow:0 0 7px var(--magenta);' : '';
    return `flex:1;height:6px;border-radius:2px;background:${bg};${ex}`;
  });

  const rootVars = { '--border-soft': 'rgba(255,255,255,.055)', '--good-dim': 'rgba(53,208,127,.5)' } as unknown as CSSProperties;

  return (
    <div className={s.v3grid} style={rootVars}>
      {/* ---- A ヒーロー(正典・聖杯発光・総合値カウントアップ連動) ---- */}
      <div className={s.v3artcol}>
        <div style={css(heroFrameStyle)}>
          <div style={{ borderRadius: 17, background: 'linear-gradient(180deg,#12101d,#0a0813)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className={s.v3HeroArt} style={{ position: 'relative', minHeight: 360, display: 'flex', background: 'radial-gradient(90% 80% at 50% 42%,rgba(0,234,255,.07),transparent 70%)' }}>
              {isGrail ? <span aria-hidden="true" style={css('position:absolute;inset:-30%;z-index:0;pointer-events:none;background:conic-gradient(from 0deg,transparent,rgba(242,228,191,.16),transparent 30%,rgba(0,234,255,.12),transparent 55%,rgba(255,45,196,.12),transparent 80%,rgba(242,228,191,.16));' + anim('animation:sddGrailSpin 14s linear infinite'))} /> : null}
              <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex' }}>
                <HeroReactionOverlay horseId={horse.id} horseName={horse.name} dnaHash={horse.dna_hash} />
                <HeroArtFx horseId={horse.id}>
                  <NftHorseArt look={look} />
                  {(horse.decay_shield_v2 ?? 0) > 0 ? <span className={s.shieldFilm} aria-hidden="true" /> : null}
                </HeroArtFx>
                {horse.color_variant ? <span className={s.heroColorSkin} style={{ background: HERO_COLOR[horse.color_variant], mixBlendMode: horse.color_variant === 'black' ? 'multiply' : 'color' }} /> : null}
              </div>
              {/* ★手応え演出: 金オーラ一閃＋光スイープ(アイテム/確定でauraOn) */}
              {auraOn ? (
                <>
                  <span aria-hidden="true" style={css('position:absolute;inset:8px;border-radius:14px;pointer-events:none;z-index:4;animation:sddAura 1.6s ease-out')} />
                  <span aria-hidden="true" style={css('position:absolute;inset:0;z-index:4;pointer-events:none;mix-blend-mode:color-dodge;background:linear-gradient(112deg,transparent 42%,rgba(242,228,191,.85) 50%,transparent 58%);background-size:260% 100%;animation:sddSweep 1.1s ease-out')} />
                </>
              ) : null}
              {horse.race_item_v2 ? <span className={s.gearBadge} title={`装着中: ${horse.race_item_v2.item_key}`}><img src={`/items/${horse.race_item_v2.item_key}.webp`} alt="" /></span> : null}
              {(horse.decay_shield_v2 ?? 0) > 0 ? <span className={s.shieldChip}>SHIELD ×{horse.decay_shield_v2}</span> : null}
              {horse.night_variant ? <span className={s.heroNightTag}>MIDNIGHT</span> : null}
              {horse.revenge_flame ? <span className={`${s.heroFlameTag} ${horse.revenge_gold ? s.heroFlameGold : ''}`}>{markFlame}</span> : null}
              {horse.milestone ? <span className={s.heroMilestone}>{markMilestone}</span> : null}
              {isGrail ? <span title="聖杯" style={css('position:absolute;top:12px;right:14px;z-index:5;color:#ffd977;font-size:26px;line-height:1;text-shadow:0 0 14px #ffcf4bdd,0 0 4px #fff;pointer-events:none')}>★</span> : null}
              <div style={css('position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,8,19,0) 46%,rgba(10,8,19,.92) 96%);pointer-events:none')} />
              {pagerSlot}
              <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', rowGap: 6, textShadow: '0 2px 10px rgba(5,4,9,.85)' }}>
                <div>
                  <div style={css('font-family:var(--font-mono);font-size:9.5px;color:var(--muted);letter-spacing:.08em')}>{horse.name.toUpperCase()}</div>
                  <div style={css('font-family:var(--font-display);font-weight:800;font-size:15px;color:var(--text);letter-spacing:.02em')}>{horse.horse_type}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flex: 'none' }}>
                  {hasTotal ? (
                    <div style={{ textAlign: 'right' }}>
                      <div style={css('font-family:var(--font-display);font-size:8.5px;color:var(--faint);letter-spacing:.14em')}>TOTAL</div>
                      <div style={css(totalStyle)}>{Math.round(displayTotal)}</div>
                    </div>
                  ) : null}
                  <div style={{ textAlign: 'right' }}>
                    <div style={css('font-family:var(--font-display);font-size:8.5px;color:var(--faint);letter-spacing:.14em')}>{lvMode ? 'LV' : 'DAY'}</div>
                    <div style={css('font-family:var(--font-display);font-weight:800;font-size:26px;color:var(--cyan);line-height:1')}>{Math.min(7, horse.current_day)}<small style={css('font-size:13px;color:var(--faint)')}>/7</small></div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '13px 16px 15px' }}>
              <div style={{ display: 'flex', gap: 4 }}>{pips.map((p, i) => <span key={i} style={css(p)} />)}</div>
              {footSlot}
            </div>
          </div>
        </div>
      </div>

      {/* ---- 右レール: B → C/D → E ---- */}
      <div className={s.v3rail}>
        <div className={s.v3sec}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={css('font-family:var(--font-display);font-weight:800;font-size:11px;letter-spacing:.06em;color:#04141a;background:var(--cyan);border-radius:5px;padding:2px 7px')}>B</span>
            <span style={css('font-family:var(--font-display);font-size:12px;letter-spacing:.14em;color:var(--text)')}>読む — 馬柱</span>
            <span style={css('font-family:var(--font-jp);font-size:11px;color:var(--faint)')}>予報 × 成績 × レース予想板</span>
          </div>
          {formSlot}
        </div>

        {isActive ? (
          <>
            {/* ③ 今夜バー */}
            <div style={css('border:1px solid var(--border-strong);border-radius:14px;padding:12px 15px;background:linear-gradient(100deg,rgba(0,234,255,.08),rgba(255,45,196,.05))')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={css('font-family:var(--font-display);font-size:10px;letter-spacing:.14em;color:var(--text)')}>今夜はこの3つに備える</span>
                <span style={css('font-family:var(--font-mono);font-size:8px;color:var(--faint);letter-spacing:.06em')}>予報 70% · 目安</span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                  {forecast.map((cc) => (
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

            <div style={css('border:1px solid rgba(0,234,255,.4);border-radius:16px;padding:15px 17px;background:linear-gradient(150deg,rgba(0,234,255,.10),transparent 70%);display:flex;flex-direction:column;gap:14px')}>
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
                      <span style={css('font-family:var(--font-mono);font-size:10px;color:var(--muted)')}>総合値が {baseTotal} → <b style={{ color: 'var(--good)' }}>{Math.round(displayTotal)}</b> に上がった</span>
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
            {controlsSlot ? <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{controlsSlot}</div> : null}
          </>
        ) : (outcomeSlot ?? null)}

        {/* E 文脈 */}
        <div className={s.v3sec}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={css('font-family:var(--font-display);font-weight:800;font-size:11px;letter-spacing:.06em;color:var(--faint);background:rgba(255,255,255,.05);border-radius:5px;padding:2px 7px')}>E</span>
            <span style={css('font-family:var(--font-display);font-size:12px;letter-spacing:.14em;color:var(--muted)')}>文脈</span>
          </div>
          {contextSlot}
        </div>
      </div>
    </div>
  );
}
