'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook, NIGHT_LOOK } from '@/lib/nft-visual';
import { pct, horseValue, rarClass } from '@/components/stable-shared';
import type { StableHorse } from '@/components/StableView';
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
const PAGE_SIZES = [24, 48, 96, 99999];

/* ---- 隠し演出の原色オーバーレイ色(全身を1色に染める) ---------------------- */
export const COLOR_OVERLAY: Record<string, string> = {
  black: 'rgba(6,6,10,0.72)', red: '#e5322d', blue: '#2f6bff',
  yellow: '#ffcf1f', green: '#22c55e',
};

/* ---- 部品 ----------------------------------------------------------------- */
function StableArt({ horse }: { horse: StableHorse }) {
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
      {horse.golden_star ? <span className={s.goldenStar} title="黄金の夜の生還馬">★</span> : null}
      {horse.revenge_flame ? (
        <span className={`${s.revengeFlame} ${horse.revenge_gold ? s.revengeGold : ''}`} title="リベンジの焔">焔</span>
      ) : null}
      {horse.milestone ? <span className={s.milestoneMark} title="記念の一頭">7</span> : null}
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

function ActiveCard({ h }: { h: StableHorse }) {
  const untrained = !h.trained_for_next_race;
  const rar = rarClass(h.rarity);
  const trainCls = untrained ? s.trainNo : s.trainYes;
  const trainText = untrained ? '未調教' : '調教済';
  return (
    <Link href={`/horses/${h.id}`} className={`${s.hcard} ${untrained ? s.untrained : ''}`}>
      <div className={s.hart}>
        <StableArt horse={h} />
        <span className={`${s.rar} ${rar} ${s.artBadge} ${s.artRarity}`}>{h.rarity}</span>
        <span className={`${s.trainBadge} ${trainCls} ${s.artBadge} ${s.artTrain}`}>{trainText}</span>
      </div>
      <div className={s.hbody}>
        <div className={s.hrow1}>
          <span className={s.hname}>{h.name}</span>
          <span className={`${s.rar} ${rar} ${s.inlineRarity}`}>{h.rarity}</span>
          {/* Decision 087監査: スマート出品中は走るが今夜売れる可能性がある — 事実を小さく明示 */}
          {h.listing === 'SMART' ? <span className={s.smartTag}>出品中</span> : null}
          <span className={s.htype}>{h.horse_type}</span>
        </div>
        <DayRail day={h.current_day} />
        <div className={s.hmeters}>
          <span className={s.hmeter}><span className="k">COND</span><span className={s.track}><span className={s.fillCyan} style={{ width: `${pct(h.condition)}%` }} /></span></span>
          <span className={s.hmeter}><span className="k">FTG</span><span className={s.track}><span className={s.fillMag} style={{ width: `${pct(h.fatigue)}%` }} /></span></span>
        </div>
        <div className={s.hfoot}>
          <span className={s.hvalue}>現在価値 <b>{horseValue(h.current_day)}</b> USDT</span>
          <span className={`${s.hcta} ${untrained ? s.hctaTrain : s.hctaDetail}`}>{untrained ? '調教する →' : '詳細 →'}</span>
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
export function ListedCard({ h }: { h: StableHorse }) {
  const rar = rarClass(h.rarity);
  return (
    <Link href="/market" className={`${s.hcard} ${s.listedCard}`}>
      <div className={s.hart}>
        <StableArt horse={h} />
        <span className={`${s.rar} ${rar} ${s.artBadge} ${s.artRarity}`}>{h.rarity}</span>
        <span className={`${s.listedBadge} ${s.artBadge} ${s.artTrain}`}>出品中</span>
      </div>
      <div className={s.hbody}>
        <div className={s.hrow1}>
          <span className={s.hname}>{h.name}</span>
          <span className={`${s.rar} ${rar} ${s.inlineRarity}`}>{h.rarity}</span>
          <span className={s.htype}>{h.horse_type}</span>
        </div>
        <div className={s.listedNote}>今夜は出走しません(Day・価値は凍結)</div>
        <div className={s.hfoot}>
          <span className={s.hvalue}>出品価格 <b>{horseValue(h.current_day)}</b> USDT</span>
          <span className={`${s.hcta} ${s.hctaDetail}`}>出品を管理 →</span>
          <span className={`${s.listedBadge} ${s.inlineTrain}`}>出品中</span>
        </div>
      </div>
    </Link>
  );
}

/**
 * チャンピオンコレクション — Day7走破馬を金枠NFTとして飾るギャラリーカード。
 */
export function ChampionCard({ h }: { h: StableHorse }) {
  const memorial = h.status === 'MEMORIALIZED';
  return (
    <Link href={`/horses/${h.id}`} className={s.champCard}>
      <div className={s.champInner}>
        <div className={s.champArt}><StableArt horse={h} /></div>
        <div className={s.champName}>{h.name}</div>
        <div className={s.champTag}>{memorial ? 'MEMORIAL NFT' : 'CHAMPION'}</div>
        <div className={s.champSub}>
          {memorial ? '7日完走 · 記念NFT' : '7日走破 · 報酬受取中'}
        </div>
      </div>
    </Link>
  );
}

function pastMeta(status: string): { mod: string; badge: string; label: string; note: string } {
  switch (status) {
    case 'DAY7_CLEARED':
      return { mod: s.pcleared!, badge: s.stCleared!, label: 'チャンピオン', note: '7日走破 · チャンピオン報酬 受取中' };
    case 'MEMORIALIZED':
      return { mod: s.pmemorial!, badge: s.stMemorial!, label: '記念馬 · NFT', note: '7日完走 · 記念NFT' };
    case 'BURNED':
    default:
      return { mod: s.pburned!, badge: s.stBurned!, label: 'BURNED · 消滅', note: 'レースで消滅' };
  }
}

function PastCard({ h }: { h: StableHorse }) {
  const m = pastMeta(h.status);
  return (
    <Link href={`/horses/${h.id}`} className={`${s.pcard} ${m.mod}`}>
      <div className={s.part}>
        <div className={s.partInner}><StableArt horse={h} /></div>
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
export function StableBrowser({ kind, horses }: { kind: 'active' | 'past'; horses: StableHorse[] }) {
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
          placeholder={kind === 'active' ? '馬名で検索…' : '過去馬を名前で検索…'}
          aria-label="検索"
        />
        <select className={s.select} value={sort} onChange={(e) => { setSort(e.target.value); reset(); }} aria-label="並び替え">
          {kind === 'active' ? (
            <>
              <option value="value_desc">価値が高い順</option>
              <option value="value_asc">価値が低い順</option>
              <option value="rarity">レアリティ順</option>
              <option value="cond">コンディション順</option>
              <option value="untrained">未調教を先頭</option>
              <option value="name">名前順</option>
            </>
          ) : (
            <>
              <option value="rarity">レアリティ順</option>
              <option value="name">名前順</option>
            </>
          )}
        </select>
        {kind === 'active' ? (
          <select className={s.select} value={rar} onChange={(e) => { setRar(e.target.value); reset(); }} aria-label="レアリティ絞り込み">
            <option value="ALL">レアリティ: すべて</option>
            <option value="LEGENDARY">LEGENDARY</option>
            <option value="EPIC">EPIC</option>
            <option value="RARE">RARE</option>
            <option value="UNCOMMON">UNCOMMON</option>
            <option value="COMMON">COMMON</option>
          </select>
        ) : null}
        {kind === 'active' ? (
          <button
            type="button"
            className={`${s.toggleBtn} ${untrainedOnly ? s.toggleBtnOn : ''}`}
            onClick={() => { setUntrainedOnly((v) => !v); reset(); }}
            aria-pressed={untrainedOnly}
          >
            未調教のみ
          </button>
        ) : null}
        <span className={s.count}>{shown === total ? `全${total}頭` : `${total}頭中 ${shown}頭が該当`}</span>
      </div>

      {slice.length > 0 ? (
        <div className={kind === 'active' ? s.gallery : s.pastGrid}>
          {slice.map((h) => (kind === 'active' ? <ActiveCard key={h.id} h={h} /> : <PastCard key={h.id} h={h} />))}
        </div>
      ) : (
        <div className={s.noMatch}>条件に一致する馬がいません。検索やフィルタを調整してください。</div>
      )}

      {!all && pageCount > 1 ? (
        <div className={s.pager}>
          <button type="button" className={s.pagerBtn} disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← 前へ</button>
          <span className={s.pageLabel}>{safePage + 1} / {pageCount}</span>
          <button type="button" className={s.pagerBtn} disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}>次へ →</button>
          <select className={s.selectSm} value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); reset(); }} aria-label="1ページの表示件数">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n >= 9999 ? '全件表示' : `${n}件/頁`}</option>)}
          </select>
        </div>
      ) : null}
    </>
  );
}
