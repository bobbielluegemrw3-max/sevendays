'use client';

import { useEffect, useRef, useState } from 'react';

/* ============================================================================
 * 数値の補間(2026-07-21・UI_FOUNDATION_PLAN 1-1)
 *
 * このゲームは「数字が育つ」ゲームなのに、数字が育つ演出が1つも無かった
 * (監査: countUp/useSpring の実装ゼロ、アニメーションライブラリ依存もゼロ)。
 * 外部ライブラリを足さず、rAF だけの小さなフックで補う。
 *
 * 方針:
 *  - 値が変わったとき、前の値から新しい値へ ease-out で補間する
 *  - 初回マウントは補間しない(ページを開いた瞬間に全数字が動き出すのは煩い)
 *  - prefers-reduced-motion では即座に着地する(PageSkeleton と同じ方針)
 *  - 小数桁は呼び出し側が決める(総合値=1桁・USDT=2桁など)
 * ========================================================================== */

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** ease-out cubic — 立ち上がりが速く、着地が静か。 */
function easeOut(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

export interface CountUpOptions {
  /** 補間時間(ms)。既定 600。 */
  durationMs?: number;
  /** 初回マウント時も 0 から数え上げる(既定 false = 即表示)。 */
  animateOnMount?: boolean;
  /** 補間の開始値(既定は「直前に表示していた値」)。 */
  from?: number;
  /** 補間開始までの待ち(ms)。演出の中で数字を動かす順番を作るのに使う。 */
  delayMs?: number;
}

/**
 * `value` が変わるたび、前の値から新しい値へ補間した「表示用の数値」を返す。
 * 数値そのものを返すので、桁揃え・単位・符号は呼び出し側で整形する。
 */
export function useCountUp(value: number, options: CountUpOptions = {}): number {
  const { durationMs = 600, animateOnMount = false, from, delayMs = 0 } = options;
  const [shown, setShown] = useState<number>(animateOnMount ? (from ?? 0) : value);
  const shownRef = useRef(shown);
  const mounted = useRef(false);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0;

    // 初回: animateOnMount でなければ補間せず着地
    if (!mounted.current) {
      mounted.current = true;
      if (!animateOnMount) {
        setShown(target);
        shownRef.current = target;
        return;
      }
    }

    const start = from ?? shownRef.current;
    if (start === target || prefersReducedMotion() || durationMs <= 0) {
      setShown(target);
      shownRef.current = target;
      return;
    }

    let t0 = 0;
    const step = (now: number) => {
      if (t0 === 0) t0 = now;
      const p = Math.min(1, (now - t0) / durationMs);
      const v = start + (target - start) * easeOut(p);
      setShown(v);
      shownRef.current = v;
      if (p < 1) frame.current = requestAnimationFrame(step);
      else frame.current = null;
    };
    // 開始待ち: 待っている間は開始値のまま止めておく(演出の順番を作る)
    setShown(start);
    shownRef.current = start;
    const kick = window.setTimeout(() => {
      frame.current = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      window.clearTimeout(kick);
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
    // 注: from / animateOnMount は初回判定にのみ使い、以後の補間再起動の
    // トリガーにはしない(呼び出しごとに from が変わると毎回リセットされるため)。
  }, [value, durationMs, delayMs]);

  return shown;
}

/** 補間した数値を固定小数で文字列化する(表示側の定型を1箇所に)。 */
export function useCountUpText(
  value: number,
  digits = 0,
  options: CountUpOptions = {},
): string {
  const n = useCountUp(value, options);
  return n.toFixed(digits);
}
