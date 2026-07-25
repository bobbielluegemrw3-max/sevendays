import Link from 'next/link';
import { WithdrawalReviewActions } from '@/components/WithdrawalReviewActions';
import { localDateTime, localDateTimeSec } from '@/lib/format-time';
import s from '../app/admin.module.css';

/* /admin/withdrawals — Ops Consoleリデザイン + H-1(ADMIN_IMPROVEMENT_BRIEF)。
 * 大口出金レビュー(2名承認)。H-1: "盲目"審査の解消 — フラグ理由・ユーザー文脈
 * (識別/残高/過去出金/宛先クーリング)・dossierリンク・承認者identity を出す。純表示。 */

export interface ReviewApproval { admin_user_id: string; role: string; email?: string | null }
export interface ReviewWithdrawal {
  id: string; user_id: string; chain_id: string; to_address: string;
  requested_amount: string; status: string; requested_at: string;
  user_email?: string | null;
  user_available?: string | null;
  user_withdrawals?: number | null;
  address_withdrawable_at?: string | null;
  flag_action?: string | null;
  approvals: ReviewApproval[] | string;
}

function parseApprovals(value: ReviewWithdrawal['approvals']): ReviewApproval[] {
  try {
    return typeof value === 'string' ? (JSON.parse(value) as ReviewApproval[]) : value;
  } catch {
    return [];
  }
}
function money(v: string | null | undefined): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v);
}

/** H-1: なぜ審査対象か(フラグ理由)。suspicious フラグ→理由、無ければ大口(>1000)。 */
function flagReason(w: ReviewWithdrawal): { label: string; tone: string } {
  if (w.flag_action) {
    const r = w.flag_action.split(':')[1] ?? '';
    if (r === 'BURST') return { label: '⚡ 連発(60分3件+)', tone: s.stBad ?? '' };
    if (r === 'FRESH_ADDRESS') return { label: '🆕 解禁直後の宛先', tone: s.stBad ?? '' };
    return { label: `⚑ ${r}`, tone: s.stBad ?? '' };
  }
  if (Number(w.requested_amount) > 1000) return { label: '大口(1,000超)', tone: s.stWarn ?? '' };
  return { label: '—', tone: s.stNeutral ?? '' };
}

/** H-1: 宛先アドレスのクーリング状態(FRESHの手掛かり)。 */
function addrNote(w: ReviewWithdrawal): string {
  if (!w.address_withdrawable_at) return '宛先: 白リスト外?';
  const t = new Date(w.address_withdrawable_at).getTime();
  const diffH = (Date.now() - t) / 3_600_000;
  if (diffH < 0) return `宛先: クーリング中(あと約${Math.ceil(-diffH)}h)`;
  if (diffH < 48) return `宛先: 解禁 約${Math.floor(diffH)}h前`;
  return `宛先: 解禁済(${Math.floor(diffH / 24)}日+前)`;
}

function Approvals({ w }: { w: ReviewWithdrawal }) {
  const approvals = parseApprovals(w.approvals);
  return approvals.length > 0 ? (
    <span className={s.badges}>
      {approvals.map((a) => (
        <span key={a.role} className={`${s.st} ${s.stGood}`} title={a.email ?? a.admin_user_id}>
          {a.role} ✓{a.email ? ` ${a.email}` : ''}
        </span>
      ))}
    </span>
  ) : (
    <span className={`${s.st} ${s.stNeutral}`}>未承認</span>
  );
}

/** H-1: 判断材料(識別/残高/過去出金/宛先クーリング) + dossierリンク。 */
function UserContext({ w }: { w: ReviewWithdrawal }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11 }}>
      <Link href={`/admin/users/${w.user_id}`} style={{ color: 'var(--c-cyan, #00eaff)' }}>
        {w.user_email ?? w.user_id.slice(0, 8)} ↗
      </Link>
      <span style={{ color: 'var(--muted, #8f8ac2)' }}>
        残高 {money(w.user_available)} USDT ／ 過去出金 {w.user_withdrawals ?? 0} 件
      </span>
      <span style={{ color: 'var(--muted, #8f8ac2)' }}>{addrNote(w)}</span>
    </div>
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
                  <th>申請時刻</th><th className={s.tRight}>金額</th><th>理由</th><th>利用者・宛先</th>
                  <th>承認</th><th className={s.tRight}>操作</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => {
                  const flag = flagReason(w);
                  return (
                    <tr key={w.id}>
                      <td className={s.date}>{localDateTimeSec(w.requested_at)}</td>
                      <td className={s.num}>{money(w.requested_amount)}<span className={s.u}>USDT</span></td>
                      <td><span className={`${s.st} ${flag.tone}`}>{flag.label}</span></td>
                      <td>
                        <UserContext w={w} />
                        <div className={`${s.mono} ${s.ell}`} style={{ marginTop: 4, maxWidth: 220 }}>{w.to_address}</div>
                      </td>
                      <td><Approvals w={w} /></td>
                      <td className={s.tRight}><WithdrawalReviewActions withdrawalId={w.id} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {withdrawals.map((w) => {
              const flag = flagReason(w);
              return (
                <div key={w.id} className={s.mc}>
                  <div className={s.mcTop}>
                    <span className={s.mcName}>{money(w.requested_amount)} USDT</span>
                    <span className={`${s.st} ${flag.tone}`}>{flag.label}</span>
                  </div>
                  <div className={s.mcCell}><span className={s.k}>{localDateTime(w.requested_at)}</span><span className={s.v}>{w.to_address.slice(0, 10)}…{w.to_address.slice(-6)}</span></div>
                  <div style={{ padding: '6px 0' }}><UserContext w={w} /></div>
                  <Approvals w={w} />
                  <WithdrawalReviewActions withdrawalId={w.id} />
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className={s.empty}>レビュー待ちの出金はありません。</div>
      )}
      <div className={s.note}>
        1,000 USDT以上の出金は FINANCE_ADMIN と SUPER_ADMIN の<b>別人2名</b>の承認で送金列に戻ります。申請者本人による承認はできません（自己申請ガード）。
      </div>
    </div>
  );
}
