import { WithdrawalReviewActions } from '@/components/WithdrawalReviewActions';
import s from '../app/admin.module.css';

/* /admin/withdrawals 再設計 — 大口出金レビュー(2名承認)。純粋な表示コンポーネント。 */

export interface ReviewWithdrawal {
  id: string; user_id: string; chain_id: string; to_address: string;
  requested_amount: string; status: string; requested_at: string;
  approvals: { admin_user_id: string; role: string }[] | string;
}

function parseApprovals(value: ReviewWithdrawal['approvals']): { admin_user_id: string; role: string }[] {
  try {
    return typeof value === 'string' ? (JSON.parse(value) as { admin_user_id: string; role: string }[]) : value;
  } catch {
    return [];
  }
}
function money(v: string): string {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
}

export function AdminWithdrawalsView({ withdrawals }: { withdrawals: ReviewWithdrawal[] }) {
  return (
    <div className={s.wrap}>
      <div className={s.h1}>大口出金レビュー</div>
      <div className={s.note}>
        1,000 USDT以上の出金は FINANCE_ADMIN と SUPER_ADMIN の<b>別人2名</b>の承認で送金列に戻ります。
      </div>
      {withdrawals.length > 0 ? (
        <div className={s.list}>
          {withdrawals.map((w) => {
            const approvals = parseApprovals(w.approvals);
            return (
              <div key={w.id} className={s.row}>
                <span className={s.cDate}>{w.requested_at.slice(0, 19)}</span>
                <span className={s.cAmount}>{money(w.requested_amount)}<small>USDT</small></span>
                <span className={`${s.cMono} ${s.cSpace}`}>{w.to_address}</span>
                <span className={s.cBadges}>
                  {approvals.length > 0
                    ? approvals.map((a) => <span key={a.role} className={`${s.pill} ${s.pillRole}`}>{a.role} ✓</span>)
                    : <span className={`${s.pill} ${s.pillMuted}`}>未承認</span>}
                </span>
                <span className={s.cActions}><WithdrawalReviewActions withdrawalId={w.id} /></span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>レビュー待ちの出金はありません。</div>
      )}
    </div>
  );
}
