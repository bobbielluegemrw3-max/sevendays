import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { BuybackDetailView, type BuybackDetail } from '@/components/BuybackDetailView';

export default async function BuybackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lang = await getLang();
  const result = await serverApi<BuybackDetail>(`/api/v1/buybacks/${id}`);
  if (result.status !== 200) notFound();
  return <BuybackDetailView buyback={result.body} lang={lang} />;
}
