'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppSelect } from '@/components/AppSelect';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook, NIGHT_LOOK } from '@/lib/nft-visual';
import { horseValue, uncollectedGain } from '@/components/stable-shared';
import type { StableHorse } from '@/components/StableView';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/stable.module.css';
import { tvCardGlowStyle } from '@/lib/tv-tier';
import { TotalValue } from '@/components/ui/TotalValue';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/* ============================================================================
 * StableBrowser — 出走中 / 過去 の馬リストを「検索・ソート・絞り込み・
 * ページネーション」で捌くクライアントコンポーネント。100頭規模でも軽快に。
 *
 * kind='active': 検索 + ソート(価値/総合値/未調教/名前) +
 *                未調教のみ + ページング。カードは縦/横リフロー。
 * kind='past':   検索 + ソート(総合値/名前) + ページング。
 * ========================================================================== */

type T = AppDict['stable'];

/* 総合値チップ+安全圏(FUN_V2_PLAN.md §3 A1)。band色はCSS側で管理。 */
function bandLabel(band: string | null | undefined, t: T): string {
  return band === 'SAFE' ? t.band_safe : band === 'RISK' ? t.band_risk : t.band_mid;
}
function TvChip({ h, t, extraCls = '', size = 'md' }: { h: StableHorse; t: T; extraCls?: string; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  if (h.total_value === null || h.total_value === undefined) return null;
  // ティアカラー(2026-07-18): チップの色は「価値の帯」。今夜の安全圏はRankLineが担う。
  // 2026-07-22: 箱をやめて数字とティア色だけに(全画面で同じ見せ方に揃える)
  return <TotalValue value={h.total_value} label={t.tv_chip} size={size} className={extraCls} />;
}
const PAGE_SIZES = [24, 48, 96, 99999];

/* ---- 隠し演出の原色オーバーレイ色(全身を1色に染める) ---------------------- */
export const COLOR_OVERLAY: Record<string, string> = {
  black: 'rgba(6,6,10,0.72)', red: '#e5322d', blue: '#2f6bff',
  yellow: '#ffcf1f', green: '#22c55e',
};

/* ---- 部品 ----------------------------------------------------------------- */
function StableArt({ horse, t }: { horse: StableHorse; t: T }) {
  // 隠し演出(EASTER_EGG_PLAN.md): 真夜中の馬は夜色ルック。原色ルートは全身着色。
  const look = horse.night_variant ? NIGHT_LOOK : deriveNftLook(horse.dna_hash, horse.name);
  const color = horse.color_variant ? COLOR_OVERLAY[horse.color_variant] : null;
  return (
    <span className={`${s.artWrap} ${horse.golden_aura ? s.artAura : ''}`}>
      <NftHorseArt look={look} className={s.hartCanvas} size={288} />
      {color ? (
        <span
          className={s.colorSkin}
          style={{ background: color, mixBlendMode: horse.color_variant === 'black' ? 'multiply' : 'color' }}
        />
      ) : null}
      {horse.golden_star ? <span className={s.goldenStar} title={t.tip_golden}>★</span> : null}
      {horse.revenge_flame ? (
        <span className={`${s.revengeFlame} ${horse.revenge_gold ? s.revengeGold : ''}`} title={t.tip_flame}>焔</span>
      ) : null}
      {horse.milestone ? <span className={s.milestoneMark} title={t.tip_milestone}>7</span> : null}
    </span>
  );
}


/* ---- 厩舎カード(構図リデザイン 2026-07-22・デザイン側 handoff) -------------
 * 正典: STABLE_CARD_DESIGN_BRIEF.md + handoff の Stable Card Composition.html
 *
 * 設計の核:
 *  - 6頭は同ポーズ色違いなので **絵では強弱を区別できない**。絵は壁紙に落とし、
 *    強さは **円ゲージの満ち欠け** が読ませる(到達可能帯 40〜85 で正規化)。
 *  - 全カードで同一だった行(現在価値・未回収の常時表示・CTAの常時表示)を撤去。
 *  - 1カード=ティア色1つ。マゼンタ=調教専用 / 赤=危険専用に予約。
 *
 * 閾値は **この画面だけのローカル**(handoff §3)。lib/tv-tier.ts はダッシュボード
 * 等でも使われるため、そちらは触らない。
 * ------------------------------------------------------------------------ */
const AC_TV_MIN = 40;
const AC_TV_MAX = 85;
const AC_SWEEP = 270;
const AC_R = 62;
const AC_CIRC = 2 * Math.PI * AC_R;
const AC_ARC = AC_CIRC * (AC_SWEEP / 360);

interface AcTier { cls: string; cap: string; stroke: string; treasure: boolean }
function acTier(v: number): AcTier {
  if (v >= 76) return { cls: s.acTierGold!, cap: 'APEX', stroke: '#e9d9ac', treasure: true };
  if (v >= 66) return { cls: s.acTierCyan!, cap: 'ELITE', stroke: '#00eaff', treasure: false };
  if (v >= 58) return { cls: s.acTierSteel!, cap: 'STEEL', stroke: '#9db8cf', treasure: false };
  return { cls: s.acTierIron!, cap: 'IRON', stroke: '#8f8ab0', treasure: false };
}

function StrengthGauge({ tv, tier, t }: { tv: number; tier: AcTier; t: T }) {
  const fillRatio = Math.max(0, Math.min(1, (tv - AC_TV_MIN) / (AC_TV_MAX - AC_TV_MIN)));
  return (
    <div className={s.acGauge}>
      <svg viewBox="0 0 150 150" aria-hidden="true">
        <circle className={s.acTrack} cx="75" cy="75" r={AC_R} strokeDasharray={`${AC_ARC} ${AC_CIRC}`} />
        <circle
          className={s.acFill} cx="75" cy="75" r={AC_R} stroke={tier.stroke}
          strokeDasharray={`${AC_ARC} ${AC_CIRC}`} strokeDashoffset={AC_ARC * (1 - fillRatio)}
        />
      </svg>
      <div className={s.acCtr}>
        <div className={s.acNum}>{tv.toFixed(1)}</div>
        <div className={s.acTierLabel}>{tier.cap}</div>
        <div className={s.acCap}>{t.tv_chip}</div>
      </div>
    </div>
  );
}

/** 壁紙用の馬アート。全身原色(隠し演出)はキャンバス側で染める —
 *  DOMの色付き四角のままだと、絵を壁紙にした新カードでただの色ブロックとして
 *  露出する(2026-07-22 実画面で確認)。 */
function CardWallpaper({ horse }: { horse: StableHorse }) {
  const look = horse.night_variant ? NIGHT_LOOK : deriveNftLook(horse.dna_hash, horse.name);
  return (
    <span className={s.acArt} aria-hidden="true">
      <NftHorseArt look={look} className={s.hartCanvas} size={288} colorVariant={horse.color_variant} />
    </span>
  );
}

function ActiveCard({ h, t }: { h: StableHorse; t: T }) {
  const lang = useLang();
  const untrained = !h.trained_for_next_race;
  const tv = h.total_value;
  const tier = tv === null || tv === undefined ? null : acTier(tv);
  const gain = uncollectedGain(h);
  // 壁紙のごく淡いウォッシュに個体色相を流す(既存 deriveNftLook の hue)
  const tint = `hsl(${Math.round(deriveNftLook(h.dna_hash, h.name).hue)} 80% 55% / .28)`;
  const bandCell =
    h.tonight_band === 'SAFE' ? s.acPillSafe : h.tonight_band === 'RISK' ? s.acPillRisk : s.acPillMid;

  return (
    <Link
      href={`/horses/${h.id}`}
      className={[
        s.activeCard, tier?.cls, h.tonight_band === 'RISK' ? s.acRisk : '',
        tier?.treasure ? s.acTreasure : '',
      ].filter(Boolean).join(' ')}
      style={{ ['--acTint' as string]: tint }}
    >
      <span className={s.acWash} />
      <CardWallpaper horse={h} />
      {/* 未調教 = マゼンタの角tick。危険(赤・左端)と場所も色も分ける */}
      {untrained ? <span className={s.acTodo}>{t.badge_untrained}</span> : null}

      <div className={s.acHead}>
        {/* 表示だけカタカナ(2026-07-22)。DBの正典は英語のまま — 色決定
            (deriveNftLook)も検索も正典側で動く */}
        <div className={s.acName}>{horseDisplayName(h.name, lang)}</div>
        {/* 隠し演出のマークは壁紙(opacity .14)では見えなくなるので、ここで出す */}
        {h.golden_star ? <span className={s.acMark} title={t.tip_golden}>★</span> : null}
        {h.revenge_flame ? <span className={s.acMark} title={t.tip_flame}>焔</span> : null}
        {h.milestone ? <span className={s.acMark} title={t.tip_milestone}>7</span> : null}
      </div>

      {tier && tv !== null && tv !== undefined ? <StrengthGauge tv={tv} tier={tier} t={t} /> : null}

      <div className={s.acRail}>
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className={`${s.acPip} ${i < h.current_day ? s.acPipDone : ''} ${i === h.current_day ? s.acPipToday : ''}`}
          />
        ))}
      </div>
      {/* Day/LV の表記ゆれは辞書側の LV 変換に任せる(クライアントから
          lib/i18n は import できない — 136KB辞書がバンドルに混入する) */}
      {/* タイプは名前の行から降ろす — 未調教tickの逃げ幅と合わさって馬名が
          切れていた(Phantom F…)。日付行はもともと余白が空いている */}
      <div className={s.acDayCap}>
        {fill(t.day_tpl, { d: Math.min(7, h.current_day) })}
        <span className={s.acType}>{h.horse_type}</span>
        {/* Decision 087監査: スマート出品中は走るが今夜売れる可能性がある — 事実を小さく明示 */}
        {h.listing === 'SMART' ? <span className={s.acSmart}>{t.smart_tag}</span> : null}
      </div>

      <div className={s.acStatus}>
        {h.tonight_rank && h.tonight_entrants ? (
          <span className={s.acRank}>{fill(t.rank_tpl, { r: h.tonight_rank, n: h.tonight_entrants })}</span>
        ) : null}
        {h.tonight_band ? (
          <span className={`${s.acPill} ${bandCell}`}>{bandLabel(h.tonight_band, t)}</span>
        ) : null}
      </div>

      {/* フッターは条件付きのみ。全カード同じ文字列が並ぶ行を作らない */}
      {untrained ? (
        <div className={s.acFoot}><span className={s.acCta}>{t.cta_train}</span></div>
      ) : gain > 0 ? (
        <div className={s.acFoot}><span className={s.acGain}>{fill(t.uncollected_tpl, { v: gain.toFixed(2) })}</span></div>
      ) : (
        <div className={s.acSpacer} />
      )}
    </Link>
  );
}

/**
 * 手動出品中(Market Lock)の馬 — 「出品中」セクション専用カード(Decision 087監査)。
 * 今夜は出走しない事実を明示し、無駄になる調教CTAは出さない。管理は/marketへ。
 */
export function ListedCard({ h, t }: { h: StableHorse; t: T }) {
  const lang = useLang();
  return (
    <Link href="/market" className={`${s.hcard} ${s.listedCard}`} style={tvCardGlowStyle(h.total_value)}>
      <div className={s.hart}>
        <StableArt horse={h} t={t} />
        <TvChip h={h} t={t} extraCls={`${s.artBadge} ${s.artRarity}`} />
        <span className={`${s.listedBadge} ${s.artBadge} ${s.artTrain}`}>{t.badge_listed}</span>
      </div>
      <div className={s.hbody}>
        <div className={s.hrow1}>
          <span className={s.hname}>{horseDisplayName(h.name, lang)}</span>
          <TvChip h={h} t={t} extraCls={s.inlineRarity!} />
          <span className={s.htype}>{h.horse_type}</span>
        </div>
        <div className={s.listedNote}>{t.listed_card_note}</div>
        <div className={s.hfoot}>
          <span className={s.hvalue}>{t.value_listed} <b>{horseValue(h.current_day)}</b> USDT</span>
          <span className={`${s.hcta} ${s.hctaDetail}`}>{t.cta_manage}</span>
          <span className={`${s.listedBadge} ${s.inlineTrain}`}>{t.badge_listed}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * チャンピオンコレクション — Day7走破馬を金枠NFTとして飾るギャラリーカード。
 */
export function ChampionCard({ h, t }: { h: StableHorse; t: T }) {
  const lang = useLang();
  const memorial = h.status === 'MEMORIALIZED';
  return (
    <Link href={`/horses/${h.id}`} className={s.champCard}>
      <div className={s.champInner}>
        <div className={s.champArt}><StableArt horse={h} t={t} /></div>
        <div className={s.champName}>{horseDisplayName(h.name, lang)}</div>
        <div className={s.champTag}>{memorial ? 'MEMORIAL NFT' : 'CHAMPION'}</div>
        <div className={s.champSub}>
          {memorial ? t.champ_sub_memorial : t.champ_sub_cleared}
        </div>
      </div>
    </Link>
  );
}

function pastMeta(status: string, t: T): { mod: string; badge: string; label: string; note: string } {
  switch (status) {
    case 'DAY7_CLEARED':
      return { mod: s.pcleared!, badge: s.stCleared!, label: t.past_champion, note: t.past_note_cleared };
    case 'MEMORIALIZED':
      return { mod: s.pmemorial!, badge: s.stMemorial!, label: t.past_memorial, note: t.past_note_memorial };
    case 'BURNED':
    default:
      return { mod: s.pburned!, badge: s.stBurned!, label: t.past_burned, note: t.past_note_burned };
  }
}

function PastCard({ h, t }: { h: StableHorse; t: T }) {
  const lang = useLang();
  const m = pastMeta(h.status, t);
  return (
    <Link href={`/horses/${h.id}`} className={`${s.pcard} ${m.mod}`}>
      <div className={s.part}>
        <div className={s.partInner}><StableArt horse={h} t={t} /></div>
        <span className={`${s.pstatusBadge} ${m.badge} ${s.pstatus}`}>{m.label}</span>
      </div>
      <div className={s.pbody}>
        <div className={s.prow}>
          <span className={s.pname}>{horseDisplayName(h.name, lang)}</span>
          <span className={s.ptype}>{h.horse_type}</span>
        </div>
        <div className={s.pnote}>{m.note}</div>
      </div>
    </Link>
  );
}

/* ---- ソート比較 ----------------------------------------------------------- */
const ACTIVE_SORTS: Record<string, (a: StableHorse, b: StableHorse) => number> = {
  value_desc: (a, b) => b.current_day - a.current_day || (b.total_value ?? 0) - (a.total_value ?? 0),
  value_asc:  (a, b) => a.current_day - b.current_day || (a.total_value ?? 0) - (b.total_value ?? 0),
  total:      (a, b) => (b.total_value ?? 0) - (a.total_value ?? 0) || b.current_day - a.current_day,
  cond:       (a, b) => Number(b.condition) - Number(a.condition),
  untrained:  (a, b) => Number(a.trained_for_next_race) - Number(b.trained_for_next_race) || b.current_day - a.current_day,
  name:       (a, b) => a.name.localeCompare(b.name),
};
// 過去セクションはBURNED専用になった(チャンピオンは金枠ギャラリーへ、Decision 087監査)
const PAST_SORTS: Record<string, (a: StableHorse, b: StableHorse) => number> = {
  total: (a, b) => (b.total_value ?? 0) - (a.total_value ?? 0) || a.name.localeCompare(b.name),
  name:  (a, b) => a.name.localeCompare(b.name),
};

/* ---- 本体 ----------------------------------------------------------------- */
export function StableBrowser({ kind, horses, t }: { kind: 'active' | 'past'; horses: StableHorse[]; t: T }) {
  const lang = useLang();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(kind === 'active' ? 'value_desc' : 'total');
  const [untrainedOnly, setUntrainedOnly] = useState(false);
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = horses.filter((h) => {
      // カタカナ表示のユーザーはカタカナで打つ。正典(英語)とカナの両方に当てる
      if (needle && !`${h.name} ${horseDisplayName(h.name, lang)}`.toLowerCase().includes(needle)) return false;
      if (kind === 'active' && untrainedOnly && h.trained_for_next_race) return false;
      return true;
    });
    const cmp = (kind === 'active' ? ACTIVE_SORTS : PAST_SORTS)[sort];
    if (cmp) arr = arr.slice().sort(cmp);
    return arr;
  }, [horses, q, sort, untrainedOnly, kind]);

  const total = horses.length;
  const shown = filtered.length;
  const all = pageSize >= 9999;
  const pageCount = all ? 1 : Math.max(1, Math.ceil(shown / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const slice = all ? filtered : filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const reset = () => setPage(0);

  return (
    <>
      <div className={s.controls}>
        <input
          className={s.search}
          value={q}
          onChange={(e) => { setQ(e.target.value); reset(); }}
          placeholder={kind === 'active' ? t.search_active : t.search_past}
          aria-label={t.search_aria}
        />
        <AppSelect
          className={s.select}
          value={sort}
          onChange={(v) => { setSort(v); reset(); }}
          ariaLabel={t.sort_aria}
          options={kind === 'active' ? [
            { value: 'value_desc', label: t.sort_value_desc },
            { value: 'value_asc', label: t.sort_value_asc },
            { value: 'total', label: t.sort_total },
            { value: 'untrained', label: t.sort_untrained },
            { value: 'name', label: t.sort_name },
          ] : [
            { value: 'total', label: t.sort_total },
            { value: 'name', label: t.sort_name },
          ]}
        />
        {kind === 'active' ? (
          <button
            type="button"
            className={`${s.toggleBtn} ${untrainedOnly ? s.toggleBtnOn : ''}`}
            onClick={() => { setUntrainedOnly((v) => !v); reset(); }}
            aria-pressed={untrainedOnly}
          >
            {t.untrained_only}
          </button>
        ) : null}
        <span className={s.count}>{shown === total ? fill(t.count_all_tpl, { n: total }) : fill(t.count_match_tpl, { t: total, s: shown })}</span>
      </div>

      {slice.length > 0 ? (
        <div className={kind === 'active' ? s.gallery : s.pastGrid}>
          {slice.map((h) => (kind === 'active' ? <ActiveCard key={h.id} h={h} t={t} /> : <PastCard key={h.id} h={h} t={t} />))}
        </div>
      ) : (
        <div className={s.noMatch}>{t.no_match}</div>
      )}

      {!all && pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.pager_prev}</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>{t.pager_next}</button>
          <AppSelect
            className={s.selectSm}
            value={String(pageSize)}
            onChange={(v) => { setPageSize(Number(v)); reset(); }}
            ariaLabel={t.page_size_aria}
            options={PAGE_SIZES.map((n) => ({ value: String(n), label: n >= 9999 ? t.page_size_all : fill(t.page_size_tpl, { n }) }))}
          />
        </div>
      ) : null}
    </>
  );
}
