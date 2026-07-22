import { tvNumStyle } from '@/lib/tv-tier';

/* ============================================================================
 * TotalValue — 総合値の表示(2026-07-22)。
 *
 * それまで各画面が **レアリティ用のバッジ枠を流用**していた(`.rar` / `.tvChip` /
 * `.shelfTv`)。枠+影+背景グラデの箱に数字が入るため、一覧で数字を見比べる
 * ときに箱が邪魔をし、しかも画面ごとに姿が違っていた
 * (Tier 2 で直した「同じ情報が画面ごとに姿を変える」の生き残り)。
 *
 * 総合値は**比べるための数字**なので、箱をやめて数字とティア色だけにする。
 * 等級(金/銀/銅/鋼/鉄)は色が担い、情報は失われない。
 * ========================================================================== */

export function TotalValue({
  value,
  label,
  size = 'md',
  className,
}: {
  value: number;
  /** 「総合値」等のラベル。省略時は TV。 */
  label?: string | undefined;
  /** sm = 一覧の行 / md = カード / lg = 見出し級。 */
  size?: 'sm' | 'md' | 'lg';
  className?: string | undefined;
}) {
  const px = size === 'lg' ? 22 : size === 'sm' ? 15 : 17;
  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, whiteSpace: 'nowrap' }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          letterSpacing: '0.14em',
          color: 'var(--faint)',
        }}
      >
        {label ?? 'TV'}
      </span>
      <b style={{ ...tvNumStyle(value), fontSize: px, fontWeight: 800 }}>{value.toFixed(1)}</b>
    </span>
  );
}
