'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TOTAL_VALUE_V2 } from '@sevendays/domain';
import { tvTier } from '@/lib/tv-tier';
import s from '../app/horse-detail.module.css';

/**
 * 馬アートの生体反応レイヤ(オーナー承認 2026-07-18)。
 * 調教確定・アイテム使用の瞬間に、馬の画像そのものが反応する:
 *  - 駆け出し(モーション演出: 前傾+バウンド+スピードライン+砂埃)
 *  - ティア色のオーラ一閃 / 上振れ=金粒子 / 下振れ=暗転+砂埃 / REST=湯気
 *  - 数値ポップ(内訳つき・「次のレース後」の予測値まで正直に)
 *  - 保険(下振れ0止め)の盾キャッチ / シナジー2倍の弾み / ティア昇格リング
 *  - アイテム使用: アイコンが馬に吸い込まれてフラッシュ
 * TrainingFormV2 / ItemPrepPanelV3 からの CustomEvent で駆動(親子結線なし)。
 * 数値は全てイベント発火側の実ロール由来 — 架空値なし。
 */

export interface TrainingFxDetail {
  horseId: string;
  delta: number;
  synergy: number;
  itemBonus: number;
  itemKey: string | null;
  restsDecay: boolean;
  before: number;
  /** 次のレース後の予測値(ソフトキャップ+減衰込み・確定ロールなので決定論)。 */
  projected: number;
}

export interface ItemFxDetail {
  horseId: string;
  itemKey: string;
}

type Fx =
  | { kind: 'training'; d: TrainingFxDetail; promoted: boolean }
  | { kind: 'item'; d: ItemFxDetail };

const INSURANCE_KEYS = new Set(['masters_eye', 'testament_mane']);
const SYNERGY_KEYS = new Set(['synergy_incense']);

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export function HeroArtFx({ horseId, children }: { horseId: string; children: ReactNode }) {
  const [fx, setFx] = useState<Fx | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
    };
    const play = (next: Fx, ms: number) => {
      clear();
      setFx(null);
      // 連打でもアニメを最初から(再フローでkeyframe再始動)
      requestAnimationFrame(() => requestAnimationFrame(() => setFx(next)));
      timer.current = setTimeout(() => setFx(null), ms);
    };
    const onTraining = (e: Event) => {
      const d = (e as CustomEvent<TrainingFxDetail>).detail;
      if (d.horseId !== horseId) return;
      const promoted = d.projected > d.before && tvTier(d.projected).key !== tvTier(d.before).key;
      play({ kind: 'training', d, promoted }, promoted ? 4200 : 3000);
    };
    const onItem = (e: Event) => {
      const d = (e as CustomEvent<ItemFxDetail>).detail;
      if (d.horseId !== horseId) return;
      play({ kind: 'item', d }, 1400);
    };
    window.addEventListener('sdd:training-confirmed', onTraining);
    window.addEventListener('sdd:item-applied', onItem);
    // 視覚QA(/dev/*のみ): ?fx=up|down|rest|promo|insurance|synergy|item で自動再生
    if (window.location.pathname.startsWith('/dev/')) {
      const q = new URLSearchParams(window.location.search).get('fx');
      if (q) {
        const base: TrainingFxDetail = {
          horseId, delta: 4.5, synergy: 1.5, itemBonus: 0, itemKey: null,
          restsDecay: false, before: 85, projected: 88.5,
        };
        const detail: TrainingFxDetail =
          q === 'down' ? { ...base, delta: -3.4, synergy: 0, projected: 79.6, before: 85 }
          : q === 'rest' ? { ...base, delta: 0, synergy: 0, restsDecay: true, projected: 85 }
          : q === 'promo' ? { ...base, delta: 6.0, before: 88, projected: 92.0 }
          : q === 'insurance' ? { ...base, delta: -3.2, synergy: 0, itemBonus: 3.2, itemKey: 'masters_eye', projected: 83 }
          : q === 'synergy' ? { ...base, itemBonus: 1.5, itemKey: 'synergy_incense' }
          : base;
        setTimeout(() => {
          if (q === 'item') {
            window.dispatchEvent(new CustomEvent<ItemFxDetail>('sdd:item-applied', { detail: { horseId, itemKey: 'storm_armor' } }));
          } else {
            window.dispatchEvent(new CustomEvent<TrainingFxDetail>('sdd:training-confirmed', { detail }));
          }
        }, 600);
      }
    }
    return () => {
      clear();
      window.removeEventListener('sdd:training-confirmed', onTraining);
      window.removeEventListener('sdd:item-applied', onItem);
    };
  }, [horseId]);

  const t = fx?.kind === 'training' ? fx.d : null;
  const totalGain = t ? Math.round((t.delta + t.itemBonus) * 10) / 10 : 0;
  const up = t !== null && totalGain > 0;
  const down = t !== null && totalGain < 0;
  const rest = t !== null && t.restsDecay && totalGain === 0;
  const insurance = t !== null && t.itemKey !== null && INSURANCE_KEYS.has(t.itemKey) && t.itemBonus > 0;
  const synergyDouble = t !== null && t.itemKey !== null && SYNERGY_KEYS.has(t.itemKey) && t.itemBonus > 0;
  const tier = t ? tvTier(t.projected) : null;
  const promoted = fx?.kind === 'training' && fx.promoted;

  return (
    <div
      className={[
        s.fxWrap,
        t ? s.fxPlay : '',
        up ? s.fxUp : '',
        down ? s.fxDown : '',
        rest ? s.fxRest : '',
        promoted ? s.fxPromo : '',
        fx?.kind === 'item' ? s.fxItemPlay : '',
      ].join(' ')}
      style={tier ? ({ '--fxc': tier.color, '--fxg': tier.glow } as React.CSSProperties) : undefined}
    >
      {children}

      {/* 駆け出しのスピードライン+砂埃(モーション中のみ) */}
      {t && !rest ? <span className={s.fxLines} aria-hidden="true" /> : null}
      {t ? (
        <span className={s.fxDust} aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </span>
      ) : null}

      {/* アート連動レイヤ(正典 04_馬の反応アニメ): クローム掃引+回路サージ+たてがみ飛散 */}
      {t && up ? (
        <>
          <span className={s.fxSweep} aria-hidden="true" />
          <span className={s.fxCircuit} aria-hidden="true" />
          <span className={s.fxMane} aria-hidden="true">
            <i /><i /><i /><i /><i /><i />
          </span>
        </>
      ) : null}
      {/* 眼フレア: 上振れ/昇格/保険/アイテム使用の一閃 */}
      {(t && (up || insurance)) || fx?.kind === 'item' ? (
        <span className={s.fxEye} aria-hidden="true" />
      ) : null}
      {rest ? (
        <span className={s.fxSteam} aria-hidden="true">
          <i /><i /><i />
        </span>
      ) : null}
      {up ? (
        <span className={s.fxSpark} aria-hidden="true">
          <i /><i /><i /><i /><i /><i />
        </span>
      ) : null}

      {/* 数値ポップ(内訳→合計→予測値。実ロール値のみ) */}
      {t ? (
        <span className={s.fxPop} role="status">
          <span className={s.fxPopRows}>
            {t.delta !== 0 || t.itemBonus === 0 ? (
              <span className={s.fxPopRow}>調教 <b className={t.delta < 0 ? s.fxNeg : ''}>{fmtSigned(t.delta)}</b></span>
            ) : null}
            {t.itemBonus > 0 ? (
              <span className={s.fxPopRow}>
                {insurance ? '保険' : synergyDouble ? 'シナジー×2' : 'アイテム'}{' '}
                <b>{fmtSigned(t.itemBonus)}</b>
              </span>
            ) : null}
          </span>
          <b className={`${s.fxPopMain} ${down ? s.fxNeg : ''}`}>
            {rest ? 'REST' : fmtSigned(totalGain)}
          </b>
          <span className={s.fxPopNext}>
            {t.before} → <b>{t.projected}</b>
            <small>{rest ? '(減衰を1回無効)' : '(次のレース後・減衰込み)'}</small>
          </span>
        </span>
      ) : null}

      {/* 保険の盾キャッチ */}
      {insurance ? <span className={s.fxShieldCatch} aria-hidden="true">0で受け止めた</span> : null}

      {/* ティア昇格リング */}
      {promoted && tier ? (
        <span className={s.fxPromoTag} role="status">TIER UP — {tier.label}</span>
      ) : null}

      {/* アイテム吸い込み */}
      {fx?.kind === 'item' ? (
        <span className={s.fxItemIn} aria-hidden="true">
          <img src={`/items/${fx.d.itemKey}.webp`} alt="" width={56} height={56} />
        </span>
      ) : null}
    </div>
  );
}

/**
 * 確定ロールから「次のレース後」の総合値を予測する(確定即最終=決定論なので正直)。
 * エンジンの applyTotalValueGainV2/applyDecayV2 と同じ数式(定数はdomainの実定数)。
 */
export function projectAfterRace(before: number, gain: number, restsDecay: boolean): number {
  const TV = TOTAL_VALUE_V2;
  let next: number;
  if (gain <= 0) next = before + gain;
  else if (before >= TV.softCap) next = before + gain * TV.softCapFactor;
  else {
    const headroom = TV.softCap - before;
    next = gain <= headroom ? before + gain : TV.softCap + (gain - headroom) * TV.softCapFactor;
  }
  const afterDecay = restsDecay ? next : next - TV.decayPerRace;
  return Math.round(Math.max(TV.min, Math.min(TV.max, afterDecay)) * 100) / 100;
}
