import { AssignmentList, type Assignment } from '@/components/AssignmentList';
import { CreateSessionButton, CancelSessionButton } from '@/components/PurchasePanel';
import s from '../app/purchase.module.css';

/* ============================================================================
 * /purchase(購入)再設計 — ダッシュボード Option 1c と同じ部品言語。
 * 純粋な表示コンポーネント。仕組み説明 + セッション一覧(既存 Create/Cancel ボタン)
 * + 割当履歴(client の <AssignmentList>)。データ取得層 page.tsx は依頼側で結線。
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
    case 'CANCELLED': return { cls: s.stMuted!, label: 'キャンセル', pending: false };
    default: return { cls: s.stMuted!, label: status, pending: false };
  }
}

export function PurchaseView({ sessions, assignments }: { sessions: Session[]; assignments: Assignment[] }) {
  return (
    <div className={s.wrap}>
      <div className={s.h1}>購入</div>

      {/* 仕組み + CTA */}
      <section className={s.intro}>
        <div className={s.introTop}>
          <div className={s.introTitle}>馬を迎える</div>
          <div className={s.introCta}><CreateSessionButton /></div>
        </div>
        <div className={s.steps}>
          <div className={s.step}>
            <div className={`${s.stepK} ${s.stepKcyan}`}>① ロック</div>
            <div className={s.stepT}><b>177.16</b> USDT を確保（価格テーブル上限）</div>
          </div>
          <div className={s.step}>
            <div className={`${s.stepK} ${s.stepKcyan}`}>② 割当</div>
            <div className={s.stepT}>今夜のバッチで馬が決定。Day0ミントは請求 <b>102</b>（価格100+手数料2）</div>
          </div>
          <div className={s.step}>
            <div className={`${s.stepK} ${s.stepKgood}`}>③ 返金</div>
            <div className={s.stepT}>割当価格との差額・ロック超過は<b className={s.good ?? ''}>自動返金</b></div>
          </div>
        </div>
        <div className={s.introNote}>バッチのロック前ならキャンセル可（同時に最大10件まで作成できます）。</div>
      </section>

      {/* セッション */}
      <div>
        <div className={s.secHead}>
          <span className={s.secLabel}>あなたのセッション · SESSIONS</span>
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
          <div className={s.empty}>セッションはまだありません。上の「購入セッションを作成」から馬を迎えましょう。</div>
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
