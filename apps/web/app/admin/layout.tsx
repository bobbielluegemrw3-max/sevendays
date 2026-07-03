import Link from 'next/link';
import { serverApi } from '@/lib/server-api';

/**
 * Admin area shell. The permission boundary itself is enforced by the API
 * layer (JWT + role validation on every request) — this layout only probes
 * it once to avoid rendering a useless shell for non-admins.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const probe = await serverApi('/api/v1/admin/dashboard');
  if (probe.status === 401 || probe.status === 403) {
    return (
      <>
        <h1>管理画面</h1>
        <p className="error">管理者権限がありません。</p>
      </>
    );
  }
  return (
    <>
      <nav className="topnav" style={{ borderRadius: 8, marginBottom: '1rem' }}>
        <span className="brand">Admin</span>
        <Link href="/admin">ダッシュボード</Link>
        <Link href="/admin/batches">バッチ</Link>
        <Link href="/admin/withdrawals">出金レビュー</Link>
        <Link href="/admin/audit">監査ログ</Link>
      </nav>
      {children}
    </>
  );
}
