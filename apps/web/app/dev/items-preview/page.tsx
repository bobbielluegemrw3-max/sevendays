import { notFound } from 'next/navigation';
import { ItemsView } from '@/components/ItemsView';
import { AFFINITY_JA, ITEM_CATALOG_V2 } from '@sevendays/domain';
import type { CatalogItem } from '@/lib/items';

/** Dev-only visual preview of /items with fixture inventory. 404 in prod. */
export default function ItemsPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const catalog: CatalogItem[] = ITEM_CATALOG_V2.map((i) => ({
    key: i.key,
    name_ja: i.nameJa,
    name_en: i.nameEn,
    band: i.band,
    price: i.price,
    affinity: i.affinity,
    affinity_ja: AFFINITY_JA[i.affinity],
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
      today={day(8)}
      conditionHistory={[
        { date: day(5), weather: 'SUNNY', track: 'GOOD', surface: 'TURF', weather_ja: '晴れ', track_ja: '良', surface_ja: '芝', night_name: null },
        { date: day(6), weather: 'RAIN', track: 'HEAVY', surface: 'DIRT', weather_ja: '雨', track_ja: '不良', surface_ja: 'ダート', night_name: '豪雨のダート決戦' },
        { date: day(7), weather: 'CLOUDY', track: 'SOFT', surface: 'TURF', weather_ja: '曇り', track_ja: '稍重', surface_ja: '芝', night_name: null },
        { date: day(8), weather: 'STORM', track: 'HEAVY', surface: 'TURF', weather_ja: '嵐', track_ja: '不良', surface_ja: '芝', night_name: '嵐の荒天決戦' },
      ]}
      inventory={{
        available: [
          { item_key: 'sugar_cube', n: 3 },
          { item_key: 'storm_cloak', n: 1 },
          { item_key: 'mudlord_crown', n: 1 },
          { item_key: 'memento_horseshoe', n: 1 },
        ],
        pending: [
          { usage_id: 'u1', item_key: 'turf_master_saddle', horse_id: 'h1', horse_name: 'Golden Wind', effective_race_date: day(8) },
        ],
      }}
      transactions={[
        { id: 't1', kind: 'PURCHASED', item_key: 'storm_cloak', quantity: 1, counterparty: null, horse_name: null, created_at: `${day(6)}T12:00:00` },
        { id: 't2', kind: 'RECEIVED', item_key: 'sugar_cube', quantity: 2, counterparty: 'friend@example.com', horse_name: null, created_at: `${day(7)}T09:30:00` },
        { id: 't3', kind: 'USED', item_key: 'turf_master_saddle', quantity: 1, counterparty: null, horse_name: 'Golden Wind', created_at: `${day(8)}T10:10:00` },
      ]}
    />
  );
}
