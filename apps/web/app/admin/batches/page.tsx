import { serverApi } from '@/lib/server-api';
import { BatchRetryButton } from '@/components/BatchRetryButton';

interface Batch {
  id: string;
  batch_date: string;
  status: string;
  completed_at: string | null;
  failed_at: string | null;
  completed_steps: number | string;
}

export default async function AdminBatchesPage() {
  const result = await serverApi<{ batches: Batch[] }>('/api/v1/admin/batches');
  if (result.status !== 200) return <p className="error">バッチ一覧を取得できません。</p>;

  return (
    <>
      <h1>日次バッチ(37ステップ)</h1>
      <div className="panel">
        {result.body.batches.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>状態</th>
                <th>完了ステップ</th>
                <th>完了/失敗時刻</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {result.body.batches.map((b) => (
                <tr key={b.id}>
                  <td>{b.batch_date}</td>
                  <td>
                    <span className="badge">{b.status}</span>
                  </td>
                  <td>{b.completed_steps} / 37</td>
                  <td className="muted">{(b.completed_at ?? b.failed_at ?? '—').slice(0, 19)}</td>
                  <td>{b.status === 'PARTIAL_FAILED' ? <BatchRetryButton batchId={b.id} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">バッチはまだ実行されていません。</p>
        )}
      </div>
      <p className="muted">
        FAILED(非リトライ可能ステップの失敗)はリトライできません — リカバリ手続き(二重承認)が必要です。
      </p>
    </>
  );
}
