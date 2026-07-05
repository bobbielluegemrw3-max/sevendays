import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { HorseDetailView, type HorseDetail } from '@/components/HorseDetailView';

export default async function HorseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await serverApi<HorseDetail>(`/api/v1/horses/${id}`);
  if (result.status !== 200) notFound();
  return <HorseDetailView horse={result.body} />;
}
