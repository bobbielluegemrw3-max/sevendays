import { serverApiOrLogin } from '@/lib/server-api';
import { PurchasePanel } from '@/components/PurchasePanel';

interface Assignment {
  id: string;
  horse_id: string;
  assigned_price: string;
  status: string;
  was_day0_mint: boolean;
  created_at: string;
}

export default async function PurchasePage() {
  const { assignments } = await serverApiOrLogin<{ assignments: Assignment[] }>('/api/v1/assignments');

  return (
    <>
      <h1>購入</h1>
      <div className="panel">
        <p>
          購入セッションを作成すると価格テーブル上限額がロックされ、当日バッチの割当で馬が決まります。
          割当価格との差額とロック超過分は自動で返金されます。バッチのロック前ならキャンセルできます。
        </p>
        <PurchasePanel />
      </div>

      <h2>割当履歴</h2>
      <div className="panel">
        {assignments.length > 0 ? (
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
              {assignments.map((a) => (
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
