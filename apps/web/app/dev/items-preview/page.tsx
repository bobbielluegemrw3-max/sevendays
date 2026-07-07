import { notFound } from 'next/navigation';
import { ItemsView } from '@/components/ItemsView';
import { ITEM_CATALOG_V1 } from '@sevendays/domain';
import type { CatalogItem } from '@/lib/items';

/** Dev-only visual preview of /items with fixture inventory. 404 in prod. */
export default function ItemsPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const catalog: CatalogItem[] = ITEM_CATALOG_V1.map((i) => ({
    key: i.key,
    name_ja: i.nameJa,
    name_en: i.nameEn,
    band: i.band,
    price: i.price,
    sellable: i.sellable,
    giftable: i.giftable,
    usable_day_min: i.usableDayMin ?? null,
    usable_day_max: i.usableDayMax ?? null,
    description_ja: i.descriptionJa,
  }));
  return (
    <ItemsView
      preview
      catalog={catalog}
      inventory={{
        available: [
          { item_key: 'lucky_charm', n: 2 },
          { item_key: 'sugar_cube', n: 5 },
          { item_key: 'memento_horseshoe', n: 1 },
        ],
        pending: [
          {
            usage_id: 'u1',
            horse_id: 'h1',
            horse_name: 'Crimson Tiger',
            item_key: 'champion_saddle',
            effective_race_date: '2026-07-07',
          },
        ],
      }}
    />
  );
}
