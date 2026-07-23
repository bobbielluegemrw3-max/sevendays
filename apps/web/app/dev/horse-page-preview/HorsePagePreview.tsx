'use client';

import { useEffect, useRef, useState } from 'react';
import type { Surface, TrackCondition, Weather } from '@sevendays/domain';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import { FormPanel } from '@/components/FormPanel';
import { buildFormPanelData, type FormPanelSource } from '@/lib/form-panel-data';
import s from '../../horse-page-preview.module.css';

/* ============================================================================
 * /dev/horse-page-preview — 馬個別ページ 再デザイン(新デザイナーV2ハンドオフ)
 *
 * 正典: handoff「Horse Page Composition.zip」/ 仕様書.md。
 *   ・PC=2カラム(左=大アート sticky 0.84fr / 右=B読む→C/D備える→E文脈 1.16fr)。
 *   ・馬柱(B)=承認済み A案: <FormPanel variant="v2">(色分けテキスト/緑→シアン/レース予想板)。
 *   ・③今夜の条件ドライバーバー「今夜はこの3つに備える」で予報→調教→アイテムを直結。
 *   ・④手応え=金オーラ一閃＋TOTALカウントアップ(赤不使用・安っぽい文字ポップは廃止)。
 *   ・調教アイテムは確定後に選択→装着(+1)。レースアイテムは予報駆動・今夜のだけ前。
 *
 * ★プレビュー限定。データ/API/canvas には触らない。本番 HorseDetailView への結線は
 *   オーナーが実機スクショで承認したのち。R1: 生値なし・+デルタは演出用の代表値。
 * ========================================================================== */

type StateKey = 'active' | 'rookie' | 'grail' | 'listed';
type Vp = 'pc' | 'mobile';

interface RunLite {
  weather: Weather;
  track: TrackCondition;
  surface: Surface;
  rank: number;
  entrants: number;
}
interface Case {
  kana: string;
  en: string;
  dna: string;
  tv: number;
  type: string;
  day: number;
  value: number;
  cond: number;
  fat: number;
  band: 'safe' | 'mid';
  bandText: string;
  group: string;
  shield: number;
  grail?: boolean;
  listed?: boolean;
  rookie?: boolean;
  forecast: { weather: Weather; track: TrackCondition; surface: Surface };
  runs: RunLite[];
  breeder: string;
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

// メニュー6(実画像) — キー/条件/画像。※「今夜向き」バッジは出さない(仕様書§4.1)。
const MENUS = [
  { key: 'hill', name: '坂路', cond: '道悪', img: 'menu_hill' },
  { key: 'pool', name: '水泳', cond: '雨', img: 'menu_pool' },
  { key: 'wood', name: 'ウッド', cond: '芝', img: 'menu_wood' },
  { key: 'gate', name: 'ゲート', cond: '良馬場', img: 'menu_gate' },
  { key: 'spar', name: '併せ馬', cond: 'ダート', img: 'menu_spar' },
  { key: 'rest', name: '調整', cond: '晴', img: 'menu_rest' },
] as const;
// 条件の意味色(FormPanel v2 / レースページと一致・§3-1)。
const COND_COLOR: Record<string, string> = {
  雨: '#6fc3ff', 晴: '#ffd97a', 道悪: '#e6b24a', 良馬場: '#35d07f', 芝: '#58d68d', ダート: '#d8a05a',
};
// 6条件エンブレム(レースアイテム棚のグループ見出し用)。
const EMBLEM: Record<string, string> = { 雨: 'rain', 晴: 'sun', 道悪: 'mud', 良馬場: 'firm', 芝: 'turf', ダート: 'dirt' };
const emb = (c: string) => `/conditions/emblem_${EMBLEM[c] ?? 'rain'}.webp`;

// 調教アイテム6🔵(強化ラダー4＋減衰よけ2・実画像)。
const FEEDS = [
  { key: 'feed_s', name: '強化 S', meta: '総合+小/外れ−' },
  { key: 'feed_m', name: '強化 M', meta: '総合+中/外れ−' },
  { key: 'feed_l', name: '強化 L', meta: '総合+大/外れ−1.5' },
  { key: 'feed_xl', name: '強化 XL', meta: '総合+特大/外れ−3' },
  { key: 'shield_1', name: '星霜の砂 1走', meta: '減衰よけ ×1走' },
  { key: 'shield_3', name: '星霜の砂 3走', meta: '減衰よけ ×3走' },
] as const;

// レースアイテム(6条件×3段＋保険・実画像)。
const TIERS = [['弱', 'weak'], ['中', 'mid'], ['強', 'strong']] as const;
const RACE_GROUPS = [
  { cond: '雨', name: '雨の備え', base: 'rain_cape', label: '雨のケープ' },
  { cond: '晴', name: '晴の備え', base: 'sun_hat', label: '日よけ帽' },
  { cond: '道悪', name: '道悪の備え', base: 'mud_shoes', label: '泥よけ蹄鉄' },
  { cond: '良馬場', name: '良馬場の備え', base: 'speed_shoes', label: '快速蹄鉄' },
  { cond: '芝', name: '芝の備え', base: 'turf_shoes', label: '芝蹄鉄' },
  { cond: 'ダート', name: 'ダートの備え', base: 'dirt_shoes', label: '砂蹄鉄' },
] as const;
const PRICE = [100, 111.2, 123.65, 137.5, 152.9, 170.0, 177.16];
const tierClass = (tv: number) => (tv >= 90 ? s.tGold : tv >= 70 ? s.tCyan : s.tSteel);

function srcOf(c: Case): FormPanelSource {
  return {
    kana: c.kana, en: c.en, totalValue: c.tv, horseType: c.type,
    runs: c.runs.map((r) => ({ weather: r.weather, track: r.track, surface: r.surface, rank: r.rank, entrants: r.entrants })),
    forecast: c.forecast,
  };
}
/** 今夜の予報の3条件(グループ名)。 */
function tonightConds(c: Case): { weather: string; ground: string; course: string } {
  const w = ['RAIN', 'STORM'].includes(c.forecast.weather) ? '雨' : '晴';
  const g = ['SOFT', 'HEAVY'].includes(c.forecast.track) ? '道悪' : '良馬場';
  const co = c.forecast.surface === 'TURF' ? '芝' : 'ダート';
  return { weather: w, ground: g, course: co };
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
  const tn = tonightConds(c);
  const tonight = [tn.weather, tn.ground, tn.course];
  const showPrepare = !c.rookie && !c.listed; // C/D を出す(出走中・聖杯)
  const runsTonight = !c.listed;
  const badge = statusBadge(state);

  // ライブ状態(調教/アイテム)
  const [menu, setMenu] = useState<Set<number>>(new Set());
  const [feed, setFeed] = useState<number | null>(null);
  const [race, setRace] = useState<string | null>(null);
  const [trained, setTrained] = useState(false);
  const [cond, setCond] = useState(c.cond);
  const [fat, setFat] = useState(c.fat);
  const [condD, setCondD] = useState<number | null>(null);
  const [fatD, setFatD] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [centerRx, setCenterRx] = useState<{ word: string; sub: string; kind: 'train' | 'race' } | null>(null);
  const [tvShown, setTvShown] = useState(c.tv);
  const [bump, setBump] = useState(false);
  const [flash, setFlash] = useState<{ mag: boolean } | null>(null);

  const heroRef = useRef<HTMLDivElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const rxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tvRaf = useRef<number | null>(null);
  const tvTarget = useRef(c.tv);

  // 状態切替でライブをリセット
  useEffect(() => {
    setMenu(new Set()); setFeed(null); setRace(null); setTrained(false);
    setCond(c.cond); setFat(c.fat); setCondD(null); setFatD(null); setCollapsed({});
    setCenterRx(null); setTvShown(c.tv); tvTarget.current = c.tv;
  }, [state, c.cond, c.fat, c.tv]);

  const reduce = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  const heroInView = () => {
    const el = heroRef.current;
    if (!el) return true;
    const r = el.getBoundingClientRect();
    return r.bottom > 40 && r.top < (typeof window !== 'undefined' ? window.innerHeight : 800) - 40;
  };

  function countUpTo(target: number) {
    if (typeof window === 'undefined') { setTvShown(target); return; }
    const from = tvShown;
    const start = performance.now();
    const dur = 720;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setTvShown(from + (target - from) * e);
      if (p < 1) tvRaf.current = requestAnimationFrame(step);
    };
    if (tvRaf.current) cancelAnimationFrame(tvRaf.current);
    tvRaf.current = requestAnimationFrame(step);
  }

  // ★手応え演出(④): 金/意味色オーラ一閃＋TOTALカウントアップ＋光の粒。赤・文字ポップ不使用。
  function react(mag: boolean, totalDelta: number, word: string, sub: string) {
    tvTarget.current = Math.min(100, Math.round(tvTarget.current + totalDelta));
    const target = tvTarget.current;
    if (reduce()) { setTvShown(target); return; }
    countUpTo(target);
    setBump(true); setTimeout(() => setBump(false), 500);
    setFlash({ mag });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 850);
    const color = mag ? '#ff2dc4' : '#f2e4bf';
    if (heroInView() && fxRef.current) {
      spawnShock(fxRef.current, color);
      spawnSparks(fxRef.current, color);
      if (zoomRef.current) {
        zoomRef.current.style.transform = 'scale(1.06)';
        setTimeout(() => { if (zoomRef.current) zoomRef.current.style.transform = 'scale(1)'; }, 260);
      }
    } else {
      setCenterRx({ word, sub, kind: mag ? 'race' : 'train' });
      if (rxTimer.current) clearTimeout(rxTimer.current);
      rxTimer.current = setTimeout(() => setCenterRx(null), 1500);
    }
  }

  function confirmTraining() {
    if (trained || menu.size === 0) return;
    const condUp = 6 + Math.round(Math.random() * 6);
    const fatUp = 8 + Math.round(Math.random() * 8);
    setCond((v) => Math.min(100, v + condUp));
    setFat((v) => Math.min(100, v + fatUp));
    setCondD(condUp); setFatD(fatUp);
    setTimeout(() => { setCondD(null); setFatD(null); }, 1900);
    setTrained(true);
    react(false, 3, '手応えあり', `CONDITION +${condUp} · 疲労 +${fatUp}`); // 代表値+3
  }

  function toggleFeed(i: number) {
    if (!trained) return; // 調教アイテムは確定後にのみ有効(仕様書§4.2)
    if (feed === i) { setFeed(null); return; }
    setFeed(i);
    react(false, 1, '装着', `${FEEDS[i]!.name} を添付`); // 代表値+1
  }

  function toggleRace(key: string, condName: string) {
    if (race === key) { setRace(null); return; }
    setRace(key);
    react(true, 2, '装備', `${condName}の備えをこの夜に賭ける`); // 代表値+2
  }

  const menuNames = [...menu].map((i) => MENUS[i]!.name);
  const feedName = feed !== null ? FEEDS[feed]!.name : null;
  const armed = menu.size > 0 && !trained;

  return (
    <div className={s.wrap}>
      {/* 状態/ビューポート切替(プレビュー用ツールバー) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '12px 20px', background: 'rgba(8,6,16,.86)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--hpp-border)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.16em', color: 'var(--hpp-gold)' }}>馬個別ページ 再デザイン(V2ハンドオフ・PC2カラム)</span>
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
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--hpp-faint)' }}>馬柱=A案(色分けテキスト) · 手応え=金オーラ＋TOTALカウントアップ(赤不使用)</span>
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
                {c.shield ? <span className={`${s.badge}`} style={{ color: 'var(--hpp-cyan)', borderColor: 'rgba(0,234,255,.3)' }}>SHIELD ×{c.shield}</span> : null}
              </div>
              <div className={s.mastEn}>{c.en.toUpperCase()} · LV.{c.day}/7</div>
            </div>
            <div className={s.mastR}>
              <div className={s.mastValK}>現在価値</div>
              <div className={s.mastVal}>{c.value.toFixed(2)}<small>USDT</small></div>
            </div>
          </div>

          {/* ===== MAIN GRID: A アート | B〜E ===== */}
          <div className={`${s.mainGrid} ${showPrepare ? '' : s.mainGridReadOnly}`}>

            {/* ---- A 誰の馬か(アートカード・sticky) ---- */}
            <div className={s.artCol}>
              <div ref={heroRef} className={`${s.hero} ${c.grail ? s.grail : ''} ${tierClass(c.tv)} ${s.auraHost} ${flash ? s.flash : ''} ${flash?.mag ? s.flashMag : ''}`}>
                <div className={s.artStage} style={{ height: vp === 'mobile' ? 340 : 420 }}>
                  {c.grail ? <div className={s.grailTag}>★ LEGENDARY · 総合値90+</div> : null}
                  <div className={s.pagerInfo}>{c.group}</div>
                  <div className={`${s.pager} ${s.prev}`} title="前の馬へ">‹</div>
                  <div className={`${s.pager} ${s.next}`} title="次の馬へ">›</div>
                  {showPrepare ? (
                    <div className={`${s.socket} ${race ? s.filled : ''}`}>
                      <div className={s.sk}>{race ? <img src={`/items/${race}.webp`} alt="" /> : '＋'}</div>
                      <div className={s.skCap}>{race ? '装備中' : '装備枠'}</div>
                    </div>
                  ) : null}
                  <div ref={zoomRef} className={s.artZoom}>
                    <NftHorseArt look={deriveNftLook(c.dna, c.en)} />
                  </div>
                  <div ref={fxRef} className={s.fxLayer} />
                </div>
                <div className={s.idBar}>
                  <div><div className={`${s.tvNum} ${bump ? s.bump : ''}`}>{Math.round(tvShown)}</div><div className={s.tvCap}>総合値 TOTAL</div></div>
                  <div><div className={s.kana}>{c.kana}</div><div className={s.en}>{c.en}</div><span className={s.type}>{c.type}</span></div>
                  <div className={s.tvVal}>現在価値 {c.value.toFixed(2)} USDT</div>
                </div>
                <div className={s.dayRail}>
                  <span className={s.lv}>LV.{c.day}/7</span>
                  <div className={s.pips}>{Array.from({ length: 7 }, (_, i) => <span key={i} className={i <= c.day ? s.on : (i === c.day + 1 && runsTonight ? s.spark : '')} />)}</div>
                </div>
                <div className={s.vitals}>
                  <div className={s.vital}>
                    <div className={s.vTop}><span className={s.vName}>CONDITION 調子</span><span><span className={s.vNum}>{cond}</span><span className={`${s.vD} ${s.up}`} style={{ opacity: condD ? 1 : 0 }}>+{condD}</span></span></div>
                    <div className={`${s.vbar} ${s.cond}`}><i style={{ width: `${cond}%` }} /></div>
                  </div>
                  <div className={s.vital}>
                    <div className={s.vTop}><span className={s.vName}>FATIGUE 疲労</span><span><span className={s.vNum}>{fat}</span><span className={`${s.vD} ${s.down}`} style={{ opacity: fatD ? 1 : 0 }}>+{fatD}</span></span></div>
                    <div className={`${s.vbar} ${s.fat}`}><i style={{ width: `${fat}%` }} /></div>
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
                <>
                  {/* ③ 今夜の条件ドライバーバー */}
                  <div className={s.tonightBar}>
                    <div className={s.tonightRow}>
                      <span className={s.tonightK}>今夜はこの3つに備える</span>
                      <span className={s.tonightHit}>予報 70% · 目安</span>
                      <div className={s.tonightConds}>
                        <span className={s.tonightCond}>天候<b style={{ color: COND_COLOR[tn.weather] }}>{tn.weather}</b></span>
                        <span className={s.tonightCond}>馬場<b style={{ color: COND_COLOR[tn.ground] }}>{tn.ground}</b></span>
                        <span className={s.tonightCond}>コース<b style={{ color: COND_COLOR[tn.course] }}>{tn.course}</b></span>
                      </div>
                    </div>
                  </div>

                  {/* ===== C 備える① 調教(シアン) ===== */}
                  <div className={s.sec}>
                    <div className={s.blkTag}><span className={`${s.n} ${s.train}`}>C</span><span className={s.t}>備える① — 調教する</span><span className={s.s}>青=強くする</span></div>
                    <div className={`${s.card} ${s.train}`}>
                      <div className={s.plan}>
                        <div className={s.pLine}>今夜=<b>{tonight.join(' · ')}</b>／{menuNames.length ? <>メニュー <b>{menuNames.join('＋')}</b></> : 'メニュー未選択'}{feedName ? <>／アイテム <b>{feedName}</b></> : null}</div>
                        <div className={s.pHint}>{armed ? 'この作戦で調教します。クリックで確定' : trained ? '調教は確定済み。下の調教アイテムで詰められます' : '噛み合う条件のメニューを選ぶと確定ボタンが起動します'}</div>
                      </div>
                      <div className={s.menuGrid}>
                        {MENUS.map((m, i) => {
                          const on = menu.has(i);
                          return (
                            <div key={m.key} className={`${s.menu} ${on ? s.on : ''}`}
                              onClick={() => { if (trained) return; setMenu((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else if (n.size < 2) n.add(i); return n; }); }}>
                              <div className={s.mThumb}><img src={`/menus/${m.img}.webp`} alt="" /></div>
                              <div className={s.mPick}>✓</div>
                              <div className={s.mName}>{m.name}</div>
                              <div className={s.mCond} style={{ color: COND_COLOR[m.cond] }}>〔{m.cond}〕</div>
                            </div>
                          );
                        })}
                      </div>
                      <div className={s.trainFoot}>
                        <span className={s.pickState}>メニューを2つまで選ぶ <b>{menu.size}/2</b></span>
                        <button className={`${s.cta} ${armed ? s.armed : ''}`} disabled={!armed} onClick={confirmTraining}>
                          <span className={s.charge} />
                          <span>{trained ? '今日は調教済み' : armed ? '調教を確定' : 'メニューを選ぶ'}</span>
                          <span className={s.sub}>{trained ? 'また明日' : armed ? `${menuNames.join('＋')} で強くする` : '— 選択待ち'}</span>
                        </button>
                      </div>
                      <div className={s.subH}><span className={s.dot} />調教アイテムを添付 — 強くする（確定後・購入して装着）</div>
                      <div className={s.itemRow}>
                        {FEEDS.map((f, i) => (
                          <div key={f.key} className={`${s.pill} ${feed === i ? s.on : ''}`} style={{ opacity: trained ? 1 : 0.45, cursor: trained ? 'pointer' : 'not-allowed' }} onClick={() => toggleFeed(i)}>
                            <div className={s.pThumb}><img src={`/items/${f.key}.webp`} alt="" /></div>
                            <div className={s.pName}>{f.name}</div>
                            <div className={s.pMeta}>{f.meta}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* ===== D 備える② レースアイテム(マゼンタ) ===== */}
                  <div className={s.sec}>
                    <div className={s.blkTag}><span className={`${s.n} ${s.race}`}>D</span><span className={s.t}>備える② — 今夜に賭ける</span><span className={s.s}>予報駆動 · 今夜のだけ前に</span></div>
                    <div className={`${s.card} ${s.race}`}>
                      {[...RACE_GROUPS].sort((a, b) => (tonight.includes(a.cond) ? 0 : 1) - (tonight.includes(b.cond) ? 0 : 1)).map((g, gi) => {
                        const isT = tonight.includes(g.cond);
                        const col = collapsed[gi] ?? !isT;
                        return (
                          <div key={g.base} className={`${s.grp} ${isT ? s.tonight : ''} ${col ? s.collapsed : ''}`}>
                            <div className={s.grpHead} onClick={() => setCollapsed((p) => ({ ...p, [gi]: !(p[gi] ?? !isT) }))}>
                              <div className={s.grpIco}><img src={emb(g.cond)} alt="" /></div>
                              <span className={s.grpName} style={{ color: COND_COLOR[g.cond] }}>{g.name}</span>
                              <span className={s.grpCue}>{col ? '＋ 開く' : isT ? '噛み合えば本命' : '保険'}</span>
                            </div>
                            <div className={s.grpBody}>
                              {TIERS.map(([jp, key]) => {
                                const itemKey = `${g.base}_${key}`;
                                return (
                                  <div key={itemKey} className={`${s.raceItem} ${race === itemKey ? s.on : ''}`} onClick={() => toggleRace(itemKey, g.cond)}>
                                    <div className={s.riThumb}><img src={`/items/${itemKey}.webp`} alt="" /></div>
                                    <div className={s.riName}>{g.label} {jp}</div>
                                    <div className={s.riTier}>{key === 'weak' ? 'ベーシック' : key === 'mid' ? 'スタンダード' : 'プレミアム'}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {/* 保険(全天候) */}
                      <div className={s.grp}>
                        <div className={s.grpHead}><div className={s.grpIco}>🛡</div><span className={s.grpName}>保険（万全の備え）</span><span className={s.grpCue}>外れなし</span></div>
                        <div className={s.grpBody}>
                          {[['full_ready_std', '万全の備え'], ['full_ready_max', '万全の備え・極']].map(([k, nm]) => (
                            <div key={k} className={`${s.raceItem} ${race === k ? s.on : ''}`} onClick={() => toggleRace(k!, '全天候')}>
                              <div className={s.riThumb}><img src={`/items/${k}.webp`} alt="" /></div>
                              <div className={s.riName}>{nm}</div>
                              <div className={s.riTier}>保険</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className={s.pHint} style={{ marginTop: 4 }}>的中で上限側 / 外れは下限側へ下がる（予報は70%の目安）。</div>
                    </div>
                  </div>
                </>
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

      {/* ★中央反応(アートが視界外=モバイルスクロール時のみ・スクロールしない) */}
      {centerRx ? (
        <div className={`${s.centerRx} ${centerRx.kind === 'race' ? s.race : ''}`}>
          <div className={s.centerRxWord}>{centerRx.word}</div>
          <div className={s.centerRxSub}>{centerRx.sub}</div>
        </div>
      ) : null}
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

/* ===== FX(アート上・視界内のときだけ) — Web Animations API。金/意味色の光の粒＋衝撃波。 ===== */
function spawnShock(fx: HTMLElement, color: string) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;left:50%;top:54%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;border:3px solid ${color}`;
  fx.appendChild(el);
  el.animate([{ width: '40px', height: '40px', margin: '-20px 0 0 -20px', opacity: 0.9, borderWidth: '4px' }, { width: '360px', height: '360px', margin: '-180px 0 0 -180px', opacity: 0, borderWidth: '1px' }], { duration: 640, easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = () => el.remove();
}
function spawnSparks(fx: HTMLElement, color: string, count = 16) {
  for (let i = 0; i < count; i++) {
    const sp = document.createElement('div');
    sp.style.cssText = `position:absolute;width:6px;height:6px;border-radius:50%;background:${color};left:50%;top:54%;box-shadow:0 0 8px 2px ${color}`;
    fx.appendChild(sp);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const dist = 90 + Math.random() * 140;
    sp.animate([{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }, { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px),calc(-50% + ${Math.sin(ang) * dist}px)) scale(.3)` }], { duration: 500 + Math.random() * 350, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => sp.remove();
  }
}
