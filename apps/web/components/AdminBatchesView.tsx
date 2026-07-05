import { BatchRetryButton } from '@/components/BatchRetryButton';
import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/batches 再設計 — 日次バッチ(37ステップ)一覧。純粋な表示コンポーネント。 */

export interface Batch {
  id: string; batch_date: string; status: string;
  completed_at: string | null; failed_at: string | null; completed_steps: number | string;
}

const PILL: Record<string, string> = { good: s.pillGood!, warn: s.pillWarn!, bad: s.pillBad!, cyan: s.pillCyan!, muted: s.pillMuted! };
const ROW: Record<string, string> = { warn: s.rowWarn!, bad: s.rowBad! };

export function AdminBatchesView({ batches }: { batches: Batch[] }) {
  return (
    <div className={s.wrap}>
      <div className={s.h1}>日次バッチ（37ステップ）</div>
      {batches.length > 0 ? (
        <div className={s.list}>
          {batches.map((b) => {
            const kind = statusKind(b.status);
            const when = (b.completed_at ?? b.failed_at ?? '—').slice(0, 19);
            return (
              <div key={b.id} className={`${s.row} ${ROW[kind] ?? ''}`}>
                <span className={s.cDate}>{b.batch_date}</span>
                <span className={`${s.pill} ${PILL[kind]}`}>{b.status}</span>
                <span className={s.steps}><b>{b.completed_steps}</b> / 37</span>
                <span className={s.cSpace} />
                <span className={s.cDate}>{when}</span>
                {b.status === 'PARTIAL_FAILED' ? <span className={s.cActions}><BatchRetryButton batchId={b.id} /></span> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>バッチはまだ実行されていません。</div>
      )}
      <div className={s.note}>
        <b>FAILED</b>（非リトライ可能ステップの失敗）はリトライできません — リカバリ手続き（二重承認）が必要です。
      </div>
    </div>
  );
}
