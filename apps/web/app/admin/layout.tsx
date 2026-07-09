import Link from 'next/link';
import { serverApi } from '@/lib/server-api';
import s from '../admin.module.css';

/* ============================================================================
 * Admin エリアのシェル(再設計)。権限境界は API 層(JWT + role)で強制。
 * このレイアウトは一度だけ probe し、非管理者に無駄なシェルを描画しない。
 * ナビを 1c 部品言語 + ADMINアクセントに刷新。
 * ========================================================================== */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const probe = await serverApi('/api/v1/admin/dashboard');
  if (probe.status === 401 || probe.status === 403) {
    return (
      <>
        <h1>管理画面</h1>
        <p className={s.denied}>管理者権限がありません。</p>
      </>
    );
  }
  return (
    <>
      <nav className={s.nav}>
        <span className={s.brand}><span className={s.brandDot} />ADMIN</span>
        <Link href="/admin" className={s.navLink}>ダッシュボード</Link>
        <Link href="/admin/economy" className={s.navLink}>経済</Link>
        <Link href="/admin/users" className={s.navLink}>ユーザー</Link>
        <Link href="/admin/items" className={s.navLink}>アイテム</Link>
        <Link href="/admin/races" className={s.navLink}>レース</Link>
        <Link href="/admin/support" className={s.navLink}>サポート</Link>
        <Link href="/admin/batches" className={s.navLink}>バッチ</Link>
        <Link href="/admin/withdrawals" className={s.navLink}>出金レビュー</Link>
        <Link href="/admin/recovery" className={s.navLink}>リカバリ</Link>
        <Link href="/admin/audit" className={s.navLink}>監査ログ</Link>
      </nav>
      {children}
    </>
  );
}
