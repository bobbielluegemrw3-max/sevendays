import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { RaceDetailView, type RaceDetail, type Replay } from '@/components/RaceDetailView';
import type { RaceResult } from '@/components/RaceResults';

export default async function RaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = await serverApi<RaceDetail>(`/api/v1/races/${id}`);
  if (race.status !== 200) notFound();
  const [results, replay] = await Promise.all([
    serverApi<{ results: RaceResult[] }>(`/api/v1/races/${id}/results`),
    serverApi<Replay>(`/api/v1/races/${id}/replay`),
  ]);
  return (
    <RaceDetailView
      race={race.body}
      results={results.status === 200 ? results.body.results : []}
      replay={replay.status === 200 ? replay.body : null}
    />
  );
}
