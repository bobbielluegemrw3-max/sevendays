'use client';

import { useEffect, useRef, useState } from 'react';
import { NftHorseArt } from '@/components/NftHorseArt';
import { deriveNftLook } from '@/lib/nft-visual';
import { tvTier } from '@/lib/tv-tier';
import type { TrainingFxDetail, ItemFxDetail } from '@/components/HeroArtFx';
import s from '../app/horse-detail.module.css';

/**
 * モバイル「中央反応」案A(2026-07-19 ハンドオフ B)。
 * モバイルは縦積みのため、調教/アイテム操作時に馬アートがスクロールアウトして
 * HeroArtFx の反応が見えない — 同じ CustomEvent を購読して画面中央に一瞬ポップする
 * 表示レイヤ。発火側(TrainingFormV2/ItemPrepPanelV3)は無改修・購読のみ。
 * PC(>900px)では描画しない(アート上の HeroArtFx が担当)。
 * 数値はイベントが運ぶ実ロール値のみ。正典HTMLのV1文言(今夜等)はV2表現へ置換済み。
 */

type Rx =
  | { kind: 'training'; d: TrainingFxDetail; promoted: boolean }
  | { kind: 'item'; d: ItemFxDetail };

function fmtSigned(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

export function HeroReactionOverlay({
  horseId,
  horseName,
  dnaHash,
}: {
  horseId: string;
  horseName: string;
  dnaHash: string;
}) {
  const [mobile, setMobile] = useState(false);
  const [rx, setRx] = useState<Rx | null>(null);
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!mobile) return;
    const open = (next: Rx, ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      setRx(next);
      setOn(false);
      // 連打でもアニメを最初から(正典: void offsetWidth 相当の再フロー)
      requestAnimationFrame(() => requestAnimationFrame(() => setOn(true)));
      timer.current = setTimeout(() => setOn(false), ms);
    };
    const onTraining = (e: Event) => {
      const d = (e as CustomEvent<TrainingFxDetail>).detail;
      if (d.horseId !== horseId) return;
      const promoted = d.projected > d.before && tvTier(d.projected).key !== tvTier(d.before).key;
      open({ kind: 'training', d, promoted }, promoted ? 3600 : 2600);
    };
    const onItem = (e: Event) => {
      const d = (e as CustomEvent<ItemFxDetail>).detail;
      if (d.horseId !== horseId) return;
      open({ kind: 'item', d }, 1500);
    };
    window.addEventListener('sdd:training-confirmed', onTraining);
    window.addEventListener('sdd:item-applied', onItem);
    return () => {
      window.removeEventListener('sdd:training-confirmed', onTraining);
      window.removeEventListener('sdd:item-applied', onItem);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [mobile, horseId]);

  if (!mobile || !rx) return null;

  const t = rx.kind === 'training' ? rx.d : null;
  const total = t ? Math.round((t.delta + t.itemBonus) * 10) / 10 : 0;
  const up = t !== null && total > 0;
  const down = t !== null && total < 0;
  const rest = t !== null && t.restsDecay && total === 0;
  const promoted = rx.kind === 'training' && rx.promoted;
  const tier = t ? tvTier(t.projected) : null;
  const mood = rx.kind === 'item' ? 'item' : up ? 'up' : down ? 'down' : 'rest';

  const close = () => {
    setOn(false);
    if (timer.current) clearTimeout(timer.current);
  };

  return (
    <div className={`${s.rx} ${on ? s.rxOn : ''}`} onClick={close} aria-hidden={!on}>
      <div className={s.rxCard}>
        <div className={`${s.rxKick} ${mood === 'up' ? s.rxKickUp : mood === 'down' ? s.rxKickDown : mood === 'item' ? s.rxKickItem : s.rxKickRest}`}>
          {rx.kind === 'item' ? 'アイテム装着' : up ? '総合値 UP' : down ? '総合値 DOWN' : 'REST — 減衰無効'}
        </div>
        <div className={`${s.rxArt} ${mood === 'up' ? s.rxArtUp : mood === 'down' ? s.rxArtDown : mood === 'item' ? s.rxArtItem : ''}`}>
          <NftHorseArt look={deriveNftLook(dnaHash, horseName)} className={s.rxArtCanvas} size={384} />
          {up ? (
            <span className={s.rxSpark} aria-hidden="true">
              <i /><i /><i /><i /><i /><i />
            </span>
          ) : null}
        </div>
        <div className={s.rxName}>{horseName}</div>
        {t ? (
          <div className={s.rxPop} role="status">
            <div className={s.rxRows}>
              {t.delta !== 0 || t.itemBonus === 0 ? (
                <span>調教 <b className={t.delta < 0 ? s.rxNeg : ''}>{fmtSigned(t.delta)}</b></span>
              ) : null}
              {t.itemBonus > 0 ? <span>アイテム <b>{fmtSigned(t.itemBonus)}</b></span> : null}
            </div>
            <b className={`${s.rxMain} ${down ? s.rxMainNeg : rest ? s.rxMainRest : ''}`}>
              {rest ? 'REST' : fmtSigned(total)}
            </b>
            <div className={s.rxNext}>
              {t.before} → <b>{t.projected}</b>
              <small>{rest ? '(次のレースの減衰を無効化)' : '(総合値に反映済み)'}</small>
            </div>
            {promoted && tier ? <span className={s.rxTier}>TIER UP — {tier.label}</span> : null}
          </div>
        ) : (
          <div className={s.rxNext}>次のレースに装着しました</div>
        )}
      </div>
    </div>
  );
}
