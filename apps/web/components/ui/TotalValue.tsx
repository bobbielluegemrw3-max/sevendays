import { tvMedalStyle, tvNumStyle, tvTier } from '@/lib/tv-tier';

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
  /** sm = 一覧の行 / md = カード / lg = 見出し級 / xl = カードの主役。 */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string | undefined;
}) {
  const px = size === 'xl' ? 30 : size === 'lg' ? 22 : size === 'sm' ? 15 : 17;
  // 上位帯はメダル(強グロー+ドロップシャドウ)で「宝物」に。絵が派手なので、
  // 強さの signal は絵と別に太く出す(STABLE_CARDS_REDESIGN §2-B)
  const tier = tvTier(value).key;
  const numStyle = size === 'xl' && (tier === 'GOLD' || tier === 'SILVER')
    ? tvMedalStyle(value)
    : tvNumStyle(value);
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
      <b style={{ ...numStyle, fontSize: px, fontWeight: size === 'xl' ? 900 : 800 }}>{value.toFixed(1)}</b>
    </span>
  );
}
