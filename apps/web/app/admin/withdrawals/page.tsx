import { serverApi } from '@/lib/server-api';
import { AdminWithdrawalsView, type ReviewWithdrawal } from '@/components/AdminWithdrawalsView';

export default async function AdminWithdrawalsPage() {
  const result = await serverApi<{ withdrawals: ReviewWithdrawal[] }>('/api/v1/admin/withdrawals');
  if (result.status !== 200) return <p className="error">出金レビュー一覧を取得できません。</p>;
  return <AdminWithdrawalsView withdrawals={result.body.withdrawals} />;
}
