'use client';

import { useEffect, useState } from 'react';
import { ITEM_BY_KEY_V2, BURN_DROP_KEYS_V2, AFFINITY_JA } from '@sevendays/domain';
import type { MyDerbyHorse } from '@/lib/daily-derby';
import s from '../../app/daily-derby.module.css';

/**
 * 審判演出(DERBY_DRAMA — 2026-07-10 オーナー判断でBURNのみに縮小):
 *   自分の馬のBURN行が流れた瞬間、グリッチ消滅 → 墓碑ライン →
 *   BURNドロップのガチャ開封(該当時)。生存/DAY7はログハイライト+チャイムのみ。
 * 表示秒数は親が管理(このコンポーネントは経過msで内部フェーズを刻む)。
 */

export interface VerdictInfo {
  name: string;
  horse: MyDerbyHorse | undefined;
  /** BURNドロップ(該当なしは null)。 */
  dropKey: string | null;
}

export function DerbyVerdict({ verdict }: { verdict: VerdictInfo }) {
  const [showDrop, setShowDrop] = useState(false);
  useEffect(() => {
    if (!verdict.dropKey) return;
    const id = setTimeout(() => setShowDrop(true), 1700);
    return () => clearTimeout(id);
  }, [verdict.dropKey]);

  const day = verdict.horse?.currentDay;
  const drop = verdict.dropKey ? ITEM_BY_KEY_V2.get(verdict.dropKey) : null;

  return (
    <div className={s.verdictOverlay}>
      <div className={s.verdictCard}>
        <div className={`${s.verdictKicker} ${s.verdictKickerBurn}`}>BURNED</div>
        {!showDrop ? (
          <>
            <div className={s.burnGlitch}>
              <span className={s.burnName}>{verdict.name}</span>
            </div>
            <div className={s.burnEpitaph}>
              {day !== undefined ? `DAY${day} まで戦った` : '最後まで走った'} — その意志は消えない
            </div>
            {verdict.dropKey && <div className={s.burnHint}>…何かが炎の中に残っている</div>}
          </>
        ) : drop ? (
          <div className={s.dropReveal}>
            <img className={s.dropArt} src={`/items/${drop.key}.webp`} alt={drop.nameJa} />
            <div className={s.dropName}>{drop.nameJa}</div>
            <div className={s.dropNote}>BURNドロップ獲得! — {AFFINITY_JA[drop.affinity]}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 決定論的なドロップ判定(演出用・20%)。実データ結線時はAPI値に置換する。 */
export function fixtureDropKey(name: string, dateISO: string): string | null {
  let h = 2166136261;
  const src = `${name}:${dateISO}`;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const u = ((h >>> 0) % 1000) / 1000;
  if (u >= 0.2) return null;
  return BURN_DROP_KEYS_V2[Math.floor((u / 0.2) * BURN_DROP_KEYS_V2.length) % BURN_DROP_KEYS_V2.length]!;
}
