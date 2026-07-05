import { serverApi } from '@/lib/server-api';
import { AdminBatchesView, type Batch } from '@/components/AdminBatchesView';

export default async function AdminBatchesPage() {
  const result = await serverApi<{ batches: Batch[] }>('/api/v1/admin/batches');
  if (result.status !== 200) return <p className="error">バッチ一覧を取得できません。</p>;
  return <AdminBatchesView batches={result.body.batches} />;
}
