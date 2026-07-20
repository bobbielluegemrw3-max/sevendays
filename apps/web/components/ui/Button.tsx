'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

/* ============================================================================
 * Button — 共有ボタン(2026-07-21・UI_FOUNDATION_PLAN 1-2)
 *
 * 監査: 素の <button> が48ファイル169箇所、ボタンCSSクラス62個。btnRolling
 * (送信中シマー)は良い設計なのに5箇所しか配線されていない。disabled= は
 * 66箇所あるのに、無効な理由を説明するのは1箇所だけ。
 *
 * この部品が引き受けるもの:
 *  - variant で階層を1語で指定(primary / secondary / ghost / danger)。
 *    globals.css の button / .primary / .secondary をそのまま使う(新CSSなし)
 *  - busy のとき btnRolling シマーを自動適用し、busyLabel があれば文言を差し替える
 *  - disabled のとき、disabledReason があればそれをラベルに出す
 *    (「使うには先に調教を確定」を全体方針に昇格。4a6ebcb の good practice)
 *
 * 既存の module-classed ボタン(.reserveCta 等)は無理に置換しない — className を
 * 渡せば従来スタイルのまま busy/disabledReason だけ借りられる。
 * ========================================================================== */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  /** サーバー往復などの処理中。btnRolling シマー + busyLabel。 */
  busy?: boolean;
  /** busy のときの文言(例: 'ロール中…')。未指定なら children のまま。 */
  busyLabel?: ReactNode;
  /** 押せない理由。disabled かつこれがあれば、children の代わりに理由を出す。 */
  disabledReason?: ReactNode;
  /** 追加クラス(module-classed ボタンを流用するとき)。 */
  className?: string | undefined;
  children: ReactNode;
}

export function Button({
  variant = 'secondary',
  busy = false,
  busyLabel,
  disabledReason,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const variantClass = variant === 'primary' ? 'primary' : variant === 'secondary' ? 'secondary' : '';
  // ghost は globals.css の既定(枠線ベース)そのまま。danger は secondary を借りる。
  const classes = [variantClass, busy ? 'btnRolling' : '', className]
    .filter(Boolean)
    .join(' ');

  const label =
    busy && busyLabel !== undefined
      ? busyLabel
      : disabled && disabledReason !== undefined
        ? disabledReason
        : children;

  return (
    <button
      type={type}
      className={classes || undefined}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {label}
    </button>
  );
}
