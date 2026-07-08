import { serverApi } from '@/lib/server-api';
import { AdminRacesView, type AdminRaces } from '@/components/AdminRacesView';

export default async function AdminRacesPage() {
  const result = await serverApi<AdminRaces>('/api/v1/admin/races/overview');
  if (result.status !== 200) return <p className="error">レースデータを取得できません。</p>;
  return <AdminRacesView data={result.body} />;
}
