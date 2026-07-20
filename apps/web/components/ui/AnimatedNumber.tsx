'use client';

import { useCountUp } from '@/lib/use-count-up';

/* ============================================================================
 * AnimatedNumber — 値が変わったら「前の値から新しい値へ登る」数値表示。
 * (2026-07-21・UI_FOUNDATION_PLAN 1-1)
 *
 * 監査の指摘: このゲームは数字が育つゲームなのに、数字が育つ演出が1つも無い。
 * サーバーコンポーネントの中でも数値だけをこれに差し替えれば動くようにしてある
 * (総資産カード・総合値メダリオン等はサーバー側で計算して値だけ渡す)。
 *
 * 桁区切り・小数桁・単位は呼び出し側の指定。prefers-reduced-motion は
 * useCountUp 側で吸収するので、ここでは分岐しない。
 * ========================================================================== */

export function AnimatedNumber({
  value,
  digits = 0,
  group = false,
  durationMs = 600,
  delayMs = 0,
  animateOnMount = false,
  className,
  style,
}: {
  value: number;
  /** 小数桁(総合値=1・USDT=2・頭数=0)。 */
  digits?: number;
  /** 3桁区切りを入れる(金額向け)。 */
  group?: boolean;
  durationMs?: number;
  delayMs?: number;
  /** 初回表示でも 0 から登らせる(演出の中で使うとき)。 */
  animateOnMount?: boolean;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
}) {
  const n = useCountUp(value, { durationMs, delayMs, animateOnMount });
  const text = group
    ? n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : n.toFixed(digits);
  return (
    <span
      className={className}
      style={{ fontVariantNumeric: 'tabular-nums', ...style }}
      /* 補間中の中間値を読み上げない — 着地値だけを1回伝える */
      aria-label={
        group
          ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
          : value.toFixed(digits)
      }
    >
      {text}
    </span>
  );
}
