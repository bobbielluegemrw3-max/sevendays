'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppSelect } from '@/components/AppSelect';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook, NIGHT_LOOK } from '@/lib/nft-visual';
import { pct, horseValue, rarClass } from '@/components/stable-shared';
import type { StableHorse } from '@/components/StableView';
import { fill, type AppDict } from '@/lib/i18n-shared';
import s from '../app/stable.module.css';

/* ============================================================================
 * StableBrowser — 出走中 / 過去 の馬リストを「検索・ソート・絞り込み・
 * ページネーション」で捌くクライアントコンポーネント。100頭規模でも軽快に。
 *
 * kind='active': 検索 + ソート(価値/レアリティ/コンディション/未調教/名前) +
 *                レアリティ絞り込み + 未調教のみ + ページング。カードは縦/横リフロー。
 * kind='past':   検索 + ソート(状態/名前/レアリティ) + 状態絞り込み + ページング。
 * ========================================================================== */

const RANK: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };
type T = AppDict['stable'];
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
  const rar = rarClass(h.rarity);
  const trainCls = untrained ? s.trainNo : s.trainYes;
  const trainText = untrained ? t.badge_untrained : t.badge_trained;
  return (
    <Link href={`/horses/${h.id}`} className={`${s.hcard} ${untrained ? s.untrained : ''}`}>
      <div className={s.hart}>
        <StableArt horse={h} t={t} />
        <span className={`${s.rar} ${rar} ${s.artBadge} ${s.artRarity}`}>{h.rarity}</span>
        <span className={`${s.trainBadge} ${trainCls} ${s.artBadge} ${s.artTrain}`}>{trainText}</span>
      </div>
      <div className={s.hbody}>
        <div className={s.hrow1}>
          <span className={s.hname}>{h.name}</span>
          <span className={`${s.rar} ${rar} ${s.inlineRarity}`}>{h.rarity}</span>
          {/* Decision 087監査: スマート出品中は走るが今夜売れる可能性がある — 事実を小さく明示 */}
          {h.listing === 'SMART' ? <span className={s.smartTag}>{t.smart_tag}</span> : null}
          <span className={s.htype}>{h.horse_type}</span>
        </div>
        <DayRail day={h.current_day} />
        <div className={s.hmeters}>
          <span className={s.hmeter}><span className="k">COND</span><span className={s.track}><span className={s.fillCyan} style={{ width: `${pct(h.condition)}%` }} /></span></span>
          <span className={s.hmeter}><span className="k">FTG</span><span className={s.track}><span className={s.fillMag} style={{ width: `${pct(h.fatigue)}%` }} /></span></span>
        </div>
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
  const rar = rarClass(h.rarity);
  return (
    <Link href="/market" className={`${s.hcard} ${s.listedCard}`}>
      <div className={s.hart}>
        <StableArt horse={h} t={t} />
        <span className={`${s.rar} ${rar} ${s.artBadge} ${s.artRarity}`}>{h.rarity}</span>
        <span className={`${s.listedBadge} ${s.artBadge} ${s.artTrain}`}>{t.badge_listed}</span>
      </div>
      <div className={s.hbody}>
        <div className={s.hrow1}>
          <span className={s.hname}>{h.name}</span>
          <span className={`${s.rar} ${rar} ${s.inlineRarity}`}>{h.rarity}</span>
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
  value_desc: (a, b) => b.current_day - a.current_day || RANK[b.rarity]! - RANK[a.rarity]!,
  value_asc:  (a, b) => a.current_day - b.current_day || RANK[a.rarity]! - RANK[b.rarity]!,
  rarity:     (a, b) => RANK[b.rarity]! - RANK[a.rarity]! || b.current_day - a.current_day,
  cond:       (a, b) => Number(b.condition) - Number(a.condition),
  untrained:  (a, b) => Number(a.trained_for_next_race) - Number(b.trained_for_next_race) || b.current_day - a.current_day,
  name:       (a, b) => a.name.localeCompare(b.name),
};
// 過去セクションはBURNED専用になった(チャンピオンは金枠ギャラリーへ、Decision 087監査)
const PAST_SORTS: Record<string, (a: StableHorse, b: StableHorse) => number> = {
  rarity: (a, b) => RANK[b.rarity]! - RANK[a.rarity]! || a.name.localeCompare(b.name),
  name:   (a, b) => a.name.localeCompare(b.name),
};

/* ---- 本体 ----------------------------------------------------------------- */
export function StableBrowser({ kind, horses, t }: { kind: 'active' | 'past'; horses: StableHorse[]; t: T }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(kind === 'active' ? 'value_desc' : 'rarity');
  const [rar, setRar] = useState('ALL');            // active: レアリティ / past: 状態
  const [untrainedOnly, setUntrainedOnly] = useState(false);
  const [pageSize, setPageSize] = useState(24);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let arr = horses.filter((h) => {
      if (needle && !h.name.toLowerCase().includes(needle)) return false;
      if (kind === 'active') {
        if (rar !== 'ALL' && h.rarity !== rar) return false;
        if (untrainedOnly && h.trained_for_next_race) return false;
      } else {
        if (rar !== 'ALL' && h.status !== rar) return false;
      }
      return true;
    });
    const cmp = (kind === 'active' ? ACTIVE_SORTS : PAST_SORTS)[sort];
    if (cmp) arr = arr.slice().sort(cmp);
    return arr;
  }, [horses, q, sort, rar, untrainedOnly, kind]);

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
            { value: 'rarity', label: t.sort_rarity },
            { value: 'cond', label: t.sort_cond },
            { value: 'untrained', label: t.sort_untrained },
            { value: 'name', label: t.sort_name },
          ] : [
            { value: 'rarity', label: t.sort_rarity },
            { value: 'name', label: t.sort_name },
          ]}
        />
        {kind === 'active' ? (
          <AppSelect
            className={s.select}
            value={rar}
            onChange={(v) => { setRar(v); reset(); }}
            ariaLabel={t.filter_aria}
            options={[
              { value: 'ALL', label: t.filter_all },
              { value: 'LEGENDARY', label: 'LEGENDARY' },
              { value: 'EPIC', label: 'EPIC' },
              { value: 'RARE', label: 'RARE' },
              { value: 'UNCOMMON', label: 'UNCOMMON' },
              { value: 'COMMON', label: 'COMMON' },
            ]}
          />
        ) : null}
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
