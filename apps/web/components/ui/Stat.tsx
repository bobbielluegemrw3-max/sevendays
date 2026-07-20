'use client';

import type { ReactNode } from 'react';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import s from './stat.module.css';

/* ============================================================================
 * Stat — ラベル + 数値(+単位 +差分)の統計表示(2026-07-21・UI基盤 1-1)
 *
 * 監査で「統計表示が8つの独立実装」「サイズが 16/17/15/9/38px と乱立」と
 * 指摘された部分を1部品に集約する。数値は AnimatedNumber なので、値が変わると
 * 登る。差分(+7)を併記でき、増減で色フラッシュする。
 *
 * サイズは sm / md / lg の3段階のみ(乱立の再発防止)。色は globals.css の
 * トークン(--text/--good/--magenta-soft…)を参照。
 *
 * サーバーコンポーネントからも数値だけ渡せば動く(値の計算はサーバー側)。
 * ========================================================================== */

export function Stat({
  label,
  value,
  unit,
  digits = 0,
  group = false,
  delta,
  size = 'md',
  tone = 'default',
  durationMs = 600,
  className,
}: {
  label: ReactNode;
  value: number;
  /** 単位(USDT / 頭 など)。小さく後置。 */
  unit?: ReactNode;
  digits?: number;
  group?: boolean;
  /** 差分(+7 / −3)。0 や undefined なら出さない。増減で色が変わる。 */
  delta?: number | undefined;
  size?: 'sm' | 'md' | 'lg';
  /** 数値の色。good=緑 / warn=金 / bad=マゼンタ / cyan。 */
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'cyan';
  durationMs?: number;
  className?: string | undefined;
}) {
  const sizeClass = size === 'sm' ? s.sm : size === 'lg' ? s.lg : s.md;
  const toneClass =
    tone === 'good' ? s.toneGood
    : tone === 'warn' ? s.toneWarn
    : tone === 'bad' ? s.toneBad
    : tone === 'cyan' ? s.toneCyan
    : '';
  const showDelta = delta !== undefined && delta !== 0 ? delta : null;
  return (
    <div className={`${s.stat} ${sizeClass} ${className ?? ''}`}>
      <div className={s.label}>{label}</div>
      <div className={`${s.value} ${toneClass}`}>
        <AnimatedNumber value={value} digits={digits} group={group} durationMs={durationMs} />
        {unit ? <span className={s.unit}>{unit}</span> : null}
        {showDelta !== null ? (
          <span className={`${s.delta} ${showDelta < 0 ? s.deltaDown : s.deltaUp}`}>
            {showDelta >= 0 ? '+' : ''}
            <AnimatedNumber value={showDelta} digits={digits} durationMs={durationMs} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
