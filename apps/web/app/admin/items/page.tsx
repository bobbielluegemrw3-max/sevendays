import { serverApi } from '@/lib/server-api';
import { AdminItemsView, type AdminItems } from '@/components/AdminItemsView';

export default async function AdminItemsPage() {
  const result = await serverApi<AdminItems>('/api/v1/admin/items/overview');
  if (result.status !== 200) return <p className="error">アイテムデータを取得できません。</p>;
  return <AdminItemsView data={result.body} />;
}
