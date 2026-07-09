import {
  applyItemConditionsV2,
  computeItemEffectV2,
  type ItemEffectContext,
  type ItemEffectResult,
  type RaceConditions,
} from '@sevendays/domain';

/**
 * Item resolution v2 (Decision 082): the daily variation of item
 * effectiveness comes from tonight's RACE CONDITIONS (weather x track x
 * surface) against each item's public affinity — derived from the committed
 * race seed exactly like weather, unknown before the race, revealed and
 * verifiable after. (v1's abstract 設定1〜6 is retired.)
 */
export function resolveItemEffect(
  itemKey: string | null,
  ctx: ItemEffectContext,
  conditions: RaceConditions,
): ItemEffectResult {
  if (itemKey === null) {
    return { itemPoints: 0, randomShift: 0, conditionDelta: 0, fatigueDelta: 0 };
  }
  return applyItemConditionsV2(itemKey, computeItemEffectV2(itemKey, ctx), conditions);
}
