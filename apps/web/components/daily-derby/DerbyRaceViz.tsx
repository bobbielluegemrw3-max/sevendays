'use client';

import { useEffect, useRef } from 'react';
import s from '../../app/daily-derby.module.css';

/**
 * ⑤自分視点のレース実走(SHOW REDESIGN 2026-07-11)。
 * RACE_RUN(17〜30秒)の間、18レーンのドット走行+自分のレーンに「▲ YOU」、
 * ゴール通過で金フラッシュ。決定論(レーン・速度は固定シード)で、
 * 実順位を示すものではない演出。elapsed は親のショー時計に同期し、
 * prop更新が止まったら(一時停止QA)描画も止める。
 */

const RUNNERS = 18;

function laneFor(name: string | undefined): number {
  if (!name) return 6;
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % RUNNERS;
}

export function DerbyRaceViz({
  progress,
  myName,
  fullBleed = false,
  spanSeconds = 13,
}: {
  /** 実走の進行 0..1(親が実走窓から算出)。 */
  progress: number;
  myName?: string | undefined;
  /** 正典(daily-derby-show.html)どおりステージ全面をレースで満たすモード。 */
  fullBleed?: boolean;
  /** 実走窓の実秒数(停止検知の補間に使用)。 */
  spanSeconds?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const propRef = useRef({ p: progress, at: 0 });
  propRef.current = { p: progress, at: typeof performance !== 'undefined' ? performance.now() : 0 };
  const youLane = laneFor(myName);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    let raf = 0;
    const draw = (now: number) => {
      // prop が 1.6秒以上更新されていなければ時計停止中(QA一時停止) — 進めない
      const stale = now - propRef.current.at > 1600;
      const p = Math.max(0, Math.min(1, propRef.current.p + (stale ? 0 : (now - propRef.current.at) / 1000 / spanSeconds)));
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      if (w > 0 && cv.width !== w) cv.width = w;
      if (h > 0 && cv.height !== h) cv.height = h;
      ctx.clearRect(0, 0, cv.width, cv.height);
      const finish = cv.width - 40;
      for (let i = 0; i < RUNNERS; i++) {
        const y = 14 + (cv.height - 28) * (i / (RUNNERS - 1));
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.beginPath();
        ctx.moveTo(30, y);
        ctx.lineTo(finish, y);
        ctx.stroke();
        const spd = 0.82 + ((i * 13) % 17) / 60;
        const x = 30 + (finish - 30) * Math.min(1, p * spd);
        const mine = i === youLane && !!myName;
        ctx.fillStyle = mine ? '#00eaff' : 'rgba(180,180,210,0.7)';
        ctx.beginPath();
        ctx.arc(x, y, mine ? 6 : 4, 0, 7);
        ctx.fill();
        if (mine) {
          ctx.fillStyle = '#00eaff';
          ctx.font = '700 10px Orbitron, sans-serif';
          // 最上レーンで上端に見切れないようラベルyをクランプ(ZIP2 崩れ修正③)
          ctx.fillText('▲ YOU', x - 14, y < 22 ? y + 18 : y - 9);
          ctx.shadowColor = '#00eaff';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, 7);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      // ゴールライン+通過フラッシュ
      ctx.strokeStyle = p > 0.96 ? 'rgba(242,228,191,0.9)' : 'rgba(242,228,191,0.35)';
      ctx.lineWidth = p > 0.96 ? 3 : 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(finish, 10);
      ctx.lineTo(finish, cv.height - 10);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      if (p > 0.96) {
        ctx.fillStyle = `rgba(242,228,191,${((p - 0.96) / 0.04) * 0.18})`;
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [youLane, myName, spanSeconds]);

  if (fullBleed) {
    return (
      <div className={s.raceVizFull}>
        <div className={s.raceVizFullHead}>
          <span className={s.liveDot} /> RACE ENGINE — LIVE
        </div>
        <canvas ref={ref} className={s.raceCanvasFull} />
      </div>
    );
  }
  return (
    <div className={s.raceViz}>
      <div className={s.raceVizHead}>
        <span className={s.liveDot} /> RACE ENGINE — LIVE
      </div>
      <canvas ref={ref} className={s.raceCanvas} />
    </div>
  );
}
