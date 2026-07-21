'use client';

import { useMemo } from 'react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import {
  settlementFrame,
  type SettlementInput,
} from '@/lib/settlement-act';
import s from '../../app/daily-derby.module.css';

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
}: {
  input: SettlementInput;
  /** 幕ローカルの経過秒(0 = 幕開け)。 */
  elapsed: number;
}) {
  const frame = useMemo(() => settlementFrame(input, elapsed), [input, elapsed]);
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
                    <div className={s.stName}>{r.name}</div>
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
