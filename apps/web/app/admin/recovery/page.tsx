import { serverApi } from '@/lib/server-api';
import { AdminRecoveryView, type Recovery, type FailedBatch } from '@/components/AdminRecoveryView';

export default async function AdminRecoveryPage() {
  const [recoveries, batches] = await Promise.all([
    serverApi<{ recoveries: Recovery[] }>('/api/v1/admin/recovery'),
    serverApi<{ batches: FailedBatch[] }>('/api/v1/admin/batches'),
  ]);
  if (recoveries.status !== 200) return <p className="error">リカバリ一覧を取得できません。</p>;
  // 未完のリカバリが無い FAILED/PARTIAL_FAILED バッチ = 復旧起動が必要
  const openBatchIds = new Set(
    recoveries.body.recoveries.filter((r) => r.completed_at === null).map((r) => r.batch_date),
  );
  const failed = (batches.status === 200 ? batches.body.batches : [])
    .filter((b) => ['FAILED', 'PARTIAL_FAILED'].includes(b.status.toUpperCase()))
    .filter((b) => !openBatchIds.has(b.batch_date));
  return <AdminRecoveryView recoveries={recoveries.body.recoveries} failedBatches={failed} />;
}
