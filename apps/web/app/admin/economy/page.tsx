import { serverApi } from '@/lib/server-api';
import { AdminEconomyView, type AdminEconomy } from '@/components/AdminEconomyView';

export default async function AdminEconomyPage() {
  const result = await serverApi<AdminEconomy>('/api/v1/admin/economy/overview');
  if (result.status !== 200) return <p className="error">経済データを取得できません。</p>;
  return <AdminEconomyView data={result.body} />;
}
