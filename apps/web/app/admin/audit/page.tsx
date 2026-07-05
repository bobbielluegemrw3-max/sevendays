import { serverApi } from '@/lib/server-api';
import { AdminAuditLog, type AuditRow } from '@/components/AdminAuditLog';

export default async function AdminAuditPage() {
  const result = await serverApi<{ audit: AuditRow[] }>('/api/v1/admin/audit');
  if (result.status !== 200) return <p className="error">監査ログを取得できません。</p>;
  return <AdminAuditLog audit={result.body.audit} />;
}
