import { serverApiOrLogin } from '@/lib/server-api';
import { BuybacksView, type Buyback } from '@/components/BuybacksView';

/** /champion — チャンピオン報酬一覧(Decision 075: 旧称buyback)。 */
export default async function ChampionPage() {
  const { buybacks } = await serverApiOrLogin<{ buybacks: Buyback[] }>('/api/v1/buybacks');
  return <BuybacksView buybacks={buybacks} />;
}
