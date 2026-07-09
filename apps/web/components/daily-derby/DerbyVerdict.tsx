'use client';

import { useEffect, useRef, useState } from 'react';
import { ITEM_BY_KEY_V2, BURN_DROP_KEYS_V2, AFFINITY_JA } from '@sevendays/domain';
import { bakeGallopFrames } from '@/lib/gallop-cut';
import type { MyDerbyHorse } from '@/lib/daily-derby';
import s from '../../app/daily-derby.module.css';

/**
 * 審判演出(DERBY_DRAMA_IDEAS 第3幕):
 *   silence(0.8秒の完全静寂+暗転) → verdict
 *   - 生存/DAY7: 実NFT馬のゴールカット(gallopスプライト・チャンピオン技術の流用)
 *   - BURN: グリッチ消滅 → 墓碑ライン → BURNドロップのガチャ開封(該当時)
 * 表示秒数は親が管理(このコンポーネントは経過msで内部フェーズを刻む)。
 */

export interface VerdictInfo {
  name: string;
  kind: 'survive' | 'burn' | 'day7';
  horse: MyDerbyHorse | undefined;
  /** BURN時のドロップ(該当なしは null)。 */
  dropKey: string | null;
}

const SILENCE_MS = 800;

export function DerbyVerdict({ verdict }: { verdict: VerdictInfo }) {
  const [phase, setPhase] = useState<'silence' | 'reveal'>('silence');
  useEffect(() => {
    const id = setTimeout(() => setPhase('reveal'), SILENCE_MS);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className={s.verdictOverlay}>
      {phase === 'silence' ? (
        <div className={s.verdictSilence}>— YOUR RESULT —</div>
      ) : verdict.kind === 'burn' ? (
        <BurnVerdict verdict={verdict} />
      ) : (
        <SurviveVerdict verdict={verdict} />
      )}
    </div>
  );
}

/* ------------------------------------------------ 生存/DAY7: ゴールカット */

function SurviveVerdict({ verdict }: { verdict: VerdictInfo }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    void (async () => {
      const frames = await bakeGallopFrames(verdict.horse?.dnaHash, verdict.name);
      if (cancelled || !frames || !canvasRef.current) return;
      setReady(true);
      const cv = canvasRef.current;
      const ctx = cv.getContext('2d')!;
      const t0 = performance.now();
      const draw = (now: number) => {
        // rAFのタイムスタンプは t0 より僅かに過去になり得る(フレーム開始時刻)。
        // 負のtは JSの負数モジュロで frames[-1]=undefined を踏む — clampが必須。
        const t = Math.max(0, (now - t0) / 1000);
        ctx.clearRect(0, 0, cv.width, cv.height);
        // 1.8秒で左から駆け込み、右寄り(ゴール位置)で走り続ける。コマは12fps。
        const x = -0.25 + Math.min(1, t / 1.8) * 0.92;
        const frame = frames[Math.floor(t * 12) % frames.length]!;
        const H = cv.height * 0.92;
        ctx.save();
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(frame, Math.round(x * cv.width), Math.round(cv.height - H), Math.round(H), Math.round(H));
        ctx.restore();
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [verdict]);

  const day = verdict.horse?.currentDay;
  const label =
    verdict.kind === 'day7'
      ? 'DAY7 走破 — CHAMPION!'
      : day !== undefined
        ? `DAY${Math.min(7, day + 1)} へ進出!`
        : '生存!';

  return (
    <div className={s.verdictCard}>
      <div className={s.verdictKicker}>SURVIVED</div>
      <div className={s.verdictRun}>
        <canvas ref={canvasRef} width={720} height={240} className={s.verdictCanvas} />
        {!ready && <div className={s.verdictLoading}>…</div>}
        <div className={s.verdictFlash} aria-hidden="true" />
      </div>
      <div className={s.verdictName}>{verdict.name}</div>
      <div className={`${s.verdictLabel} ${verdict.kind === 'day7' ? s.verdictGold : ''}`}>{label}</div>
    </div>
  );
}

/* ----------------------------------------------- BURN: 墓碑 → ガチャ開封 */

function BurnVerdict({ verdict }: { verdict: VerdictInfo }) {
  const [showDrop, setShowDrop] = useState(false);
  useEffect(() => {
    if (!verdict.dropKey) return;
    const id = setTimeout(() => setShowDrop(true), 1700);
    return () => clearTimeout(id);
  }, [verdict.dropKey]);

  const day = verdict.horse?.currentDay;
  const drop = verdict.dropKey ? ITEM_BY_KEY_V2.get(verdict.dropKey) : null;

  return (
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
