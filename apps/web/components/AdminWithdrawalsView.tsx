import { WithdrawalReviewActions } from '@/components/WithdrawalReviewActions';
import s from '../app/admin.module.css';

/* /admin/withdrawals — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 大口出金レビュー(2名承認)。金額は右揃え・宛先は等幅。純表示。 */

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

function Approvals({ w }: { w: ReviewWithdrawal }) {
  const approvals = parseApprovals(w.approvals);
  return approvals.length > 0 ? (
    <span className={s.badges}>
      {approvals.map((a) => <span key={a.role} className={`${s.st} ${s.stGood}`}>{a.role} ✓</span>)}
    </span>
  ) : (
    <span className={`${s.st} ${s.stNeutral}`}>未承認</span>
  );
}

export function AdminWithdrawalsView({ withdrawals }: { withdrawals: ReviewWithdrawal[] }) {
  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>大口出金レビュー</h1>
        </div>
      </div>
      {withdrawals.length > 0 ? (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>申請時刻</th><th className={s.tRight}>金額</th><th>宛先アドレス</th>
                  <th>承認</th><th className={s.tRight}>操作</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className={s.date}>{w.requested_at.slice(0, 19).replace('T', ' ')}</td>
                    <td className={s.num}>{money(w.requested_amount)}<span className={s.u}>USDT</span></td>
                    <td className={`${s.mono} ${s.ell}`}>{w.to_address}</td>
                    <td><Approvals w={w} /></td>
                    <td className={s.tRight}><WithdrawalReviewActions withdrawalId={w.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {withdrawals.map((w) => (
              <div key={w.id} className={s.mc}>
                <div className={s.mcTop}>
                  <span className={s.mcName}>{money(w.requested_amount)} USDT</span>
                  <Approvals w={w} />
                </div>
                <div className={s.mcCell}><span className={s.k}>{w.requested_at.slice(0, 16).replace('T', ' ')}</span><span className={s.v}>{w.to_address.slice(0, 10)}…{w.to_address.slice(-6)}</span></div>
                <WithdrawalReviewActions withdrawalId={w.id} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={s.empty}>レビュー待ちの出金はありません。</div>
      )}
      <div className={s.note}>
        1,000 USDT以上の出金は FINANCE_ADMIN と SUPER_ADMIN の<b>別人2名</b>の承認で送金列に戻ります。
      </div>
    </div>
  );
}
