import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { ItemsView } from '@/components/ItemsView';
import type { CatalogItem, DailyConditions, InventoryData, ItemTransaction } from '@/lib/items';

/** /items — アイテムショップ+インベントリ+ギフト+履歴+設定結果(Decision 078/079)。 */
export default async function ItemsPage() {
  const [catalog, inventory, txns, settings] = await Promise.all([
    serverApiOrLogin<{ items: CatalogItem[] }>('/api/v1/items/catalog'),
    serverApiOrLogin<InventoryData>('/api/v1/items/inventory'),
    serverApi<{ transactions: ItemTransaction[] }>('/api/v1/items/transactions'),
    serverApi<{ history: DailyConditions[]; today: string }>('/api/v1/items/conditions'),
  ]);
  return (
    <ItemsView
      catalog={catalog.items}
      inventory={inventory}
      transactions={txns.status === 200 ? txns.body.transactions : []}
      conditionHistory={settings.status === 200 ? settings.body.history : []}
      {...(settings.status === 200 ? { today: settings.body.today } : {})}
    />
  );
}
