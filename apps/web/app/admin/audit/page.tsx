import { serverApi } from '@/lib/server-api';

interface AuditRow {
  actor_type: string;
  actor_id: string | null;
  action: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export default async function AdminAuditPage() {
  const result = await serverApi<{ audit: AuditRow[] }>('/api/v1/admin/audit');
  if (result.status !== 200) return <p className="error">監査ログを取得できません。</p>;
  const rows = result.body.audit;

  return (
    <>
      <h1>監査ログ</h1>
      <div className="panel">
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>アクター</th>
                <th>アクション</th>
                <th>対象</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  <td className="muted">{row.created_at.slice(0, 19)}</td>
                  <td>
                    <span className="badge">{row.actor_type}</span>
                  </td>
                  <td>{row.action}</td>
                  <td className="muted">
                    {row.reference_type ? `${row.reference_type}:${row.reference_id ?? ''}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">監査ログはまだありません。</p>
        )}
      </div>
    </>
  );
}
