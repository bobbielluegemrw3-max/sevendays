'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { refreshSoft } from '@/lib/deferred-refresh';
import { apiFetch, errorMessage } from '@/lib/client-api';
import {
  type ItemCopy,
  effectSummary,
  effectShort,
  itemName,
  type CatalogItem,
  type DailyConditions,
  type InventoryData,
  type ItemEffectV3,
  type ItemTransaction,
} from '@/lib/items';
import {
  SURFACE_JA,
  SURFACE_PROBABILITY_V1,
  TRACK_JA,
  TRACK_PROBABILITY_V1,
  WEATHER_JA,
  WEATHER_PROBABILITY_V1,
} from '@sevendays/domain';
import { localDateTime } from '@/lib/format-time';
import s from '../app/items.module.css';
import { ErrorLine } from '@/components/ui/ErrorLine';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/**
 * /items — 道具部屋 2本柱リデザイン(ITEM_PAGE_IDENTITY_REVISION_SPEC.md)。
 * デザイナー正典 Items.html を本番データへ結線。承認済みプレビュー(ItemsPreview)の見た目。
 *   🔵 強くする(調教アイテム・item_class=TRAINING) — total_value に合流・購入=.primary(シアン)
 *   🔴 今夜に賭ける(レースアイテム・item_class=RACE) — affinity 前面・的中↑/外れ↓・購入=ゴールド
 *      ＋予報の手がかり(直近条件+「次は?」+出現確率コンパクト・フルカレンダーは折りたたみ §5-1)
 *   マイアイテム＋BURN記念品(非売・購入外 ⑤)＋ギフト(折りたたみ従属 §5-3)＋履歴(折りたたみ)
 *
 * §9色: シアン=🔵 / ゴールド=🔴 / 赤=BURN専用。機構(buy/gift/inventory/conditions API・効果
 * ルール)は不変=純情報設計。R1(実確率・「次は?」で断定しない)。globals.css のトークンを使う。
 */

const fmtHM = (n: number): string => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1);
function raceHitMiss(effect?: ItemEffectV3): { hit: string; miss: string } {
  if (!effect) return { hit: '', miss: '' };
  if (effect.kind === 'GROUP_PREP' || effect.kind === 'PINPOINT_PREP' || effect.kind === 'DUAL_PREP') {
    return { hit: fmtHM(effect.hit), miss: fmtHM(effect.miss) };
  }
  if (effect.kind === 'DUAL_FLOOR') return { hit: 'floor 0', miss: '—' };
  return { hit: '', miss: '' };
}
const AFF_COLOR: Record<string, string> = {
  雨系: '#7fb8ff', 晴れ系: '#f2e4bf', 道悪系: '#c9a86a', 良系: '#9dc7a8', 両軸: '#c9b3ff',
  嵐: '#c9b3ff', 晴れ: '#f2e4bf', 不良: '#c9a86a', 高速: '#a9b6c8', 保険: '#8f8ac2',
};
const affColor = (a: string): string => AFF_COLOR[a] ?? '#8f8ac2';
const WX_CHAR: Record<string, string> = { SUNNY: '晴', CLOUDY: '曇', RAIN: '雨', STORM: '嵐' };
const WX_COLOR: Record<string, string> = { SUNNY: '#f2e4bf', CLOUDY: '#8f8ac2', RAIN: '#7fb8ff', STORM: '#c9b3ff' };

const bar = (grad: string): React.CSSProperties => ({ width: 6, height: 38, borderRadius: 3, background: grad });

export function ItemsView({
  catalog,
  inventory,
  transactions = [],
  conditionHistory = [],
  today,
  itemsCopy,
  preview = false,
}: {
  catalog: CatalogItem[];
  inventory: InventoryData;
  itemsCopy: ItemCopy;
  transactions?: ItemTransaction[];
  conditionHistory?: DailyConditions[];
  today?: string;
  preview?: boolean;
}) {
  const lang = useLang();
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [giftEmail, setGiftEmail] = useState('');
  const [giftKey, setGiftKey] = useState('');
  const [giftQty, setGiftQty] = useState(1);
  const [band, setBand] = useState<'ALL' | 'BASIC' | 'STANDARD' | 'PREMIUM'>('ALL');

  const byKey = useMemo(() => new Map(catalog.map((c) => [c.key, c])), [catalog]);
  const ownedByKey = useMemo(() => new Map(inventory.available.map((e) => [e.item_key, e.n])), [inventory]);

  // 🔵/🔴/記念品 を item_class・band で分類(価格帯でない=②の解)。BURN_DROP は購入棚から外す(⑤)。
  const trainAll = catalog.filter((c) => c.item_class === 'TRAINING' && c.band !== 'BURN_DROP');
  const train = band === 'ALL' ? trainAll : trainAll.filter((c) => c.band === band);
  const race = catalog.filter((c) => c.item_class === 'RACE' && c.band !== 'BURN_DROP');
  const burnDrops = catalog.filter((c) => c.band === 'BURN_DROP');
  const burnKeys = new Set(burnDrops.map((c) => c.key));

  // マイアイテム: 記念品(BURN_DROP)は分けて表示、通常所持は棚に。
  const ownedNormal = inventory.available.filter((e) => !burnKeys.has(e.item_key));
  const ownedMementos = inventory.available.filter((e) => burnKeys.has(e.item_key));
  const giftable = inventory.available.filter((e) => byKey.get(e.item_key)?.giftable !== false && !burnKeys.has(e.item_key));
  const giftMax = giftKey ? (ownedByKey.get(giftKey) ?? 1) : 1;
  const qty = Math.min(giftQty, Math.max(1, giftMax));

  // 予報の手がかり(直近条件 + 出現確率 + カレンダー)。実データ conditionHistory。
  const sortedHistory = [...conditionHistory].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sortedHistory[sortedHistory.length - 1];
  const todayISO = today ?? latest?.date ?? '';
  const byDate = new Map(sortedHistory.map((e) => [e.date, e]));
  const calBase = todayISO ? new Date(`${todayISO}T00:00:00Z`) : null;
  const calYear = calBase ? calBase.getUTCFullYear() : 0;
  const calMonth0 = calBase ? calBase.getUTCMonth() : 0;
  const calFirstDow = calBase ? new Date(Date.UTC(calYear, calMonth0, 1)).getUTCDay() : 0;
  const calDays = calBase ? new Date(Date.UTC(calYear, calMonth0 + 1, 0)).getUTCDate() : 0;
  const calTodayD = calBase ? calBase.getUTCDate() : -1;
  const calLabel = calBase ? `${calYear}年${calMonth0 + 1}月` : '';

  const probAxes: { label: string; rows: { name: string; pct: number; color: string }[] }[] = [
    {
      label: '天候',
      rows: Object.entries(WEATHER_PROBABILITY_V1).map(([w, p]) => ({
        name: WEATHER_JA[w as keyof typeof WEATHER_JA] ?? w,
        pct: Number(p),
        color: WX_COLOR[w] ?? '#8f8ac2',
      })),
    },
    {
      label: '馬場',
      rows: Object.entries(TRACK_PROBABILITY_V1).map(([t, p]) => ({
        name: TRACK_JA[t as keyof typeof TRACK_JA] ?? t,
        pct: Number(p),
        color: '#a9b6c8',
      })),
    },
    {
      label: 'コース',
      rows: Object.entries(SURFACE_PROBABILITY_V1).map(([su, p]) => ({
        name: SURFACE_JA[su as keyof typeof SURFACE_JA] ?? su,
        pct: Number(p),
        color: su === 'TURF' ? '#9dc7a8' : '#cbb089',
      })),
    },
  ];

  async function buy(item: CatalogItem) {
    if (preview) { setMessage(`${itemName(item, lang)} を購入しました（プレビュー）。`); return; }
    setBusyKey(item.key);
    setError(null);
    setMessage(null);
    const r = await apiFetch('/api/v1/items/purchase', { method: 'POST', body: { item_key: item.key, quantity: 1 } });
    setBusyKey(null);
    if (r.status !== 200) { setError(errorMessage(r.body) ?? '購入に失敗しました'); return; }
    setMessage(`${itemName(item, lang)} を購入しました。厩舎の馬詳細から使えます。`);
    refreshSoft(router);
  }

  async function sendGift(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !giftKey || !giftEmail) return;
    setBusyKey('gift');
    setError(null);
    setMessage(null);
    const r = await apiFetch('/api/v1/items/gift', { method: 'POST', body: { recipient_email: giftEmail, item_key: giftKey, quantity: qty } });
    setBusyKey(null);
    if (r.status !== 200) { setError(errorMessage(r.body) ?? 'ギフトの送付に失敗しました'); return; }
    setMessage(`${byKey.get(giftKey)?.name_ja ?? giftKey} を ${qty}個 ${giftEmail} に送りました。`);
    setGiftEmail(''); setGiftKey(''); setGiftQty(1);
    refreshSoft(router);
  }

  const buyStyle = (accent: 'cyan' | 'gold'): React.CSSProperties => ({
    width: '100%', padding: 11, borderRadius: 'var(--radius-xs)', border: 'none', cursor: 'pointer',
    font: '700 13px/1 var(--font-display)', letterSpacing: '.05em', color: accent === 'cyan' ? '#04141a' : '#1a1408',
    background: accent === 'cyan'
      ? 'linear-gradient(100deg,var(--cyan),#5ff5ff 60%,var(--cyan))'
      : 'linear-gradient(100deg,var(--gold),var(--gold-bright) 60%,var(--gold))',
    boxShadow: accent === 'cyan' ? '0 8px 20px -8px rgba(0,234,255,.6)' : '0 8px 20px -8px rgba(201,168,106,.55)',
    opacity: busyKey === null || busyKey === undefined ? 1 : busyKey === 'gift' ? 1 : 0.85,
  });
  const shelfGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 12 };

  return (
    <div className={s.wrap} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ═══ HEADER ═══ */}
      <header style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--padS,20px)', background: 'linear-gradient(180deg,var(--panel-2),var(--panel))', boxShadow: 'var(--shadow)' }}>
        <div style={{ font: '700 11px/1 var(--font-mono)', letterSpacing: '.34em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 9 }}>ITEMS</div>
        <h1 style={{ margin: 0, font: '800 clamp(24px,4vw,34px)/1.04 var(--font-display)', letterSpacing: '.05em', color: 'var(--text)' }}>道具部屋</h1>
        <p style={{ margin: '11px 0 15px', maxWidth: '60ch', color: 'var(--muted)', fontSize: 13, fontFamily: 'var(--font-jp)', lineHeight: 1.75 }}>アイテムは2種類。効果はすべて公開ルールです。</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 11 }}>
          <a href="#pillar-train" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 15px', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(150deg,rgba(0,234,255,.07),transparent 70%)' }}>
            <span style={bar('linear-gradient(180deg,var(--cyan),var(--cyan-deep))')} />
            <div><div style={{ font: '700 14px/1.2 var(--font-display)', letterSpacing: '.03em', color: 'var(--text)' }}>強くする</div><div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-jp)', marginTop: 4, lineHeight: 1.5 }}>調教アイテム。馬を永続的に強くする（総合値に合流）。</div></div>
          </a>
          <a href="#pillar-race" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 15px', border: '1px solid rgba(201,168,106,.34)', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(150deg,rgba(201,168,106,.08),transparent 70%)' }}>
            <span style={bar('linear-gradient(180deg,var(--gold-bright),var(--gold))')} />
            <div><div style={{ font: '700 14px/1.2 var(--font-display)', letterSpacing: '.03em', color: 'var(--text)' }}>今夜に賭ける</div><div style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font-jp)', marginTop: 4, lineHeight: 1.5 }}>レースアイテム。予報を読んで条件に備える（的中で適性↑・外れで↓）。</div></div>
          </a>
        </div>
      </header>

      {message && <p className="ok">{message}</p>}
      {error && <ErrorLine>{error}</ErrorLine>}

      {/* ═══ 🔵 強くする（調教アイテム）═══ */}
      <section id="pillar-train" style={{ border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: 'var(--padS,20px)', background: 'linear-gradient(180deg,rgba(0,234,255,.035),var(--panel))', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={bar('linear-gradient(180deg,var(--cyan),var(--cyan-deep))')} />
          <div style={{ flex: '1 1 auto' }}><div style={{ font: '700 10px/1 var(--font-mono)', letterSpacing: '.24em', color: 'var(--cyan)' }}>STRENGTHEN</div><h2 style={{ margin: '4px 0 0', font: '800 20px/1 var(--font-display)', letterSpacing: '.04em', color: 'var(--text)' }}>強くする — 調教アイテム</h2></div>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)', textAlign: 'right', maxWidth: '24ch' }}>馬を永続的に強くする（総合値に合流・ソフトキャップ85）</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, margin: '15px 0 14px' }}>
          {(['ALL', 'BASIC', 'STANDARD', 'PREMIUM'] as const).map((b) => {
            const on = band === b;
            const label = { ALL: 'すべて', BASIC: 'ベーシック 2–3', STANDARD: 'スタンダード 4–5', PREMIUM: 'プレミアム 6–10' }[b];
            return (
              <button key={b} type="button" onClick={() => setBand(b)} style={{ font: '700 11.5px/1 var(--font-jp)', cursor: 'pointer', borderRadius: 999, padding: '6px 13px', border: `1px solid ${on ? 'var(--cyan)' : 'var(--border)'}`, background: on ? 'rgba(0,234,255,.08)' : 'rgba(10,8,22,.5)', color: on ? 'var(--cyan)' : 'var(--muted)' }}>{label}</button>
            );
          })}
        </div>
        <div style={shelfGrid}>
          {train.map((it) => (
            <div key={it.key} style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderTop: '2px solid rgba(0,234,255,.5)', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(165deg,rgba(0,234,255,.045),var(--panel-2))', overflow: 'hidden' }}>
              <div style={{ padding: '13px 14px 0' }}><img src={`/items/${it.key}.webp`} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '1', borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border-strong)', background: 'radial-gradient(circle at 50% 40%,rgba(0,234,255,.13),rgba(10,8,22,.7))' }} /></div>
              <div style={{ padding: '11px 14px 0', display: 'flex', justifyContent: 'space-between', gap: 9, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}><div style={{ font: '700 15px/1.2 var(--font-display)', color: 'var(--text)' }}>{itemName(it, lang)}</div><div style={{ font: '400 10.5px/1 var(--font-mono)', color: 'var(--faint)', marginTop: 5, letterSpacing: '.04em' }}>{it.name_en}</div></div>
                <div style={{ flex: '0 0 auto', font: '800 18px/1 var(--font-display)', color: 'var(--gold-bright)', fontVariantNumeric: 'tabular-nums' }}>{it.price}<span style={{ font: '500 9px/1 var(--font-mono)', color: 'var(--faint)', marginLeft: 2 }}>USDT</span></div>
              </div>
              <div style={{ padding: '11px 14px 0', flex: '1 1 auto' }}><div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>{it.effect ? effectSummary(it.effect, itemsCopy) : it.description_ja}</div></div>
              {it.effect && (
                <div style={{ padding: '11px 14px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ font: '600 10px/1 var(--font-mono)', letterSpacing: '.04em', borderRadius: 5, padding: '4px 8px', whiteSpace: 'nowrap', color: 'var(--good-soft)', border: '1px solid rgba(53,208,127,.35)', background: 'rgba(53,208,127,.08)' }}>{effectShort(it.effect, itemsCopy)}</span>
                </div>
              )}
              <div style={{ padding: '13px 14px' }}><button type="button" disabled={busyKey === it.key} onClick={() => void buy(it)} style={buyStyle('cyan')}>{busyKey === it.key ? '購入中…' : '購入する'}</button></div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 🔴 今夜に賭ける（レースアイテム）═══ */}
      <section id="pillar-race" style={{ border: '1px solid rgba(201,168,106,.34)', borderRadius: 'var(--radius)', padding: 'var(--padS,20px)', background: 'linear-gradient(180deg,rgba(201,168,106,.04),var(--panel))', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={bar('linear-gradient(180deg,var(--gold-bright),var(--gold))')} />
          <div style={{ flex: '1 1 auto' }}><div style={{ font: '700 10px/1 var(--font-mono)', letterSpacing: '.24em', color: 'var(--gold)' }}>BET ON TONIGHT</div><h2 style={{ margin: '4px 0 0', font: '800 20px/1 var(--font-display)', letterSpacing: '.04em', color: 'var(--text)' }}>今夜に賭ける — レースアイテム</h2></div>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)', textAlign: 'right', maxWidth: '26ch' }}>予報を読んで条件に備える（的中で適性が上限側へ・外れで下限側へ）</span>
        </div>

        {/* 予報の手がかり */}
        {latest && (
          <div style={{ marginTop: 15, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'rgba(10,8,22,.5)', padding: '14px 15px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 22px', alignItems: 'center' }}>
              <div style={{ flex: '0 0 auto' }}>
                <div style={{ font: '400 9.5px/1 var(--font-mono)', letterSpacing: '.16em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 6 }}>直近のレース条件 · {latest.date.slice(5)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ font: '800 20px/1 var(--font-display)', color: WX_COLOR[latest.weather] ?? 'var(--text)' }}>{latest.weather_ja}</span><span style={{ font: '500 12px/1 var(--font-mono)', color: 'var(--muted)' }}>{latest.track_ja} / {latest.surface_ja}</span></div>
              </div>
              <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
              <div style={{ flex: '0 0 auto' }}>
                <div style={{ font: '400 9.5px/1 var(--font-mono)', letterSpacing: '.16em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 6 }}>次のレースの条件</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}><span style={{ font: '800 22px/1 var(--font-display)', color: 'var(--gold-bright)' }}>?</span><span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>発走まで誰にも分かりません</span></div>
              </div>
            </div>
            <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 11 }}>
              {probAxes.map((ax) => (
                <div key={ax.label}>
                  <div style={{ font: '400 9.5px/1 var(--font-mono)', letterSpacing: '.14em', color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 8 }}>{ax.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {ax.rows.map((r) => (
                      <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: '0 0 42px', font: '600 11px/1 var(--font-jp)', color: r.color }}>{r.name}</span>
                        <span style={{ flex: '1 1 auto', height: 5, borderRadius: 3, background: 'rgba(255,255,255,.07)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.round(r.pct * 100)}%`, background: r.color, borderRadius: 3 }} /></span>
                        <span style={{ flex: '0 0 auto', font: '500 10px/1 var(--font-mono)', color: 'var(--faint)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(r.pct * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {calBase && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ font: '600 11.5px/1 var(--font-jp)', color: 'var(--cyan)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>条件の履歴を見る（{calLabel}）<span style={{ fontSize: 9, color: 'var(--faint)' }}>▼</span></summary>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5 }}>
                  {['日', '月', '火', '水', '木', '金', '土'].map((d) => (<div key={d} style={{ textAlign: 'center', font: '600 9px/1 var(--font-mono)', color: 'var(--faint)', paddingBottom: 2 }}>{d}</div>))}
                  {Array.from({ length: calFirstDow }).map((_, i) => (<div key={`e${i}`} style={{ aspectRatio: '1' }} />))}
                  {Array.from({ length: calDays }).map((_, i) => {
                    const d = i + 1;
                    const iso = `${calYear}-${String(calMonth0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const cond = byDate.get(iso);
                    const isToday = d === calTodayD;
                    const mark = cond ? WX_CHAR[cond.weather] ?? '' : (isToday ? '?' : '');
                    const color = cond ? WX_COLOR[cond.weather] ?? 'var(--faint)' : 'var(--faint)';
                    return (
                      <div key={d} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 7, border: `1px solid ${isToday ? 'rgba(201,168,106,.34)' : 'var(--border)'}`, background: isToday ? 'rgba(201,168,106,.08)' : 'rgba(255,255,255,.015)' }}>
                        <span style={{ font: '400 8px/1 var(--font-mono)', color: 'var(--faint)' }}>{d}</span>
                        <span style={{ font: '700 13px/1 var(--font-jp)', color }}>{mark}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 9, fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--font-jp)', lineHeight: 1.6 }}>各レース（朝8:00／夜20:00 GMT+8）で公開された条件の履歴。抽選は毎回独立です。</div>
              </details>
            )}
          </div>
        )}

        {/* レースアイテム（賭ける条件を前面に） */}
        <div style={{ ...shelfGrid, marginTop: 15 }}>
          {race.map((it) => {
            const aff = it.affinity_ja ?? it.affinity ?? '';
            const c = affColor(aff);
            const { hit, miss } = raceHitMiss(it.effect);
            return (
              <div key={it.key} style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderTop: '2px solid rgba(201,168,106,.55)', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(165deg,rgba(201,168,106,.05),var(--panel-2))', overflow: 'hidden' }}>
                <div style={{ padding: '13px 14px 0', position: 'relative' }}>
                  <img src={`/items/${it.key}.webp`} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '1', borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(201,168,106,.34)', background: 'radial-gradient(circle at 50% 40%,rgba(201,168,106,.15),rgba(10,8,22,.7))' }} />
                  {aff && <span style={{ position: 'absolute', top: 20, left: 21, font: '700 11px/1 var(--font-jp)', borderRadius: 6, padding: '5px 9px', whiteSpace: 'nowrap', color: c, border: `1px solid ${c}66`, background: 'rgba(8,6,16,.82)', backdropFilter: 'blur(3px)', boxShadow: '0 2px 8px -2px #000' }}>{aff}</span>}
                </div>
                <div style={{ padding: '11px 14px 0', display: 'flex', justifyContent: 'space-between', gap: 9, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}><div style={{ font: '700 14px/1.2 var(--font-display)', color: 'var(--text)' }}>{itemName(it, lang)}</div><div style={{ font: '400 10px/1 var(--font-mono)', color: 'var(--faint)', marginTop: 4 }}>{it.name_en}</div></div>
                  <div style={{ flex: '0 0 auto', font: '800 18px/1 var(--font-display)', color: 'var(--gold-bright)', fontVariantNumeric: 'tabular-nums' }}>{it.price}<span style={{ font: '500 9px/1 var(--font-mono)', color: 'var(--faint)', marginLeft: 2 }}>USDT</span></div>
                </div>
                <div style={{ padding: '11px 14px 0', flex: '1 1 auto' }}><div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>{it.description_ja}</div></div>
                {hit && (
                  <div style={{ margin: '12px 14px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-xs)', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 10px', background: 'rgba(53,208,127,.08)', textAlign: 'center' }}><div style={{ font: '400 8.5px/1 var(--font-mono)', letterSpacing: '.1em', color: 'var(--good)', textTransform: 'uppercase', marginBottom: 4 }}>的中</div><div style={{ font: '800 15px/1 var(--font-display)', color: 'var(--good-soft)' }}>{hit}</div></div>
                    <div style={{ padding: '8px 10px', background: 'rgba(143,138,194,.08)', textAlign: 'center' }}><div style={{ font: '400 8.5px/1 var(--font-mono)', letterSpacing: '.1em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>外れ</div><div style={{ font: '800 15px/1 var(--font-display)', color: 'var(--muted)' }}>{miss}</div></div>
                  </div>
                )}
                <div style={{ padding: '12px 14px' }}><button type="button" disabled={busyKey === it.key} onClick={() => void buy(it)} style={buyStyle('gold')}>{busyKey === it.key ? '購入中…' : '購入する'}</button></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ═══ マイアイテム ＋ 記念品 ＋ ギフト ═══ */}
      <section style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--padS,20px)', background: 'linear-gradient(180deg,var(--panel-2),var(--panel))', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <h2 style={{ margin: 0, font: '800 18px/1 var(--font-display)', letterSpacing: '.04em', color: 'var(--text)' }}>マイアイテム</h2>
          <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>所持 {ownedNormal.length}種 · 適用予定 {inventory.pending.length}件</span>
        </div>
        {ownedNormal.length === 0 ? (
          <p className="empty">所持アイテムはありません。上の棚から購入できます。</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 10 }}>
            {ownedNormal.map((o) => {
              const c = byKey.get(o.item_key);
              const isTrain = c?.item_class === 'TRAINING';
              return (
                <div key={o.item_key} style={{ display: 'flex', alignItems: 'center', gap: 11, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '11px 13px', background: 'rgba(255,255,255,.015)' }}>
                  <span style={{ flex: '0 0 auto', width: 9, height: 30, borderRadius: 2, background: isTrain ? 'linear-gradient(180deg,var(--cyan),var(--cyan-deep))' : 'linear-gradient(180deg,var(--gold-bright),var(--gold))' }} />
                  <img src={`/items/${o.item_key}.webp`} alt="" loading="lazy" style={{ flex: '0 0 auto', width: 38, height: 38, borderRadius: 9, objectFit: 'cover', border: '1px solid var(--border)', background: 'rgba(10,8,22,.6)' }} />
                  <div style={{ flex: '1 1 auto', minWidth: 0 }}><div style={{ font: '700 13px/1.2 var(--font-display)', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c ? itemName(c, lang) : o.item_key}</div><div style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--font-jp)', marginTop: 3 }}>{isTrain ? '調教アイテム' : 'レースアイテム'}</div></div>
                  <span style={{ flex: '0 0 auto', font: '700 13px/1 var(--font-mono)', color: 'var(--gold-bright)' }}>×{o.n}</span>
                </div>
              );
            })}
          </div>
        )}
        {inventory.pending.length > 0 && (
          <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {inventory.pending.map((p) => (
              <div key={p.usage_id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 11px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-xs)', padding: '9px 12px' }}>
                <span style={{ font: '700 8.5px/1 var(--font-display)', letterSpacing: '.06em', color: 'var(--cyan)', border: '1px solid var(--border-strong)', borderRadius: 5, padding: '3px 7px' }}>適用予定</span>
                <b style={{ font: '700 13px/1.2 var(--font-display)', color: 'var(--text)' }}>{byKey.get(p.item_key) ? itemName(byKey.get(p.item_key)!, lang) : p.item_key}</b>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>→ {horseDisplayName(p.horse_name, lang)}</span>
                <span style={{ marginLeft: 'auto', font: '500 11px/1 var(--font-mono)', color: 'var(--faint)' }}>{p.effective_race_date.slice(5)} のレース</span>
              </div>
            ))}
          </div>
        )}
        {ownedMementos.map((m) => {
          const c = byKey.get(m.item_key);
          return (
            <div key={m.item_key} style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 11, border: '1px solid rgba(255,92,92,.4)', borderRadius: 'var(--radius-sm)', padding: '11px 13px', background: 'linear-gradient(150deg,rgba(255,92,92,.1),transparent 72%)' }}>
              <span style={{ flex: '0 0 auto', width: 9, height: 9, borderRadius: '50%', background: 'var(--bad)', boxShadow: '0 0 10px rgba(255,92,92,.7)' }} />
              <div style={{ flex: '1 1 auto' }}><div style={{ font: '700 13px/1.2 var(--font-display)', color: 'var(--bad)' }}>{c ? itemName(c, lang) : m.item_key}</div><div style={{ fontSize: 10.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)', marginTop: 3 }}>記念品 — Burnした馬の形見。買えません・譲れません。</div></div>
              <span style={{ flex: '0 0 auto', font: '700 13px/1 var(--font-mono)', color: 'var(--bad)' }}>×{m.n}</span>
            </div>
          );
        })}

        {/* BURNで授与される記念品（買えない・参考一覧） */}
        {burnDrops.length > 0 && (
          <details style={{ marginTop: 11, border: '1px solid rgba(255,92,92,.34)', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(150deg,rgba(255,92,92,.06),transparent 72%)' }}>
            <summary style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', font: '700 13px/1 var(--font-display)', letterSpacing: '.03em', color: 'var(--bad)', cursor: 'pointer' }}><span style={{ fontSize: 9, color: 'var(--faint)' }}>▶</span>BURNで授与される記念品<span style={{ font: '400 11px/1 var(--font-jp)', color: 'var(--faint)', marginLeft: 'auto' }}>買えません・譲れません（Burn時に1つ授与）</span></summary>
            <div style={{ padding: '0 15px 15px', ...shelfGrid }}>
              {burnDrops.map((b) => (
                <div key={b.key} style={{ display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,92,92,.24)', borderTop: '2px solid rgba(255,92,92,.6)', borderRadius: 'var(--radius-sm)', background: 'linear-gradient(165deg,rgba(255,92,92,.055),var(--panel-2))', overflow: 'hidden' }}>
                  <div style={{ padding: '12px 13px 0', position: 'relative' }}>
                    <img src={`/items/${b.key}.webp`} alt="" loading="lazy" style={{ display: 'block', width: '100%', aspectRatio: '1', borderRadius: 10, objectFit: 'cover', border: '1px solid rgba(255,92,92,.28)', background: 'radial-gradient(circle at 50% 40%,rgba(255,92,92,.14),rgba(10,8,22,.7))' }} />
                    <span style={{ position: 'absolute', top: 19, left: 20, font: '700 8.5px/1 var(--font-display)', letterSpacing: '.06em', color: 'var(--bad)', border: '1px solid rgba(255,92,92,.5)', borderRadius: 5, padding: '3px 7px', whiteSpace: 'nowrap', background: 'rgba(8,6,16,.82)', backdropFilter: 'blur(3px)' }}>非売品</span>
                  </div>
                  <div style={{ padding: '11px 13px 0' }}><div style={{ font: '700 14px/1.2 var(--font-display)', color: 'var(--text)' }}>{itemName(b, lang)}</div><div style={{ font: '400 10px/1 var(--font-mono)', color: 'var(--faint)', marginTop: 4 }}>{b.name_en}</div></div>
                  <div style={{ padding: '8px 13px 13px', flex: '1 1 auto' }}><div style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--muted)', fontFamily: 'var(--font-jp)' }}>{b.effect ? effectSummary(b.effect, itemsCopy) : b.description_ja}</div></div>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* ギフト（従属・折りたたみ） */}
        <details style={{ marginTop: 15, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,.012)' }}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', font: '700 13px/1 var(--font-display)', letterSpacing: '.03em', color: 'var(--text)', cursor: 'pointer' }}><span style={{ fontSize: 9, color: 'var(--faint)' }}>▶</span>仲間に贈る<span style={{ font: '400 11px/1 var(--font-jp)', color: 'var(--faint)', marginLeft: 'auto' }}>所持アイテムをまとめて贈れます</span></summary>
          <form onSubmit={(e) => void sendGift(e)} style={{ padding: '0 15px 15px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
            <label style={{ flex: '1 1 200px', font: '500 10.5px/1 var(--font-jp)', color: 'var(--muted)' }}>相手のメールアドレス<input value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} placeholder="friend@example.com" style={{ display: 'block', width: '100%', marginTop: 6, font: '400 13px/1 var(--font-sans)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 11px', background: 'rgba(10,8,22,.5)' }} /></label>
            <label style={{ flex: '1 1 160px', font: '500 10.5px/1 var(--font-jp)', color: 'var(--muted)' }}>贈るアイテム
              <select value={giftKey} onChange={(e) => { setGiftKey(e.target.value); setGiftQty(1); }} style={{ display: 'block', width: '100%', marginTop: 6, font: '400 13px/1 var(--font-sans)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 11px', background: 'rgba(10,8,22,.5)' }}>
                <option value="">選択…</option>
                {giftable.map((g) => { const c = byKey.get(g.item_key); return (<option key={g.item_key} value={g.item_key}>{c ? itemName(c, lang) : g.item_key}（×{g.n}）</option>); })}
              </select>
            </label>
            {giftMax > 1 && (
              <label style={{ flex: '0 0 auto', font: '500 10.5px/1 var(--font-jp)', color: 'var(--muted)' }}>個数
                <input type="number" min={1} max={giftMax} value={qty} onChange={(e) => setGiftQty(Number(e.target.value) || 1)} style={{ display: 'block', width: 72, marginTop: 6, font: '400 13px/1 var(--font-mono)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 11px', background: 'rgba(10,8,22,.5)' }} />
              </label>
            )}
            <button type="submit" disabled={busyKey === 'gift' || !giftKey || !giftEmail} style={{ flex: '0 0 auto', padding: '11px 20px', borderRadius: 'var(--radius-xs)', border: '1px solid rgba(255,45,196,.5)', background: 'rgba(255,45,196,.1)', color: 'var(--magenta-soft)', font: '700 13px/1 var(--font-display)', letterSpacing: '.04em', cursor: 'pointer', opacity: !giftKey || !giftEmail ? 0.5 : 1 }}>{busyKey === 'gift' ? '送信中…' : '贈る'}</button>
          </form>
          <div style={{ padding: '0 15px 15px', fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--font-jp)', lineHeight: 1.6 }}>送付は即時確定で取り消せません。登録済みのメールアドレス宛にのみ届きます（1日20回まで）。</div>
        </details>
      </section>

      {/* ═══ アイテム履歴（折りたたみ）═══ */}
      {transactions.length > 0 && (
        <details style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'linear-gradient(180deg,var(--panel-2),var(--panel))', boxShadow: 'var(--shadow)' }}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--padS,20px)', cursor: 'pointer' }}><span style={{ fontSize: 10, color: 'var(--faint)' }}>▶</span><h2 style={{ margin: 0, font: '800 16px/1 var(--font-display)', letterSpacing: '.04em', color: 'var(--text)' }}>アイテム履歴</h2><span style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font-jp)', marginLeft: 'auto' }}>もらった · 送った · 使った · 購入</span></summary>
          <div style={{ padding: '0 var(--padS,20px) var(--padS,20px)' }}>
            {transactions.map((t) => {
              const c = byKey.get(t.item_key);
              const meta: Record<string, [string, string]> = { PURCHASED: ['購入', '+'], RECEIVED: ['受取', '+'], GIFTED: ['送付', '−'], USED: ['使用', '−'] };
              const [label, sgn] = meta[t.kind] ?? [t.kind, ''];
              const pos = sgn === '+';
              const detail = t.horse_name ? `→ ${horseDisplayName(t.horse_name, lang)}` : t.counterparty ? `${t.counterparty}` : '';
              return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 11, borderTop: '1px solid var(--border)', padding: '11px 2px' }}>
                  <span style={{ flex: '0 0 auto', font: '700 9.5px/1 var(--font-display)', letterSpacing: '.06em', borderRadius: 5, padding: '4px 8px', color: pos ? 'var(--good-soft)' : 'var(--muted)', border: `1px solid ${pos ? 'rgba(53,208,127,.35)' : 'var(--border)'}`, background: pos ? 'rgba(53,208,127,.08)' : 'rgba(255,255,255,.03)' }}>{label}</span>
                  <span style={{ flex: '1 1 auto', minWidth: 0, font: '700 13px/1.2 var(--font-display)', color: 'var(--text)' }}>{c ? itemName(c, lang) : t.item_key}<span style={{ font: '400 11px/1 var(--font-jp)', color: 'var(--faint)', marginLeft: 9 }}>{detail}</span></span>
                  <span style={{ font: '700 13px/1 var(--font-mono)', color: pos ? 'var(--good-soft)' : 'var(--muted)' }}>{sgn}{t.quantity}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>{localDateTime(t.created_at).slice(5)}</span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div style={{ textAlign: 'center', font: '400 10.5px/1.6 var(--font-mono)', letterSpacing: '.08em', color: 'var(--faint)' }}>効果・価格・確率は公開ルール（V3カタログ）</div>
    </div>
  );
}
