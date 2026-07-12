import styles from './page-skeleton.module.css';

/**
 * Instant loading state for route transitions (app/<route>/loading.tsx).
 * 遷移速度(2026-07-12): loading.tsxが無いとクリック後もサーバー応答まで前の
 * ページのまま固まって見える。骨格を即描画してクリックの手応えを作る。
 * 上部はナビと同じブランドロックアップを淡く脈動させ(オーナー指定 2026-07-12)、
 * パネルはデザイントークン準拠の無地シマーのみ — ページ固有のレイアウトは
 * 模倣しない(ズレると逆に安っぽく見えるため)。
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.wrap} role="status" aria-label="読み込み中">
      <div className={styles.brand} aria-hidden="true">
        <span className={styles.brandBar} />
        <span className={styles.brandLock}>
          <span className={styles.brandL1}>SEVEN&nbsp;DAYS</span>
          <span className={styles.brandL2}>DERBY</span>
        </span>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.panel} />
      ))}
    </div>
  );
}
