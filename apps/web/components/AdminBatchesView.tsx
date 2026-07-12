import { BatchRetryButton } from '@/components/BatchRetryButton';
import { statusKind } from '@/components/admin-shared';
import s from '../app/admin.module.css';

/* /admin/batches — Ops Consoleリデザイン(2026-07-13ハンドオフ)。
 * 列見出し付きテーブル。ステータス色は意味のみ・数値は右揃え。純表示。 */

export interface Batch {
  id: string; batch_date: string; status: string;
  completed_at: string | null; failed_at: string | null; completed_steps: number | string;
}

const ST: Record<string, string> = { good: s.stGood!, warn: s.stWarn!, bad: s.stBad!, cyan: s.stNeutral!, muted: s.stNeutral! };

export function AdminBatchesView({ batches }: { batches: Batch[] }) {
  return (
    <div className={s.wrap}>
      <div className={s.ph}>
        <div>
          <h1 className={s.phTitle}>日次バッチ（37ステップ）</h1>
          <div className={s.phSub}>FAILEDはリトライ不可 → リカバリ手続きへ。</div>
        </div>
      </div>
      {batches.length > 0 ? (
        <>
          <div className={`${s.tableWrap} ${s.desktopTable}`}>
            <table className={s.tbl}>
              <thead>
                <tr>
                  <th>batch date</th><th>状態</th><th className={s.tRight}>ステップ</th>
                  <th>完了/失敗時刻</th><th className={s.tRight}>操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className={s.date}>{b.batch_date}</td>
                    <td><span className={`${s.st} ${ST[statusKind(b.status)]}`}>{b.status}</span></td>
                    <td className={s.num}>{b.completed_steps}<span className={s.u}>/37</span></td>
                    <td className={s.date}>{(b.completed_at ?? b.failed_at ?? '—').slice(0, 19).replace('T', ' ')}</td>
                    <td className={s.tRight}>{b.status === 'PARTIAL_FAILED' ? <BatchRetryButton batchId={b.id} /> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={s.mcard}>
            {batches.map((b) => (
              <div key={b.id} className={s.mc}>
                <div className={s.mcTop}>
                  <span className={s.mcName}>{b.batch_date}</span>
                  <span className={`${s.st} ${ST[statusKind(b.status)]}`}>{b.status}</span>
                </div>
                <div className={s.mcGrid}>
                  <div className={s.mcCell}><span className={s.k}>ステップ</span><span className={s.v}>{b.completed_steps}/37</span></div>
                  <div className={s.mcCell}><span className={s.k}>{b.failed_at ? '失敗' : '完了'}</span><span className={s.v}>{(b.completed_at ?? b.failed_at ?? '—').slice(11, 16) || '—'}</span></div>
                </div>
                {b.status === 'PARTIAL_FAILED' ? <BatchRetryButton batchId={b.id} /> : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className={s.empty}>バッチはまだ実行されていません。</div>
      )}
      <div className={s.note}>
        <b>FAILED</b>（非リトライ可能ステップの失敗）はリトライできません — リカバリ手続き（二重承認）が必要です。
      </div>
    </div>
  );
}
