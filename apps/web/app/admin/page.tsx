import { serverApi } from '@/lib/server-api';

interface AdminDashboard {
  latest_batch: { id: string; batch_date: string; status: string } | null;
  economy_status: string;
  metrics: Record<string, unknown> | null;
}

export default async function AdminDashboardPage() {
  const result = await serverApi<AdminDashboard>('/api/v1/admin/dashboard');
  if (result.status !== 200) return <p className="error">ダッシュボードを取得できません。</p>;
  const { latest_batch, economy_status, metrics } = result.body;

  return (
    <>
      <h1>管理ダッシュボード</h1>
      <div className="grid">
        <div className="panel stat">
          <div className="label">Economy Status</div>
          <div className="value">{economy_status}</div>
        </div>
        <div className="panel stat">
          <div className="label">最新バッチ</div>
          <div className="value">{latest_batch ? latest_batch.batch_date : 'なし'}</div>
          {latest_batch ? <span className="badge">{latest_batch.status}</span> : null}
        </div>
      </div>

      <h2>経済メトリクス</h2>
      <div className="panel">
        {metrics ? (
          <table>
            <tbody>
              {Object.entries(metrics).map(([key, value]) => (
                <tr key={key}>
                  <th>{key}</th>
                  <td>
                    <code>{typeof value === 'string' ? value : JSON.stringify(value)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">バッチ実行前のためメトリクスはありません。</p>
        )}
      </div>
    </>
  );
}
