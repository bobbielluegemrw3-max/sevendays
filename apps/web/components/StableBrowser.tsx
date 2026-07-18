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
import { tvChipStyle, tvNumStyle, tvCardGlowStyle } from '@/lib/tv-tier';

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
function bandCls(band: string | null | undefined): string {
  return band === 'SAFE' ? s.bandSafe! : band === 'RISK' ? s.bandRisk! : s.bandMid!;
}
function bandLabel(band: string | null | undefined, t: T): string {
  return band === 'SAFE' ? t.band_safe : band === 'RISK' ? t.band_risk : t.band_mid;
}
function TvChip({ h, t, extraCls = '' }: { h: StableHorse; t: T; extraCls?: string }) {
  if (h.total_value === null || h.total_value === undefined) return null;
  // ティアカラー(2026-07-18): チップの色は「価値の帯」。今夜の安全圏はRankLineが担う。
  return (
    <span className={`${s.tvChip} ${extraCls}`} style={tvChipStyle(h.total_value)}>
      {t.tv_chip}{' '}
      <b style={{ ...tvNumStyle(h.total_value), fontSize: '17px' }}>{Number(h.total_value).toFixed(1)}</b>
    </span>
  );
}
function RankLine({ h, t }: { h: StableHorse; t: T }) {
  if (!h.tonight_rank || !h.tonight_entrants) return null;
  return (
    <div className={`${s.rankLine} ${bandCls(h.tonight_band)}`}>
      {fill(t.rank_tpl, { r: h.tonight_rank, n: h.tonight_entrants })} · {bandLabel(h.tonight_band, t)}
    </div>
  );
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
      <NftHorseArt look={look} className={s.hartCanvas} />
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

function DayRail({ day }: { day: number }) {
  return (
    <div className={s.rail}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = i + 1;
        const cls = d < day + 1 ? s.pipDone : d === day + 1 ? s.pipToday : s.pip;
        return <span key={d} className={cls} />;
      })}
    </div>
  );
}

function ActiveCard({ h, t }: { h: StableHorse; t: T }) {
  const untrained = !h.trained_for_next_race;
  const trainCls = untrained ? s.trainNo : s.trainYes;
  const trainText = untrained ? t.badge_untrained : t.badge_trained;
  return (
    <Link
      href={`/horses/${h.id}`}
      className={`${s.hcard} ${untrained ? s.untrained : ''}`}
      style={tvCardGlowStyle(h.total_value)}
    >
      <div className={s.hart}>
        <StableArt horse={h} t={t} />
        <TvChip h={h} t={t} extraCls={`${s.artBadge} ${s.artRarity}`} />
        <span className={`${s.trainBadge} ${trainCls} ${s.artBadge} ${s.artTrain}`}>{trainText}</span>
      </div>
      <div className={s.hbody}>
        <div className={s.hrow1}>
          <span className={s.hname}>{h.name}</span>
          <TvChip h={h} t={t} extraCls={s.inlineRarity!} />
          {/* Decision 087監査: スマート出品中は走るが今夜売れる可能性がある — 事実を小さく明示 */}
          {h.listing === 'SMART' ? <span className={s.smartTag}>{t.smart_tag}</span> : null}
          <span className={s.htype}>{h.horse_type}</span>
        </div>
        <DayRail day={h.current_day} />
        <RankLine h={h} t={t} />
        {uncollectedGain(h) > 0 ? (
          <div className={s.harvestTag}>{fill(t.uncollected_tpl, { v: uncollectedGain(h).toFixed(2) })}</div>
        ) : null}
        <div className={s.hfoot}>
          <span className={s.hvalue}>{t.value_now} <b>{horseValue(h.current_day)}</b> USDT</span>
          <span className={`${s.hcta} ${untrained ? s.hctaTrain : s.hctaDetail}`}>{untrained ? t.cta_train : t.cta_detail}</span>
          <span className={`${s.trainBadge} ${trainCls} ${s.inlineTrain}`}>{trainText}</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * 手動出品中(Market Lock)の馬 — 「出品中」セクション専用カード(Decision 087監査)。
 * 今夜は出走しない事実を明示し、無駄になる調教CTAは出さない。管理は/marketへ。
 */
export function ListedCard({ h, t }: { h: StableHorse; t: T }) {
  return (
    <Link href="/market" className={`${s.hcard} ${s.listedCard}`} style={tvCardGlowStyle(h.total_value)}>
      <div className={s.hart}>
        <StableArt horse={h} t={t} />
        <TvChip h={h} t={t} extraCls={`${s.artBadge} ${s.artRarity}`} />
        <span className={`${s.listedBadge} ${s.artBadge} ${s.artTrain}`}>{t.badge_listed}</span>
      </div>
      <div className={s.hbody}>
        <div className={s.hrow1}>
          <span className={s.hname}>{h.name}</span>
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
  const memorial = h.status === 'MEMORIALIZED';
  return (
    <Link href={`/horses/${h.id}`} className={s.champCard}>
      <div className={s.champInner}>
        <div className={s.champArt}><StableArt horse={h} t={t} /></div>
        <div className={s.champName}>{h.name}</div>
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
  const m = pastMeta(h.status, t);
  return (
    <Link href={`/horses/${h.id}`} className={`${s.pcard} ${m.mod}`}>
      <div className={s.part}>
        <div className={s.partInner}><StableArt horse={h} t={t} /></div>
        <span className={`${s.pstatusBadge} ${m.badge} ${s.pstatus}`}>{m.label}</span>
      </div>
      <div className={s.pbody}>
        <div className={s.prow}>
          <span className={s.pname}>{h.name}</span>
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
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(kind === 'active' ? 'value_desc' : 'total');
  const [untrainedOnly, setUntrainedOnly] = useState(false);
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = horses.filter((h) => {
      if (needle && !h.name.toLowerCase().includes(needle)) return false;
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
