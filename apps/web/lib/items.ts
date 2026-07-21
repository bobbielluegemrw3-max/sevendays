import { fill, type AppDict } from '@/lib/i18n-shared';

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

/** アイテム語彙の辞書(walletPage と同じく props で受け取る)。 */
export type ItemCopy = AppDict['items'];

export const itemClassLabel = (cls: 'TRAINING' | 'RACE', t: ItemCopy): string =>
  cls === 'TRAINING' ? t.class_training : t.class_race;

const groupLabel = (group: string, t: ItemCopy): string =>
  group === 'RAIN_GROUP' ? t.grp_rain
    : group === 'SUN_GROUP' ? t.grp_sun
      : group === 'MUD_GROUP' ? t.grp_mud
        : group === 'FIRM_GROUP' ? t.grp_firm
          : group;

const conditionLabel = (cond: string, t: ItemCopy): string => {
  switch (cond) {
    case 'SUNNY': return t.cond_sunny;
    case 'CLOUDY': return t.cond_cloudy;
    case 'RAIN': return t.cond_rain;
    case 'STORM': return t.cond_storm;
    case 'FAST': return t.cond_fast;
    case 'GOOD': return t.cond_good;
    case 'SOFT': return t.cond_soft;
    case 'HEAVY': return t.cond_heavy;
    default: return cond;
  }
};

/** アイテム名。DB は name_ja / name_en の2つしか持たないため、
 *  日本語以外は英語名に寄せる(zh/ko/ms の名称はデータ側の宿題)。 */
export const itemName = (item: { name_ja: string; name_en: string }, lang: string): string =>
  lang === 'ja' ? item.name_ja : item.name_en;

const sign = (n: number): string => (n >= 0 ? `+${n}` : String(n));

/** カタログV2の効果を正直な一行に(的中と外れを必ず併記 — R1)。 */
/** カード式選択(2026-07-19)用の超短縮効果表記。詳細は effectSummaryJa が担う。
    外れで下がる系は必ず外れも併記(R1: 正直表示)。 */
export function effectShort(effect: ItemEffectV3, t: ItemCopy): string {
  switch (effect.kind) {
    case 'BONUS': {
      const range = effect.min === effect.max ? sign(effect.min) : `${sign(effect.min)}〜${sign(effect.max)}`;
      return fill(t.short_bonus_tpl, { range });
    }
    case 'FLOOR_ZERO':
      return t.short_floor;
    case 'SYNERGY_DOUBLE':
      return t.short_synergy;
    case 'DECAY_SHIELD':
      return fill(t.short_shield_tpl, { n: effect.races });
    case 'GROUP_PREP':
    case 'PINPOINT_PREP':
      return fill(t.short_prep_tpl, { hit: sign(effect.hit), miss: sign(effect.miss) });
    case 'DUAL_PREP':
      return fill(t.short_dual_tpl, { hit: sign(effect.hit), miss: sign(effect.miss) });
    case 'DUAL_FLOOR':
      return t.short_dualfloor;
  }
}

export function effectSummary(effect: ItemEffectV3, t: ItemCopy): string {
  switch (effect.kind) {
    case 'BONUS': {
      const range = effect.min === effect.max ? sign(effect.min) : `${sign(effect.min)}〜${sign(effect.max)}`;
      const cond = effect.requiresMenu
        ? fill(t.sum_cond_menu_tpl, { menu: effect.requiresMenu })
        : effect.requiresFavorite
          ? t.sum_cond_favorite
          : effect.lvMin !== undefined
            ? fill(t.sum_cond_lvmin_tpl, { n: effect.lvMin })
            : effect.lvMax !== undefined
              ? fill(t.sum_cond_lvmax_tpl, { n: effect.lvMax })
              : '';
      return fill(t.sum_bonus_tpl, { cond, range });
    }
    case 'FLOOR_ZERO':
      return t.sum_floor;
    case 'SYNERGY_DOUBLE':
      return t.sum_synergy;
    case 'DECAY_SHIELD':
      return fill(t.sum_shield_tpl, { n: effect.races });
    case 'GROUP_PREP':
      return fill(t.sum_group_tpl, {
        group: groupLabel(effect.group, t), hit: sign(effect.hit), miss: sign(effect.miss),
      });
    case 'PINPOINT_PREP':
      return fill(t.sum_pinpoint_tpl, {
        cond: conditionLabel(effect.condition, t), hit: sign(effect.hit), miss: sign(effect.miss),
      });
    case 'DUAL_PREP':
      return fill(t.sum_dual_tpl, { hit: sign(effect.hit), miss: sign(effect.miss) });
    case 'DUAL_FLOOR':
      return t.sum_dualfloor;
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
