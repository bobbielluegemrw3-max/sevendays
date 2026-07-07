/** Item System UI 共有型(Decision 078/079)。APIレスポンス形。 */

export interface CatalogItem {
  key: string;
  name_ja: string;
  name_en: string;
  band: 'BASIC' | 'STANDARD' | 'PREMIUM' | 'BURN_DROP';
  price: string;
  sellable: boolean;
  giftable: boolean;
  usable_day_min: number | null;
  usable_day_max: number | null;
  description_ja: string;
}

export interface InventoryEntry {
  item_key: string;
  n: number;
}

export interface PendingUsage {
  usage_id: string;
  horse_id: string;
  horse_name: string;
  item_key: string;
  effective_race_date: string;
}

export interface InventoryData {
  available: InventoryEntry[];
  pending: PendingUsage[];
}

export const BAND_LABEL: Record<CatalogItem['band'], string> = {
  BASIC: 'ベーシック',
  STANDARD: 'スタンダード',
  PREMIUM: 'プレミアム',
  BURN_DROP: '非売品',
};

export const BAND_ORDER: CatalogItem['band'][] = ['BASIC', 'STANDARD', 'PREMIUM', 'BURN_DROP'];
