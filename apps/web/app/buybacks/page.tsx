import Link from 'next/link';
import { serverApiOrLogin } from '@/lib/server-api';

interface Buyback {
  id: string;
  horse_id: string;
  status: string;
  total_amount: string;
  day7_clear_date: string;
  payments_paid: number | string;
}

export default async function BuybacksPage() {
  const { buybacks } = await serverApiOrLogin<{ buybacks: Buyback[] }>('/api/v1/buybacks');
  return (
    <>
      <h1>Buyback</h1>
      <p className="muted">Day7を生き延びた馬は200 USDTで買い戻されます(7日分割・D+1開始)。</p>
      <div className="panel">
        {buybacks.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Day7達成日</th>
                <th>馬ID</th>
                <th>進捗</th>
                <th>総額</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {buybacks.map((b) => (
                <tr key={b.id}>
                  <td>
                    <Link href={`/buybacks/${b.id}`}>{b.day7_clear_date}</Link>
                  </td>
                  <td>
                    <code>{b.horse_id}</code>
                  </td>
                  <td>{b.payments_paid} / 7 回支払済み</td>
                  <td>{b.total_amount} USDT</td>
                  <td>
                    <span className="badge">{b.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Buybackスケジュールはまだありません。</p>
        )}
      </div>
    </>
  );
}
