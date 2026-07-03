import { serverApi } from '@/lib/server-api';
import { WithdrawalReviewActions } from '@/components/WithdrawalReviewActions';

interface ReviewWithdrawal {
  id: string;
  user_id: string;
  chain_id: string;
  to_address: string;
  requested_amount: string;
  status: string;
  requested_at: string;
  approvals: { admin_user_id: string; role: string }[] | string;
}

function parseApprovals(value: ReviewWithdrawal['approvals']): { admin_user_id: string; role: string }[] {
  return typeof value === 'string'
    ? (JSON.parse(value) as { admin_user_id: string; role: string }[])
    : value;
}

export default async function AdminWithdrawalsPage() {
  const result = await serverApi<{ withdrawals: ReviewWithdrawal[] }>('/api/v1/admin/withdrawals');
  if (result.status !== 200) return <p className="error">出金レビュー一覧を取得できません。</p>;

  return (
    <>
      <h1>大口出金レビュー(Decision 060)</h1>
      <p className="muted">
        1,000 USDT以上の出金は FINANCE_ADMIN と SUPER_ADMIN の<b>別人2名</b>の承認で送金列に戻ります。
      </p>
      <div className="panel">
        {result.body.withdrawals.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>申請日時</th>
                <th>金額</th>
                <th>送金先</th>
                <th>承認状況</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {result.body.withdrawals.map((w) => {
                const approvals = parseApprovals(w.approvals);
                return (
                  <tr key={w.id}>
                    <td className="muted">{w.requested_at.slice(0, 19)}</td>
                    <td>{w.requested_amount} USDT</td>
                    <td>
                      <code>{w.to_address}</code>
                    </td>
                    <td>
                      {approvals.length > 0
                        ? approvals.map((a) => (
                            <span key={a.role} className="badge">
                              {a.role} ✓
                            </span>
                          ))
                        : '未承認'}
                    </td>
                    <td>
                      <WithdrawalReviewActions withdrawalId={w.id} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="muted">レビュー待ちの出金はありません。</p>
        )}
      </div>
    </>
  );
}
