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

/**
 * アイテム履歴の1行(リデザインで追加)。
 * kind: PURCHASED=購入 / RECEIVED=受取(ギフト・Burnドロップ) / SENT=送付 / USED=使用。
 * counterparty はギフト相手のマスク済みメール、horse_name は USED の対象馬。
 * 供給元は GET /api/v1/items/transactions を想定(page.tsx で結線)。
 */
export interface ItemTransaction {
  id: string;
  kind: 'PURCHASED' | 'RECEIVED' | 'SENT' | 'USED';
  item_key: string;
  quantity: number;
  counterparty: string | null;
  horse_name: string | null;
  created_at: string;
}

/**
 * 公開された1日ぶんの設定結果(リデザインで追加)。
 * setting は 1..6。date は ISO(YYYY-MM-DD)。レース後に確定・公開される。
 * 供給元は GET /api/v1/items/settings?month=YYYY-MM などを想定。
 */
export interface DailySetting {
  date: string;
  setting: number;
}

export const BAND_LABEL: Record<CatalogItem['band'], string> = {
  BASIC: 'ベーシック',
  STANDARD: 'スタンダード',
  PREMIUM: 'プレミアム',
  BURN_DROP: '非売品',
};

export const BAND_ORDER: CatalogItem['band'][] = ['BASIC', 'STANDARD', 'PREMIUM', 'BURN_DROP'];

/** アイテム履歴の種別ごとの表示メタ(ラベル/符号)。色は CSS の .txn* が担う。 */
export const TXN_META: Record<ItemTransaction['kind'], { label: string; sign: '+' | '-' }> = {
  PURCHASED: { label: '購入', sign: '+' },
  RECEIVED: { label: '受取', sign: '+' },
  SENT: { label: '送付', sign: '-' },
  USED: { label: '使用', sign: '-' },
};
