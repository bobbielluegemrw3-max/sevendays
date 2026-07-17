/** Item System UI 共有型(Decision 078/079)。APIレスポンス形。 */

export interface CatalogItem {
  affinity?: string;
  affinity_ja?: string;
  key: string;
  name_ja: string;
  name_en: string;
  band: 'BASIC' | 'STANDARD' | 'PREMIUM' | 'BURN_DROP';
  price: string;
  sellable: boolean;
  giftable: boolean;
  usable_day_min?: number | null;
  usable_day_max?: number | null;
  description_ja: string;
  /** カタログV2(Decision 109・item_policy_v3.0)のみ。 */
  item_class?: 'TRAINING' | 'RACE';
  effect?: ItemEffectV3;
}

/** カタログV2の効果スペック(APIレスポンス形 — domainの公開定数そのまま)。 */
export type ItemEffectV3 =
  | { kind: 'BONUS'; min: number; max: number; requiresMenu?: string; requiresFavorite?: boolean; lvMin?: number; lvMax?: number }
  | { kind: 'FLOOR_ZERO' }
  | { kind: 'SYNERGY_DOUBLE' }
  | { kind: 'DECAY_SHIELD'; races: number }
  | { kind: 'GROUP_PREP'; group: string; hit: number; miss: number }
  | { kind: 'PINPOINT_PREP'; axis: 'WEATHER' | 'TRACK'; condition: string; hit: number; miss: number }
  | { kind: 'DUAL_PREP'; hit: number; miss: number }
  | { kind: 'DUAL_FLOOR' };

export const ITEM_CLASS_LABEL: Record<'TRAINING' | 'RACE', string> = {
  TRAINING: '調教アイテム',
  RACE: 'レースアイテム',
};

const GROUP_JA: Record<string, string> = {
  RAIN_GROUP: '雨系(雨・嵐)',
  SUN_GROUP: '晴れ系(晴れ・曇り)',
  MUD_GROUP: '道悪系(稍重・不良)',
  FIRM_GROUP: '良系(高速・良)',
};
const CONDITION_JA: Record<string, string> = {
  SUNNY: '晴れ', CLOUDY: '曇り', RAIN: '雨', STORM: '嵐',
  FAST: '高速馬場', GOOD: '良馬場', SOFT: '稍重', HEAVY: '不良馬場',
};

const sign = (n: number): string => (n >= 0 ? `+${n}` : String(n));

/** カタログV2の効果を正直な一行に(的中と外れを必ず併記 — R1)。 */
export function effectSummaryJa(effect: ItemEffectV3): string {
  switch (effect.kind) {
    case 'BONUS': {
      const range = effect.min === effect.max ? sign(effect.min) : `${sign(effect.min)}〜${sign(effect.max)}`;
      const cond = effect.requiresMenu
        ? `${effect.requiresMenu}を含む確定専用`
        : effect.requiresFavorite
          ? '大好物メニューを含む確定専用'
          : effect.lvMin !== undefined
            ? `LV${effect.lvMin}以上限定`
            : effect.lvMax !== undefined
              ? `LV${effect.lvMax}以下限定`
              : null;
      return `${cond ? `${cond}: ` : ''}確定ロールに${range}`;
    }
    case 'FLOOR_ZERO':
      return '保険: ロール合計が0未満なら0に引き上げ';
    case 'SYNERGY_DOUBLE':
      return '大好物シナジー発動時にボーナス2倍(不発なら効果なし)';
    case 'DECAY_SHIELD':
      return `使った瞬間から減衰を${effect.races}レース分無効`;
    case 'GROUP_PREP':
      return `${GROUP_JA[effect.group] ?? effect.group}への備え — 的中で軸${sign(effect.hit)}へ / 外れは${sign(effect.miss)}へ`;
    case 'PINPOINT_PREP':
      return `${CONDITION_JA[effect.condition] ?? effect.condition}だけに備える — 的中で軸${sign(effect.hit)}へ / 外れは${sign(effect.miss)}へ`;
    case 'DUAL_PREP':
      return `天候+馬場の両軸に備える(グループ選択) — 各軸 的中${sign(effect.hit)}へ / 外れ${sign(effect.miss)}へ`;
    case 'DUAL_FLOOR':
      return '両軸の適性を0未満にしない保険(的中も外れもない)';
  }
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
  /** カタログV2(レース単位化)のみ。 */
  slot?: 'MORNING' | 'NIGHT';
  usage_kind?: 'RACE' | 'TRAINING';
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
 * 公開された1日ぶんのレース条件(Decision 082)。
 * 天候×馬場×コース。レース後に確定・公開される。
 * 供給元は GET /api/v1/items/conditions。
 */
export interface DailyConditions {
  date: string;
  weather: string;
  track: string;
  surface: string;
  weather_ja: string;
  track_ja: string;
  surface_ja: string;
  night_name: string | null;
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
