import Link from 'next/link';
import { serverApi, serverApiOrLogin } from '@/lib/server-api';

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

interface Session {
  id: string;
  status: string;
  locked_amount: string;
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: '出走中',
  DAY7_CLEARED: 'Day7 達成',
  MEMORIALIZED: '記念馬',
  BURNED: 'Burn',
};

export default async function StablePage() {
  const { horses } = await serverApiOrLogin<{ horses: Horse[] }>('/api/v1/horses');
  const sessionsRes = await serverApi<{ sessions: Session[] }>('/api/v1/purchase');
  const pending =
    sessionsRes.status === 200 ? sessionsRes.body.sessions.filter((s) => s.status === 'PENDING_ASSIGNMENT') : [];

  const active = horses.filter((h) => h.status === 'ACTIVE');
  const retired = horses.filter((h) => h.status !== 'ACTIVE');

  return (
    <>
      <h1>マイ厩舎</h1>

      {/* welcome a new horse */}
      <div className="panel">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ color: 'var(--text)', margin: 0 }}>新しい馬を迎える</h3>
            <div className="muted" style={{ fontSize: '0.88rem' }}>
              購入セッションを作成すると 177.16 USDT がロックされ、今夜のレースで馬が割り当てられます。
            </div>
          </div>
          <Link href="/purchase">
            <button>馬を迎える →</button>
          </Link>
        </div>
        {pending.length > 0 ? (
          <div className="muted" style={{ marginTop: '0.7rem', fontSize: '0.88rem' }}>
            🕑 割当待ち {pending.length} 件 — 今夜のレースで確定します。
          </div>
        ) : null}
      </div>

      {/* active horses */}
      <h2>出走中の馬（{active.length}）</h2>
      {active.length > 0 ? (
        <div className="grid cards">
          {active.map((h) => (
            <Link key={h.id} href={`/horses/${h.id}`} className="horse">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="name">{h.name}</span>
                <span className="badge tonight">今夜出走</span>
              </div>
              <div className="meta">
                <span className={`badge rarity-${h.rarity}`}>{h.rarity}</span>
                <span className="badge">{h.horse_type}</span>
                <span className="badge">Day {h.current_day} / 7</span>
              </div>
              <div className="rail">
                {Array.from({ length: 7 }, (_, i) => {
                  const day = i + 1;
                  const cls = day < h.current_day + 1 ? 'done' : day === h.current_day + 1 ? 'today' : '';
                  return <span key={day} className={`pip ${cls}`} />;
                })}
              </div>
              <div className="meta faint">
                コンディション {h.condition} ・ 疲労 {h.fatigue}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="panel empty">出走中の馬はいません。上のボタンから迎えましょう。</div>
      )}

      {/* retired / memorialized */}
      {retired.length > 0 ? (
        <>
          <h2>過去の馬（{retired.length}）</h2>
          <div className="panel">
            <table>
              <thead>
                <tr>
                  <th>名前</th>
                  <th>タイプ</th>
                  <th>レア度</th>
                  <th>結末</th>
                </tr>
              </thead>
              <tbody>
                {retired.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <Link href={`/horses/${h.id}`}>{h.name}</Link>
                    </td>
                    <td className="muted">{h.horse_type}</td>
                    <td className="muted">{h.rarity}</td>
                    <td>
                      <span className={`badge ${h.status === 'BURNED' ? 'bad' : 'good'}`}>
                        {STATUS_LABEL[h.status] ?? h.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
