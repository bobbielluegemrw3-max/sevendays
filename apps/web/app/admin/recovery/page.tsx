import { serverApi } from '@/lib/server-api';
import { AdminRecoveryView, type Recovery } from '@/components/AdminRecoveryView';

export default async function AdminRecoveryPage() {
  const result = await serverApi<{ recoveries: Recovery[] }>('/api/v1/admin/recovery');
  if (result.status !== 200) return <p className="error">リカバリ一覧を取得できません。</p>;
  return <AdminRecoveryView recoveries={result.body.recoveries} />;
}
