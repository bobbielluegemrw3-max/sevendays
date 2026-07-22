'use client';

import { useEffect, useState } from 'react';
import { ITEM_BY_KEY_V2, ITEM_CATALOG_V2, BURN_DROP_KEYS_V2, AFFINITY_JA } from '@sevendays/domain';
import { deriveNftLook } from '@/lib/nft-visual';
import { NftHorseArt } from '@/components/NftHorseArt';
import type { MyDerbyHorse } from '@/lib/daily-derby';
import s from '../../app/daily-derby.module.css';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/**
 * 審判演出(2026-07-10 R3): 自分の馬の結果行が流れた瞬間、
 * その馬の実NFTアートを全画面オーバーレイで見せる。4種すべて同一の仕組み:
 *   - BURN: 赤熱して沈む+使用アイテム(喪失)とドロップ(獲得)を併記
 *   - 生存: 緑に輝く+「DAY3 → DAY4」のDAY進行を強調
 *   - DAY7: 金に輝く+CHAMPION
 *   - P2Pマッチング: シアンに輝く+相手(マスク済みメール)と売却/購入成立
 * 複数件は親がキューで順番に流す(queued = 残り件数表示)。表示秒数も親が管理。
 */

export interface VerdictInfo {
  name: string;
  kind: 'survive' | 'burn' | 'day7' | 'match';
  horse: MyDerbyHorse | undefined;
  /** BURN時のドロップ(該当なしは null)。 */
  dropKey: string | null;
  /** その夜この馬に使っていたアイテム(BURNで共に消費。なしは null)。 */
  usedItemKey: string | null;
  /** P2Pマッチングの向き(match時のみ)。 */
  matchSide?: 'sell' | 'buy' | undefined;
  /** P2P相手のマスク済みメール(match時のみ)。 */
  counterpart?: string | undefined;
  /** V2: プール/ミントで新規発行された馬(P2P相手は存在しない)。 */
  isMint?: boolean;
}

/** dna未取得時のフォールバック(馬名から擬似dna — プレビュー/旧APIレスポンス用)。 */
function dnaFor(horse: MyDerbyHorse | undefined, name: string): string {
  if (horse?.dnaHash) return horse.dnaHash;
  return `0x${Array.from(name).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(64, 'a').slice(0, 64)}`;
}

export function DerbyVerdict({ verdict, queued = 0 }: { verdict: VerdictInfo; queued?: number }) {
  const lang = useLang();
  const [showDrop, setShowDrop] = useState(false);
  useEffect(() => {
    setShowDrop(false);
    if (verdict.kind !== 'burn' || !verdict.dropKey) return;
    const id = setTimeout(() => setShowDrop(true), 1500);
    return () => clearTimeout(id);
  }, [verdict]);

  const day = verdict.horse?.currentDay;
  const drop = verdict.dropKey ? ITEM_BY_KEY_V2.get(verdict.dropKey) : null;
  const used = verdict.usedItemKey ? ITEM_BY_KEY_V2.get(verdict.usedItemKey) : null;

  const kicker =
    verdict.kind === 'burn' ? 'BURNED'
    : verdict.kind === 'day7' ? 'LV.7 — CHAMPION'
    : verdict.kind === 'match' ? (verdict.isMint ? 'NEW HORSE — LV.0' : 'P2P MATCHED')
    : 'SURVIVED';
  const kickerCls =
    verdict.kind === 'burn' ? s.verdictKickerBurn
    : verdict.kind === 'day7' ? s.verdictKickerGold
    : verdict.kind === 'match' ? s.verdictKickerCyan
    : '';
  const horseCls =
    verdict.kind === 'burn' ? s.vHorseBurn
    : verdict.kind === 'day7' ? s.vHorseDay7
    : verdict.kind === 'match' ? s.vHorseMatch
    : s.vHorseSurvive;

  return (
    <div className={s.verdictOverlay}>
      <div className={s.verdictCard}>
        <div className={`${s.verdictKicker} ${kickerCls}`}>{kicker}</div>
        <div className={`${s.vHorse} ${horseCls}`}>
          <NftHorseArt look={deriveNftLook(dnaFor(verdict.horse, verdict.name), verdict.name)} className={s.vHorseArt} />
        </div>
        <div className={s.verdictName}>{horseDisplayName(verdict.name, lang)}</div>
        {verdict.kind === 'survive' ? (
          <div className={s.verdictSub}>
            {day !== undefined ? (
              <>
                LV.{day} <span className={s.vDayArrow}>→</span> <b className={s.vDayNew}>LV.{Math.min(7, day + 1)}</b>
              </>
            ) : (
              '生存'
            )}
          </div>
        ) : verdict.kind === 'match' ? (
          <div className={s.verdictSub}>
            {verdict.isMint
              ? '新規ミント — あなたの厩舎へようこそ'
              : <>{verdict.counterpart ?? '???'} と{verdict.matchSide === 'buy' ? '購入' : '売却'}マッチング成立</>}
          </div>
        ) : (
          <div className={s.verdictSub}>
            {verdict.kind === 'day7' ? 'LV.7 走破' : day !== undefined ? `LV.${day} — BURN` : 'BURN'}
          </div>
        )}
        {verdict.kind === 'burn' && used && (
          <div className={s.usedRow}>
            <img className={s.usedIcon} src={`/items/${used.key}.webp`} alt={used.nameJa} />
            <span className={s.usedText}>使用アイテム(消費) — {used.nameJa}</span>
          </div>
        )}
        {showDrop && drop && (
          <div className={s.dropRow}>
            <img className={s.dropIcon} src={`/items/${drop.key}.webp`} alt={drop.nameJa} />
            <span className={s.dropText}>
              BURNドロップ獲得 — {drop.nameJa}({AFFINITY_JA[drop.affinity]})
            </span>
          </div>
        )}
        {queued > 0 && <div className={s.verdictQueued}>続いて あと {queued} 件</div>}
      </div>
    </div>
  );
}

/* ---- フィクスチャ(演出用の決定論データ。実データ結線時にAPI値へ置換) ---- */

/** 決定論的なドロップ判定(20%)。 */
export function fixtureDropKey(name: string, dateISO: string): string | null {
  const u = hash01(`${name}:${dateISO}`);
  if (u >= 0.2) return null;
  return BURN_DROP_KEYS_V2[Math.floor((u / 0.2) * BURN_DROP_KEYS_V2.length) % BURN_DROP_KEYS_V2.length]!;
}

/** 決定論的な使用アイテム(55%)。 */
export function fixtureUsedItemKey(name: string, dateISO: string): string | null {
  const u = hash01(`used:${name}:${dateISO}`);
  if (u >= 0.55) return null;
  return ITEM_CATALOG_V2[Math.floor((u / 0.55) * ITEM_CATALOG_V2.length) % ITEM_CATALOG_V2.length]!.key;
}

/** 決定論的なP2P相手のマスク済みメール。 */
const MASKED_EMAILS = [
  'k*****i@gmail.com',
  'b********3@gmail.com',
  'm***a@outlook.com',
  's******o@yahoo.com',
  't***u@proton.me',
] as const;
export function fixtureMaskedEmail(name: string, dateISO: string): string {
  return MASKED_EMAILS[Math.floor(hash01(`p2p:${name}:${dateISO}`) * MASKED_EMAILS.length) % MASKED_EMAILS.length]!;
}

function hash01(src: string): number {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}
