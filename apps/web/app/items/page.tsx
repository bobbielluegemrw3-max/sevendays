import { serverApiOrLogin } from '@/lib/server-api';
import { ItemsView } from '@/components/ItemsView';
import type { CatalogItem, InventoryData } from '@/lib/items';

/** /items — アイテムショップ+インベントリ+ギフト(Decision 078/079)。 */
export default async function ItemsPage() {
  const [catalog, inventory] = await Promise.all([
    serverApiOrLogin<{ items: CatalogItem[] }>('/api/v1/items/catalog'),
    serverApiOrLogin<InventoryData>('/api/v1/items/inventory'),
  ]);
  return <ItemsView catalog={catalog.items} inventory={inventory} />;
}
