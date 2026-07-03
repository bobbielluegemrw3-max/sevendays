import Link from 'next/link';
import { serverApiOrLogin } from '@/lib/server-api';

interface Race {
  id: string;
  status: string;
  participant_count: number | null;
  batch_date: string;
  race_engine_version: string;
}

export default async function RacesPage() {
  const { races } = await serverApiOrLogin<{ races: Race[] }>('/api/v1/races');
  return (
    <>
      <h1>レース</h1>
      <div className="panel">
        {races.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>日付</th>
                <th>状態</th>
                <th>出走数</th>
                <th>エンジン</th>
              </tr>
            </thead>
            <tbody>
              {races.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/races/${r.id}`}>{r.batch_date}</Link>
                  </td>
                  <td>
                    <span className="badge">{r.status}</span>
                  </td>
                  <td>{r.participant_count ?? '—'}</td>
                  <td className="muted">{r.race_engine_version}</td>
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
