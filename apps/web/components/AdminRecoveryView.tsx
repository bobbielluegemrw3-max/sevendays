import { RecoveryActions } from '@/components/RecoveryActions';
import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/recovery 再設計 — FAILEDバッチのリカバリ手続き(二重承認)。純粋な表示コンポーネント。 */

export interface Recovery {
  id: string; batch_date: string; batch_status: string; recovery_reason: string;
  approval_status: string; approved_by_1: string | null; approved_by_2: string | null;
  created_at: string; completed_at: string | null;
}

const PILL: Record<string, string> = { good: s.pillGood!, warn: s.pillWarn!, bad: s.pillBad!, cyan: s.pillCyan!, muted: s.pillMuted! };

export function AdminRecoveryView({ recoveries }: { recoveries: Recovery[] }) {
  return (
    <div className={s.wrap}>
      <div className={s.h1}>リカバリ手続き（二重承認）</div>
      <div className={s.note}>
        FAILEDバッチの復旧は FINANCE_ADMIN + SUPER_ADMIN を合わせた<b>別人2名</b>の承認後にのみ実行できます。
        posted Ledger・シード・スナップショットは変更されません。
      </div>
      {recoveries.length > 0 ? (
        <div className={s.list}>
          {recoveries.map((r) => {
            const overall = r.completed_at ? 'COMPLETED' : r.approval_status;
            return (
              <div key={r.id} className={s.row}>
                <span className={s.cMain}>{r.batch_date}</span>
                <span className={`${s.pill} ${PILL[statusKind(r.batch_status)]}`}>{r.batch_status}</span>
                <span className={`${s.cText} ${s.cSpace}`}>{r.recovery_reason}</span>
                <span className={s.cBadges}>
                  {r.approved_by_1 ? <span className={`${s.pill} ${s.pillRole}`}>1人目 ✓</span> : null}
                  {r.approved_by_2 ? <span className={`${s.pill} ${s.pillRole}`}>2人目 ✓</span> : null}
                  {!r.approved_by_1 && !r.approved_by_2 ? <span className={`${s.pill} ${s.pillMuted}`}>未承認</span> : null}
                </span>
                <span className={`${s.pill} ${PILL[statusKind(overall)]}`}>{overall}</span>
                {r.completed_at === null ? (
                  <span className={s.cActions}><RecoveryActions recoveryId={r.id} approved={r.approval_status === 'APPROVED'} /></span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>リカバリ対象はありません。</div>
      )}
    </div>
  );
}
