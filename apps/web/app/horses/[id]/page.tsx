import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { TrainingForm } from '@/components/TrainingForm';

interface HorseDetail {
  id: string;
  name: string;
  status: string;
  current_day: number;
  horse_type: string;
  rarity: string;
  dna_hash: string;
  dna_modifier: string;
  ability_json: Record<string, number>;
  condition: string;
  fatigue: string;
  mint_seed_hash: string;
  horse_generation_version: string;
}

export default async function HorseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await serverApi<HorseDetail>(`/api/v1/horses/${id}`);
  if (result.status !== 200) notFound();
  const horse = result.body;

  return (
    <>
      <h1>{horse.name}</h1>
      <p>
        <span className="badge">{horse.status}</span> Day {horse.current_day} / 7 ・ {horse.horse_type} ・{' '}
        {horse.rarity}
      </p>

      <h2>能力</h2>
      <div className="grid">
        {Object.entries(horse.ability_json).map(([key, value]) => (
          <div key={key} className="panel stat">
            <div className="label">{key}</div>
            <div className="value">{value}</div>
          </div>
        ))}
      </div>

      {horse.status === 'ACTIVE' ? (
        <>
          <h2>トレーニング</h2>
          <div className="panel">
            <TrainingForm horseId={horse.id} />
          </div>
        </>
      ) : null}

      <h2>ステータス</h2>
      <div className="panel">
        <table>
          <tbody>
            <tr>
              <th>コンディション</th>
              <td>{horse.condition}</td>
            </tr>
            <tr>
              <th>疲労</th>
              <td>{horse.fatigue}</td>
            </tr>
            <tr>
              <th>DNA</th>
              <td>
                <code>{horse.dna_hash}</code>(modifier {horse.dna_modifier})
              </td>
            </tr>
            <tr>
              <th>ミントシードハッシュ</th>
              <td>
                <code>{horse.mint_seed_hash}</code>
              </td>
            </tr>
            <tr>
              <th>生成バージョン</th>
              <td>{horse.horse_generation_version}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
