'use client';

import { useEffect, useMemo, useRef } from 'react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import {
  settlementFrame,
  type HarvestRow,
  type SettlementInput,
} from '@/lib/settlement-act';
import s from '../../app/daily-derby.module.css';
import { useLang } from '@/components/LangProvider';
import { horseDisplayName } from '@/lib/horse-name';

/* ============================================================================
 * SETTLEMENT — 「あなたの一日の決算」
 *
 * 62〜96.5秒のダミー濁流(LIST/BID/MATCH/MINT/MLM/ITEM)を置き換える幕。
 * 濁流を消しても自分の本物のデータは1件も失われない — 自分の売買はもともと
 * myEvents から来ており、他人の行はすべて makeLine() の作り物だった。
 *
 * 賑わいは MARKET PULSE の実カウント3秒で正直に残す。1件ずつの作り話は要らない。
 * ========================================================================== */

export function SettlementAct({
  input,
  elapsed,
  onRowRevealed,
}: {
  input: SettlementInput;
  /** 幕ローカルの経過秒(0 = 幕開け)。 */
  elapsed: number;
  /** 1頭が開示された瞬間(音の合図に使う。out=出ていった / in=入ってきた)。 */
  onRowRevealed?: ((row: HarvestRow) => void) | undefined;
}) {
  const lang = useLang();
  const frame = useMemo(() => settlementFrame(input, elapsed), [input, elapsed]);

  /* 行が1つ増えた瞬間だけ呼ぶ。音は「方向」だけを伝える —
     収支のプラス/マイナスで音を変えてはいけない(R1: 当たり音になる)。 */
  const lastRow = useRef<string | null>(null);
  const current = frame.current;
  useEffect(() => {
    if (!current) { lastRow.current = null; return; }
    const key = `${current.kind}:${current.name}`;
    if (lastRow.current === key) return;
    lastRow.current = key;
    onRowRevealed?.(current);
  }, [current, onRowRevealed]);
  const { pulse, revealed, netTotal, stableBefore, stableAfter, showClosing } = frame;

  return (
    <div className={s.stWrap}>
      {/* 今夜の市場 — 集計だけ。個別行は出さない(出せばフィクションになる) */}
      <div className={s.stPulse}>
        <span className={s.stPulseK}>今夜の市場</span>
        <span className={s.stPulseV}>
          取引 <b><AnimatedNumber value={pulse.trades} group animateOnMount durationMs={1100} /></b> 件
        </span>
        <span className={s.stPulseV}>
          出品 <b><AnimatedNumber value={pulse.listed} group animateOnMount durationMs={1100} delayMs={150} /></b> 頭
        </span>
        <span className={s.stPulseV}>
          新規 <b><AnimatedNumber value={pulse.mints} group animateOnMount durationMs={1100} delayMs={300} /></b> 頭
        </span>
      </div>

      {revealed.length > 0 && (
        <>
          <div className={s.stTitle}>YOUR LEDGER TONIGHT</div>
          <ul className={s.stRows}>
            {revealed.map((r) => {
              const profit =
                r.kind === 'out' && r.acquired != null && r.net != null
                  ? Math.round((Number(r.net) - Number(r.acquired)) * 100) / 100
                  : null;
              return (
                <li key={`${r.kind}:${r.name}`} className={`${s.stRow} ${r.kind === 'out' ? s.stOut : s.stIn}`}>
                  <NftHorseArt look={deriveNftLook(r.dnaHash, r.name)} className={s.stArt} />
                  <div className={s.stBody}>
                    <div className={s.stName}>{horseDisplayName(r.name, lang)}</div>
                    <div className={s.stLine}>
                      {r.kind === 'out' ? (
                        <>
                          <b className={s.stPrice}>{r.price}</b> USDT で利確
                          {profit !== null && (
                            <span className={profit >= 0 ? s.stGain : s.stLoss}>
                              {profit >= 0 ? ' +' : ' '}
                              <AnimatedNumber value={profit} digits={2} animateOnMount durationMs={700} />
                            </span>
                          )}
                        </>
                      ) : (
                        <>
                          {r.isMint ? '新規発行' : `${r.price} USDT`}
                          {r.totalValue !== null && <> · 総合値 {r.totalValue}</>}
                          {' が仲間入り'}
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {showClosing && (
        <div className={s.stClose}>
          {stableBefore !== null && stableAfter !== null && (
            <span className={s.stCloseK}>
              厩舎 {stableBefore}頭 → <b>{stableAfter}頭</b>
            </span>
          )}
          {netTotal !== null && (
            <span className={netTotal >= 0 ? s.stGain : s.stLoss}>
              今夜の収支 {netTotal >= 0 ? '+' : '−'}
              <AnimatedNumber value={Math.abs(netTotal)} digits={2} animateOnMount durationMs={900} /> USDT
            </span>
          )}
        </div>
      )}
    </div>
  );
}
