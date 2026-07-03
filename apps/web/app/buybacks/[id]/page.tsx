import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';

interface Payment {
  payment_number: number;
  due_date: string;
  amount: string;
  status: string;
  paid_at: string | null;
}

interface BuybackDetail {
  id: string;
  horse_id: string;
  status: string;
  total_amount: string;
  day7_clear_date: string;
  payments: Payment[];
}

export default async function BuybackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await serverApi<BuybackDetail>(`/api/v1/buybacks/${id}`);
  if (result.status !== 200) notFound();
  const buyback = result.body;

  return (
    <>
      <h1>Buyback {buyback.day7_clear_date}</h1>
      <p>
        <span className="badge">{buyback.status}</span> 馬 <code>{buyback.horse_id}</code> ・ 総額{' '}
        {buyback.total_amount} USDT
      </p>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>支払予定日</th>
              <th>金額</th>
              <th>状態</th>
              <th>支払日時</th>
            </tr>
          </thead>
          <tbody>
            {buyback.payments.map((p) => (
              <tr key={p.payment_number}>
                <td>{p.payment_number}</td>
                <td>{p.due_date}</td>
                <td>{p.amount} USDT</td>
                <td>
                  {p.status === 'PAID' ? <span className="ok">PAID</span> : <span className="badge">{p.status}</span>}
                </td>
                <td className="muted">{p.paid_at ? p.paid_at.slice(0, 19) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          7回すべての支払い完了後、この馬のMemorial NFT(Polygon / ERC-721)がミントされます。
        </p>
      </div>
    </>
  );
}
