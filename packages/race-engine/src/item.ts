import {
  ITEM_SETTING_PROBABILITY_V1,
  applyItemSettingV1,
  computeItemEffectV1,
  type ItemEffectContext,
  type ItemEffectResult,
} from '@sevendays/domain';
import { unitFromParts } from './random.js';

/**
 * Daily item setting (設定1〜6, Decision 078): the ONLY day-to-day variation
 * of item effectiveness, derived from the committed race seed exactly like
 * weather — unknown before the race, revealed and verifiable after.
 */
export function deriveItemSetting(raceSeed: string, raceEngineVersion: string): number {
  const u = unitFromParts(raceSeed, raceEngineVersion, 'item_setting');
  let cumulative = 0;
  for (let setting = 1; setting <= ITEM_SETTING_PROBABILITY_V1.length; setting += 1) {
    cumulative += Number(ITEM_SETTING_PROBABILITY_V1[setting - 1]);
    if (u < cumulative) return setting;
  }
  return ITEM_SETTING_PROBABILITY_V1.length;
}

/**
 * Resolve an applied item into its frozen snapshot values: raw public rule
 * (item_policy_v1.0) x today's setting coefficient. Returns zeros for null.
 */
export function resolveItemEffect(
  itemKey: string | null,
  ctx: ItemEffectContext,
  setting: number,
): ItemEffectResult {
  if (itemKey === null) {
    return { itemPoints: 0, randomShift: 0, conditionDelta: 0, fatigueDelta: 0 };
  }
  return applyItemSettingV1(computeItemEffectV1(itemKey, ctx), setting);
}
