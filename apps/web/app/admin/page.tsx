import { serverApi } from '@/lib/server-api';
import { AdminDashboardView, type AdminDashboard } from '@/components/AdminDashboardView';

export default async function AdminDashboardPage() {
  const result = await serverApi<AdminDashboard>('/api/v1/admin/dashboard');
  if (result.status !== 200) return <p className="error">ダッシュボードを取得できません。</p>;
  return <AdminDashboardView data={result.body} />;
}
