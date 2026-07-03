import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { CreateSessionButton, CancelSessionButton } from '@/components/PurchasePanel';

interface Session {
  id: string;
  status: string;
  locked_amount: string;
  assigned_price: string | null;
  refund_amount: string | null;
  created_at: string;
}

interface Assignment {
  id: string;
  horse_id: string;
  assigned_price: string;
  status: string;
  was_day0_mint: boolean;
  created_at: string;
}

export default async function PurchasePage() {
  const { sessions } = await serverApiOrLogin<{ sessions: Session[] }>('/api/v1/purchase');
  const assignments = await serverApi<{ assignments: Assignment[] }>('/api/v1/assignments');

  return (
    <>
      <h1>購入</h1>
      <div className="panel">
        <p>
          購入セッションを作成すると価格テーブル上限額(177.16 USDT)がロックされ、当日バッチの割当で馬が決まります。
          Day0ミントの場合の請求は102 USDT(価格100+手数料2)で、割当価格との差額とロック超過分は自動で返金されます。
          バッチのロック前ならキャンセルできます(同時に最大10件)。
        </p>
        <CreateSessionButton />
      </div>

      <h2>あなたのセッション</h2>
      <div className="panel">
        {sessions.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>作成日時</th>
                <th>状態</th>
                <th>ロック額</th>
                <th>割当価格</th>
                <th>返金</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{s.created_at.slice(0, 19)}</td>
                  <td>
                    <span className="badge">{s.status}</span>
                  </td>
                  <td>{s.locked_amount} USDT</td>
                  <td>{s.assigned_price ?? '—'}</td>
                  <td>{s.refund_amount ?? '—'}</td>
                  <td>
                    {s.status === 'PENDING_ASSIGNMENT' ? <CancelSessionButton sessionId={s.id} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">セッションはまだありません。</p>
        )}
      </div>

      <h2>割当履歴</h2>
      <div className="panel">
        {assignments.status === 200 && assignments.body.assignments.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>馬ID</th>
                <th>価格</th>
                <th>種別</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {assignments.body.assignments.map((a) => (
                <tr key={a.id}>
                  <td className="muted">{a.created_at.slice(0, 19)}</td>
                  <td>
                    <code>{a.horse_id}</code>
                  </td>
                  <td>{a.assigned_price} USDT</td>
                  <td>{a.was_day0_mint ? 'Day0 Mint' : 'P2P'}</td>
                  <td>
                    <span className="badge">{a.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">割当はまだありません。</p>
        )}
      </div>
    </>
  );
}
