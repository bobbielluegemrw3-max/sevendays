import Link from 'next/link';
import { serverApiOrLogin } from '@/lib/server-api';

interface Horse {
  id: string;
  name: string;
  status: string;
  current_day: number;
  horse_type: string;
  rarity: string;
  condition: string;
  fatigue: string;
}

export default async function HorsesPage() {
  const { horses } = await serverApiOrLogin<{ horses: Horse[] }>('/api/v1/horses');
  return (
    <>
      <h1>保有馬</h1>
      <div className="panel">
        {horses.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th>Day</th>
                <th>タイプ</th>
                <th>レア度</th>
                <th>コンディション</th>
                <th>疲労</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {horses.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link href={`/horses/${h.id}`}>{h.name}</Link>
                  </td>
                  <td>{h.current_day} / 7</td>
                  <td>{h.horse_type}</td>
                  <td>{h.rarity}</td>
                  <td>{h.condition}</td>
                  <td>{h.fatigue}</td>
                  <td>
                    <span className="badge">{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">
            まだ馬を所有していません。<Link href="/purchase">購入</Link>から始めましょう。
          </p>
        )}
      </div>
    </>
  );
}
