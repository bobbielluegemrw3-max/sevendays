import { RecoveryActions } from '@/components/RecoveryActions';
import { RecoverBatchButton } from '@/components/RecoverBatchButton';
import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/recovery — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * FAILEDバッチのリカバリ手続き。純表示。
 * ①復旧起動が必要なバッチ(単独リカバリ・DEBUG/TESTNET) ②既存リカバリ手続き。 */

export interface Recovery {
  id: string; batch_date: string; batch_status: string; recovery_reason: string;
  approval_status: string; approved_by_1: string | null; approved_by_2: string | null;
  created_at: string; completed_at: string | null;
}

export interface FailedBatch {
  id: string; batch_date: string; status: string; completed_steps: number | string;
}

const ST: Record<string, string> = { good: s.stGood!, warn: s.stWarn!, bad: s.stBad!, cyan: s.stNeutral!, muted: s.stNeutral! };

function ApprovalBadges({ r }: { r: Recovery }) {
  if (!r.approved_by_1 && !r.approved_by_2) return <span className={`${s.st} ${s.stNeutral}`}>未承認</span>;
  return (
    <span className={s.badges}>
      {r.approved_by_1 ? <span className={`${s.st} ${s.stGood}`}>1人目 ✓</span> : null}
      {r.approved_by_2 ? <span className={`${s.st} ${s.stGood}`}>2人目 ✓</span> : null}
    </span>
  );
}

export function AdminRecoveryView({
  recoveries,
  failedBatches = [],
}: {
  recoveries: Recovery[];
  failedBatches?: FailedBatch[];
}) {
  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>リカバリ手続き</h1>
        </div>
      </div>

      {failedBatches.length > 0 ? (
        <div className={`${s.tableWrap} ${s.desktopTable}`} style={{ marginBottom: '1rem' }}>
          <table className={s.tbl}>
            <thead>
              <tr>
                <th>復旧が必要なバッチ</th><th>状態</th><th>完了ステップ</th><th className={s.tRight}>操作</th>
              </tr>
            </thead>
            <tbody>
              {failedBatches.map((b) => (
                <tr key={b.id}>
                  <td className={s.date}>{b.batch_date}</td>
                  <td><span className={`${s.st} ${ST[statusKind(b.status)]}`}>{b.status}</span></td>
                  <td>{b.completed_steps} / 37</td>
                  <td className={s.tRight}><RecoverBatchButton batchId={b.id} batchDate={b.batch_date} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {recoveries.length > 0 ? (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>batch date</th><th>バッチ状態</th><th>理由</th>
                  <th>承認</th><th>全体状態</th><th className={s.tRight}>操作</th>
                </tr>
              </thead>
              <tbody>
                {recoveries.map((r) => {
                  const overall = r.completed_at ? 'COMPLETED' : r.approval_status;
                  return (
                    <tr key={r.id}>
                      <td className={s.date}>{r.batch_date}</td>
                      <td><span className={`${s.st} ${ST[statusKind(r.batch_status)]}`}>{r.batch_status}</span></td>
                      <td>{r.recovery_reason}</td>
                      <td><ApprovalBadges r={r} /></td>
                      <td><span className={`${s.st} ${ST[statusKind(overall)]}`}>{overall}</span></td>
                      <td className={s.tRight}>
                        {r.completed_at === null
                          ? <RecoveryActions recoveryId={r.id} approved={r.approval_status === 'APPROVED'} />
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {recoveries.map((r) => {
              const overall = r.completed_at ? 'COMPLETED' : r.approval_status;
              return (
                <div key={r.id} className={s.mc}>
                  <div className={s.mcTop}>
                    <span className={s.mcName}>{r.batch_date}</span>
                    <span className={`${s.st} ${ST[statusKind(overall)]}`}>{overall}</span>
                  </div>
                  <div className={s.mcCell}><span className={s.k}>理由</span><span className={s.v}>{r.recovery_reason}</span></div>
                  <div className={s.mcTop}><ApprovalBadges r={r} /></div>
                  {r.completed_at === null
                    ? <RecoveryActions recoveryId={r.id} approved={r.approval_status === 'APPROVED'} />
                    : null}
                </div>
              );
            })}
          </div>
        </>
      ) : failedBatches.length === 0 ? (
        <div className={s.empty}>リカバリ対象はありません。</div>
      ) : null}
      <div className={s.note}>
        現在デバッグ運用中のため、FINANCE_ADMIN + SUPER_ADMIN を併せ持つ管理者1名で
        「単独リカバリ実行」できます(二人目の承認は不要)。失敗ステップから再実行され、
        posted Ledger・シード・スナップショットは変更されません。
        <b>メインネット前に二重承認へ戻します。</b>
      </div>
    </div>
  );
}
