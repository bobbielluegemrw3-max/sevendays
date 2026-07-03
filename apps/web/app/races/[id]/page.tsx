import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';

interface RaceDetail {
  id: string;
  status: string;
  participant_count: number | null;
  batch_date: string;
  race_engine_version: string;
  seed_hash: string;
  revealed_seed: string | null;
}

interface RaceResult {
  horse_id: string;
  final_score: string;
  final_rank: number;
  is_burned: boolean;
}

interface Replay {
  verified: boolean;
  reason?: string;
}

export default async function RaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = await serverApi<RaceDetail>(`/api/v1/races/${id}`);
  if (race.status !== 200) notFound();
  const [results, replay] = await Promise.all([
    serverApi<{ results: RaceResult[] }>(`/api/v1/races/${id}/results`),
    serverApi<Replay>(`/api/v1/races/${id}/replay`),
  ]);

  return (
    <>
      <h1>レース {race.body.batch_date}</h1>
      <p>
        <span className="badge">{race.body.status}</span> 出走 {race.body.participant_count ?? '—'} ・{' '}
        {race.body.race_engine_version}
      </p>

      <h2>リプレイ検証(Commit-Reveal)</h2>
      <div className="panel">
        <table>
          <tbody>
            <tr>
              <th>シードハッシュ(事前コミット)</th>
              <td>
                <code>{race.body.seed_hash}</code>
              </td>
            </tr>
            <tr>
              <th>公開シード</th>
              <td>{race.body.revealed_seed ? <code>{race.body.revealed_seed}</code> : '未公開(レース前)'}</td>
            </tr>
            <tr>
              <th>再計算検証</th>
              <td>
                {replay.status === 200 ? (
                  replay.body.verified ? (
                    <span className="ok">✓ スナップショット+シードから同一結果を再計算できました</span>
                  ) : (
                    <span className="error">✗ 検証失敗: {replay.body.reason}</span>
                  )
                ) : (
                  <span className="muted">検証待ち</span>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>結果</h2>
      <div className="panel">
        {results.status === 200 && results.body.results.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>着順</th>
                <th>馬ID</th>
                <th>スコア</th>
                <th>Burn</th>
              </tr>
            </thead>
            <tbody>
              {results.body.results.map((r) => (
                <tr key={r.horse_id}>
                  <td>{r.final_rank}</td>
                  <td>
                    <code>{r.horse_id}</code>
                  </td>
                  <td>{r.final_score}</td>
                  <td>{r.is_burned ? <span className="error">BURN</span> : <span className="ok">生存</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">結果はまだありません。</p>
        )}
      </div>
    </>
  );
}
