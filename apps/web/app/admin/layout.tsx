import { serverApi } from '@/lib/server-api';
import { AdminNav } from '@/components/AdminNav';
import s from '../admin.module.css';

/* ============================================================================
 * Admin エリアのシェル(再設計 v2)。権限境界は API 層(JWT + role)で強制。
 * 一度だけ probe し、非管理者に無駄なシェルを描画しない。
 * ナビはクライアント <AdminNav />(アクティブ強調 + モバイル横スクロール帯)。
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
      <AdminNav />
      {children}
    </>
  );
}
