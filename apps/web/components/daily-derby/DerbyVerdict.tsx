'use client';

import { useEffect, useState } from 'react';
import { ITEM_BY_KEY_V2, BURN_DROP_KEYS_V2, AFFINITY_JA } from '@sevendays/domain';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import type { MyDerbyHorse } from '@/lib/daily-derby';
import s from '../../app/daily-derby.module.css';

/**
 * 審判演出(2026-07-10 改訂): 自分の馬の結果行が流れた瞬間、
 * その馬の実NFTアートを全画面オーバーレイで見せる。
 *   - BURN: 馬が赤熱して暗く沈む。ドロップがあれば1.5秒後に獲得行を下に追加
 *     (馬は消さない — 「この馬のBURNからアイテムを得た」の関係を1画面で見せる)
 *   - 生存/DAY7: 馬が緑/金に輝く。文言は事実のみ(DAY4 → DAY5 等)、詩的な行は置かない。
 * 表示秒数は親が管理。
 */

export interface VerdictInfo {
  name: string;
  kind: 'survive' | 'burn' | 'day7';
  horse: MyDerbyHorse | undefined;
  /** BURN時のドロップ(該当なしは null)。 */
  dropKey: string | null;
}

/** dna未取得時のフォールバック(馬名から擬似dna — プレビュー/旧APIレスポンス用)。 */
function dnaFor(horse: MyDerbyHorse | undefined, name: string): string {
  if (horse?.dnaHash) return horse.dnaHash;
  return `0x${Array.from(name).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(64, 'a').slice(0, 64)}`;
}

export function DerbyVerdict({ verdict }: { verdict: VerdictInfo }) {
  const [showDrop, setShowDrop] = useState(false);
  useEffect(() => {
    if (verdict.kind !== 'burn' || !verdict.dropKey) return;
    const id = setTimeout(() => setShowDrop(true), 1500);
    return () => clearTimeout(id);
  }, [verdict.kind, verdict.dropKey]);

  const day = verdict.horse?.currentDay;
  const drop = verdict.dropKey ? ITEM_BY_KEY_V2.get(verdict.dropKey) : null;
  const kicker =
    verdict.kind === 'burn' ? 'BURNED' : verdict.kind === 'day7' ? 'DAY7 CLEARED' : 'SURVIVED';
  const sub =
    verdict.kind === 'burn'
      ? day !== undefined ? `DAY${day} — BURN` : 'BURN'
      : verdict.kind === 'day7'
        ? 'DAY7 走破'
        : day !== undefined ? `DAY${day} → DAY${Math.min(7, day + 1)}` : '生存';
  const kickerCls =
    verdict.kind === 'burn' ? s.verdictKickerBurn : verdict.kind === 'day7' ? s.verdictKickerGold : '';
  const horseCls =
    verdict.kind === 'burn' ? s.vHorseBurn : verdict.kind === 'day7' ? s.vHorseDay7 : s.vHorseSurvive;

  return (
    <div className={s.verdictOverlay}>
      <div className={s.verdictCard}>
        <div className={`${s.verdictKicker} ${kickerCls}`}>{kicker}</div>
        <div className={`${s.vHorse} ${horseCls}`}>
          <NftHorseArt look={deriveNftLook(dnaFor(verdict.horse, verdict.name), verdict.name)} className={s.vHorseArt} />
        </div>
        <div className={s.verdictName}>{verdict.name}</div>
        <div className={s.verdictSub}>{sub}</div>
        {showDrop && drop && (
          <div className={s.dropRow}>
            <img className={s.dropIcon} src={`/items/${drop.key}.webp`} alt={drop.nameJa} />
            <span className={s.dropText}>
              BURNドロップ獲得 — {drop.nameJa}({AFFINITY_JA[drop.affinity]})
            </span>
          </div>
        )}
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
