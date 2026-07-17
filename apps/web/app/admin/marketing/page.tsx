import { serverApi } from '@/lib/server-api';
import { AdminMarketingView, type AdminMarketing } from '@/components/AdminMarketingView';

export default async function AdminMarketingPage() {
  const result = await serverApi<AdminMarketing>('/api/v1/admin/marketing/overview');
  if (result.status !== 200) return <p className="error">広告費データを取得できません。</p>;
  return <AdminMarketingView data={result.body} />;
}
