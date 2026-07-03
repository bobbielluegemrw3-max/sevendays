import { serverApi } from '@/lib/server-api';
import { RecoveryActions } from '@/components/RecoveryActions';

interface Recovery {
  id: string;
  batch_date: string;
  batch_status: string;
  recovery_reason: string;
  approval_status: string;
  approved_by_1: string | null;
  approved_by_2: string | null;
  created_at: string;
  completed_at: string | null;
}

export default async function AdminRecoveryPage() {
  const result = await serverApi<{ recoveries: Recovery[] }>('/api/v1/admin/recovery');
  if (result.status !== 200) return <p className="error">リカバリ一覧を取得できません。</p>;

  return (
    <>
      <h1>リカバリ手続き(二重承認)</h1>
      <p className="muted">
        FAILEDバッチの復旧はFINANCE_ADMIN+SUPER_ADMINを合わせた<b>別人2名</b>の承認後にのみ実行できます。
        posted Ledger・シード・スナップショットは変更されません。
      </p>
      <div className="panel">
        {result.body.recoveries.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>バッチ日</th>
                <th>理由</th>
                <th>承認</th>
                <th>状態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {result.body.recoveries.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.batch_date} <span className="badge">{r.batch_status}</span>
                  </td>
                  <td>{r.recovery_reason}</td>
                  <td>
                    {r.approved_by_1 ? <span className="badge">1人目 ✓</span> : null}
                    {r.approved_by_2 ? <span className="badge">2人目 ✓</span> : null}
                    {!r.approved_by_1 && !r.approved_by_2 ? '未承認' : null}
                  </td>
                  <td>
                    <span className="badge">{r.completed_at ? 'COMPLETED' : r.approval_status}</span>
                  </td>
                  <td>
                    {r.completed_at === null ? (
                      <RecoveryActions
                        recoveryId={r.id}
                        approved={r.approval_status === 'APPROVED'}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">リカバリ対象はありません。</p>
        )}
      </div>
    </>
  );
}
