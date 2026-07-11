import { AssignmentList, type Assignment } from '@/components/AssignmentList';
import { CancelSessionButton } from '@/components/PurchasePanel';
import s from '../app/purchase.module.css';

/* ============================================================================
 * 購入予約の一覧+割当履歴(Decision 085で再編)。
 * 予約の作成は /market の ReservePanel が担い、本コンポーネントは
 * 「あなたの予約」(キャンセル導線つき)と割当履歴の表示に専念する。
 * 純粋な表示コンポーネント。データ取得層 page.tsx は依頼側で結線。
 * 表示数値は各 API の値のみ(架空値なし)。
 * ========================================================================== */

export interface Session {
  id: string; status: string; locked_amount: string;
  assigned_price: string | null; refund_amount: string | null; created_at: string;
}

function money(v: string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
}
function sessionMeta(status: string): { cls: string; label: string; pending: boolean } {
  switch (status) {
    case 'PENDING_ASSIGNMENT': return { cls: s.stPending!, label: '割当待ち', pending: true };
    case 'ASSIGNED': return { cls: s.stAssigned!, label: '割当済', pending: false };
    case 'COMPLETED': return { cls: s.stAssigned!, label: '完了', pending: false };
    case 'REFUNDED': return { cls: s.stMuted!, label: '返金済', pending: false };
    case 'EXPIRED': return { cls: s.stMuted!, label: '返金済(未割当)', pending: false };
    case 'CANCELLED': return { cls: s.stMuted!, label: 'キャンセル', pending: false };
    default: return { cls: s.stMuted!, label: status, pending: false };
  }
}

export function PurchaseView({ sessions, assignments }: { sessions: Session[]; assignments: Assignment[] }) {
  return (
    <div className={s.wrap} id="sessions">
      {/* 予約一覧 */}
      <div>
        <div className={s.secHead}>
          <span className={s.secLabel}>あなたの予約 · RESERVATIONS</span>
          <span className={s.secCount}>{sessions.length}</span>
        </div>
        {sessions.length > 0 ? (
          <div className={s.sessions}>
            {sessions.map((ss) => {
              const m = sessionMeta(ss.status);
              return (
                <div key={ss.id} className={`${s.sCard} ${m.pending ? s.sPending : ''}`}>
                  <div className={s.sTop}>
                    <span className={`${s.badge} ${m.cls}`}>{m.label}</span>
                    <span className={s.sCreated}>{ss.created_at.slice(0, 19)}</span>
                    {m.pending ? <span className={s.sCancel}><CancelSessionButton sessionId={ss.id} /></span> : null}
                  </div>
                  <div className={s.sVals}>
                    <div><div className={s.sK}>ロック額</div><div className={`${s.sV} ${s.sVlock}`}>{money(ss.locked_amount)}<small>USDT</small></div></div>
                    <div><div className={s.sK}>割当価格</div><div className={`${s.sV} ${s.sVassign}`}>{money(ss.assigned_price)}</div></div>
                    <div><div className={s.sK}>返金</div><div className={`${s.sV} ${s.sVrefund}`}>{money(ss.refund_amount)}</div></div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={s.empty}>予約はまだありません。上の「購入予約」から馬を迎えましょう。</div>
        )}
      </div>

      {/* 割当履歴 */}
      <div>
        <div className={s.secHead}>
          <span className={s.secLabel}>割当履歴 · ASSIGNMENTS</span>
          <span className={s.secCount}>{assignments.length}</span>
        </div>
        <AssignmentList assignments={assignments} />
      </div>
    </div>
  );
}
