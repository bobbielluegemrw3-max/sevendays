import { AssignmentList, type Assignment } from '@/components/AssignmentList';
import { CancelSessionButton } from '@/components/PurchasePanel';
import { localDateTime } from '@/lib/format-time';
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
  /** V2(Decision 103): 'SINGLE' | 'POOL'。旧レスポンス互換のためoptional。 */
  session_mode?: string;
  /** このセッションで入手した頭数(プールは複数)。 */
  horse_count?: number;
}

function money(v: string | null): string {
  if (v == null) return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v;
}
function sessionMeta(status: string): { cls: string; label: string; pending: boolean } {
  switch (status) {
    case 'PENDING_ASSIGNMENT': return { cls: s.stPending!, label: '割当待ち', pending: true };
    case 'ASSIGNED': return { cls: s.stAssigned!, label: '馬を入手', pending: false };
    case 'COMPLETED': return { cls: s.stAssigned!, label: '馬を入手', pending: false };
    case 'REFUNDED': return { cls: s.stMuted!, label: '全額返金', pending: false };
    case 'EXPIRED': return { cls: s.stMuted!, label: '全額返金(供給なし)', pending: false };
    case 'CANCELLED': return { cls: s.stMuted!, label: 'キャンセル', pending: false };
    default: return { cls: s.stMuted!, label: status, pending: false };
  }
}
/** 予約1件で「実際に何が起きたか」の1文。 */
function sessionStory(ss: Session): string {
  const isPool = ss.session_mode === 'POOL';
  switch (ss.status) {
    case 'PENDING_ASSIGNMENT':
      return isPool
        ? `予算 ${money(ss.locked_amount)} USDT をロック中。次のレースで出品馬→新規発行の順に予算いっぱい割り当てられます(締切前なら金額変更・キャンセル可)。`
        : `最大 ${money(ss.locked_amount)} USDT をロック中。今夜20:00のマッチングで馬が割り当てられます(20:00前ならキャンセルで全額返金)。`;
    case 'ASSIGNED':
    case 'COMPLETED': {
      const paid = money(ss.assigned_price);
      const refund = Number(ss.refund_amount) > 0 ? `、差額 ${money(ss.refund_amount)} USDT を返金` : '';
      if (isPool) {
        const n = ss.horse_count ?? 0;
        return `YOUR NEW STABLE — ${money(ss.locked_amount)} USDT が ${n} 頭になりました(${paid} USDT 使用${refund})。`;
      }
      return `${paid} USDT の馬を入手しました${refund}。`;
    }
    case 'REFUNDED':
    case 'EXPIRED':
      return `割り当てがなかったため、ロックした ${money(ss.locked_amount)} USDT は全額返金されました。`;
    case 'CANCELLED':
      return `キャンセルしました。ロックした ${money(ss.locked_amount)} USDT は全額返金済みです。`;
    default:
      return '';
  }
}

export function PurchaseView({ sessions, assignments }: { sessions: Session[]; assignments: Assignment[] }) {
  return (
    <div className={s.wrap} id="sessions">
      {/* 予約一覧 */}
      <div>
        <div className={s.secHead}>
          <span className={s.secLabel}>あなたの購入予約</span>
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
                    <span className={s.sCreated}>{localDateTime(ss.created_at)}</span>
                    {m.pending ? <span className={s.sCancel}><CancelSessionButton sessionId={ss.id} /></span> : null}
                  </div>
                  <div className={s.sStory}>{sessionStory(ss)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={s.empty}>予約はまだありません。上の「購入予約」から馬を迎えましょう。</div>
        )}
      </div>

      {/* 入手・売却した馬 */}
      <div>
        <div className={s.secHead}>
          <span className={s.secLabel}>入手・売却した馬</span>
          <span className={s.secCount}>{assignments.length}</span>
        </div>
        <AssignmentList assignments={assignments} />
      </div>
    </div>
  );
}
