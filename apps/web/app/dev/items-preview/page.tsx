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
  const day = (d: number) => `2026-07-${String(d).padStart(2, '0')}`;
  return (
    <ItemsView
      preview
      catalog={catalog}
      today={day(7)}
      settingHistory={[1, 2, 3, 4, 5, 6].flatMap((w) =>
        [3, 4, 2, 5, 3, 4, 6].map((v, i) => ({ date: day(Math.min(30, (w - 1) * 5 + i + 1)), setting: v })),
      ).slice(0, 30).filter((v, idx, arr) => arr.findIndex((x) => x.date === v.date) === idx)}
      transactions={[
        { id: 't1', kind: 'PURCHASED', item_key: 'lucky_charm', quantity: 2, counterparty: null, horse_name: null, created_at: `${day(7)}T10:00:00Z` },
        { id: 't2', kind: 'RECEIVED', item_key: 'memento_horseshoe', quantity: 1, counterparty: null, horse_name: null, created_at: `${day(6)}T12:05:00Z` },
        { id: 't3', kind: 'SENT', item_key: 'sugar_cube', quantity: 3, counterparty: 'ab***', horse_name: null, created_at: `${day(6)}T09:00:00Z` },
        { id: 't4', kind: 'USED', item_key: 'champion_saddle', quantity: 1, counterparty: null, horse_name: 'Crimson Tiger', created_at: `${day(5)}T11:30:00Z` },
      ]}
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
