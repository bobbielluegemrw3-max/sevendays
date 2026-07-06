'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
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
const STATUS_ORDER: Record<string, number> = { DAY7_CLEARED: 0, MEMORIALIZED: 1, BURNED: 2 };
const PAGE_SIZES = [24, 48, 96, 99999];

/* ---- 部品 ----------------------------------------------------------------- */
function StableArt({ horse }: { horse: StableHorse }) {
  const look = deriveNftLook(horse.dna_hash, horse.name);
  return <NftHorseArt look={look} className={s.hartCanvas} />;
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

function pastMeta(status: string): { mod: string; badge: string; label: string; note: string } {
  switch (status) {
    case 'DAY7_CLEARED':
      return { mod: s.pcleared!, badge: s.stCleared!, label: '買い戻し中', note: '7日走破 · 200 USDTで買い戻し中' };
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
const PAST_SORTS: Record<string, (a: StableHorse, b: StableHorse) => number> = {
  status: (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.name.localeCompare(b.name),
  rarity: (a, b) => RANK[b.rarity]! - RANK[a.rarity]! || a.name.localeCompare(b.name),
  name:   (a, b) => a.name.localeCompare(b.name),
};

/* ---- 本体 ----------------------------------------------------------------- */
export function StableBrowser({ kind, horses }: { kind: 'active' | 'past'; horses: StableHorse[] }) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState(kind === 'active' ? 'value_desc' : 'status');
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
              <option value="status">状態順</option>
              <option value="rarity">レアリティ順</option>
              <option value="name">名前順</option>
            </>
          )}
        </select>
        <select className={s.select} value={rar} onChange={(e) => { setRar(e.target.value); reset(); }} aria-label={kind === 'active' ? 'レアリティ絞り込み' : '状態絞り込み'}>
          {kind === 'active' ? (
            <>
              <option value="ALL">レアリティ: すべて</option>
              <option value="LEGENDARY">LEGENDARY</option>
              <option value="EPIC">EPIC</option>
              <option value="RARE">RARE</option>
              <option value="UNCOMMON">UNCOMMON</option>
              <option value="COMMON">COMMON</option>
            </>
          ) : (
            <>
              <option value="ALL">状態: すべて</option>
              <option value="BURNED">Burn(消滅)</option>
              <option value="DAY7_CLEARED">買い戻し中</option>
              <option value="MEMORIALIZED">記念馬</option>
            </>
          )}
        </select>
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
