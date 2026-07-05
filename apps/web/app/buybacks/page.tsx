import { serverApiOrLogin } from '@/lib/server-api';
import { BuybacksView, type Buyback } from '@/components/BuybacksView';

export default async function BuybacksPage() {
  const { buybacks } = await serverApiOrLogin<{ buybacks: Buyback[] }>('/api/v1/buybacks');
  return <BuybacksView buybacks={buybacks} />;
}
