import Link from 'next/link';
import { serverApi, serverApiOrLogin } from '@/lib/server-api';

interface Me {
  id: string;
  email: string;
  status: string;
}

interface Wallet {
  available: string;
  locked: string;
  currency: string;
}

interface Horse {
  id: string;
  name: string;
  status: string;
  current_day: number;
  horse_type: string;
  rarity: string;
}

interface Buff {
  buff_rarity: string;
  buff_bonus_score: string;
  status: string;
}

interface Race {
  id: string;
  status: string;
  participant_count: number | null;
  batch_date: string;
}

export default async function DashboardPage() {
  const me = await serverApiOrLogin<Me>('/api/v1/me');
  const [wallet, horses, buff, races] = await Promise.all([
    serverApi<Wallet>('/api/v1/wallet'),
    serverApi<{ horses: Horse[] }>('/api/v1/horses'),
    serverApi<Buff>('/api/v1/revenge-buffs/current'),
    serverApi<{ races: Race[] }>('/api/v1/races'),
  ]);

  return (
    <>
      <h1>ダッシュボード</h1>
      <p className="muted">{me.email}</p>

      <div className="grid">
        <div className="panel stat">
          <div className="label">利用可能残高</div>
          <div className="value">{wallet.status === 200 ? `${wallet.body.available} USDT` : '—'}</div>
        </div>
        <div className="panel stat">
          <div className="label">ロック中</div>
          <div className="value">{wallet.status === 200 ? `${wallet.body.locked} USDT` : '—'}</div>
        </div>
        <div className="panel stat">
          <div className="label">Revenge Buff</div>
          <div className="value">
            {buff.status === 200 ? `${buff.body.buff_rarity} +${buff.body.buff_bonus_score}` : 'なし'}
          </div>
        </div>
      </div>

      <h2>保有馬</h2>
      <div className="panel">
        {horses.status === 200 && horses.body.horses.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>名前</th>
                <th>Day</th>
                <th>タイプ</th>
                <th>レア度</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {horses.body.horses.slice(0, 5).map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link href={`/horses/${h.id}`}>{h.name}</Link>
                  </td>
                  <td>{h.current_day}</td>
                  <td>{h.horse_type}</td>
                  <td>{h.rarity}</td>
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

      <h2>直近のレース</h2>
      <div className="panel">
        {races.status === 200 && races.body.races.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>状態</th>
                <th>出走数</th>
              </tr>
            </thead>
            <tbody>
              {races.body.races.slice(0, 5).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/races/${r.id}`}>{r.batch_date}</Link>
                  </td>
                  <td>
                    <span className="badge">{r.status}</span>
                  </td>
                  <td>{r.participant_count ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">レースはまだありません。</p>
        )}
      </div>
    </>
  );
}
