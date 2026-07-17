import {
  ITEM_BY_KEY_V3,
  type ItemDefinitionV3,
  type TrainingEffectV3,
  type TrainingMenuV2,
} from '@sevendays/domain';
import { round2, uniformInRange, unitFromParts } from '../random.js';

/**
 * TRAINING系アイテムのロール(カタログV2 / item_policy_v3.0・Decision 109)。
 * 確定の瞬間に調教ロールと同時に解決する(Decision 107: 確定即最終 — アイテムも同じ)。
 * シードは調教ロールと同じ決定論基盤(馬×サイクル)+アイテムキー — リトライ同一結果。
 */

export interface TrainingItemContextV3 {
  /** 確定した調教のメニュー(1〜2)。 */
  menus: readonly TrainingMenuV2[];
  /** 馬の大好物(hiddenPreferencesV2 から)。 */
  favoriteMenu: TrainingMenuV2;
  /** 馬のLV(current_day 0〜6)。 */
  lv: number;
  /** 調教ロールの結果(delta = perMenu合計+シナジー・synergy = シナジー分)。 */
  roll: { delta: number; synergy: number };
}

export interface TrainingItemResultV3 {
  /** アイテムによる追加デルタ(調教deltaに加算して総合値ゲインになる)。 */
  itemBonus: number;
  /** 表示用の内訳種別。 */
  kind: TrainingEffectV3['kind'];
}

/**
 * 添付可否の検証(APIが確定前に呼ぶ — 不適合は添付を拒否して在庫を守る)。
 * DECAY_SHIELD は調教添付ではなく即時適用なのでここでは常に不可。
 */
export function trainingItemEligibilityV3(
  itemKey: string,
  ctx: Pick<TrainingItemContextV3, 'menus' | 'favoriteMenu' | 'lv'>,
): { ok: boolean; reason?: string } {
  const def = requireTrainingItem(itemKey);
  const effect = def.effect as TrainingEffectV3;
  if (effect.kind === 'DECAY_SHIELD') return { ok: false, reason: 'ITEM_V3_INSTANT_ONLY' };
  if (effect.kind === 'BONUS') {
    if (effect.requiresMenu && !ctx.menus.includes(effect.requiresMenu)) {
      return { ok: false, reason: 'ITEM_V3_MENU_MISMATCH' };
    }
    if (effect.requiresFavorite && !ctx.menus.includes(ctx.favoriteMenu)) {
      return { ok: false, reason: 'ITEM_V3_FAVORITE_REQUIRED' };
    }
    if (effect.lvMin !== undefined && ctx.lv < effect.lvMin) {
      return { ok: false, reason: 'ITEM_V3_LV_TOO_LOW' };
    }
    if (effect.lvMax !== undefined && ctx.lv > effect.lvMax) {
      return { ok: false, reason: 'ITEM_V3_LV_TOO_HIGH' };
    }
  }
  return { ok: true };
}

/**
 * アイテムボーナスの解決(確定の瞬間・調教ロール確定後に呼ぶ)。
 *  - BONUS: 公開レンジの一様ロール(下振れなし)
 *  - FLOOR_ZERO: ロール合計が負なら0へ引き上げた差分
 *  - SYNERGY_DOUBLE: シナジー発動時にシナジー分をもう一度加算
 * rollSeed は調教確定と同じ形(`{horseId}:{date}:{slot}`)を渡す。
 */
export function resolveTrainingItemV3(
  itemKey: string,
  rollSeed: string,
  ctx: TrainingItemContextV3,
): TrainingItemResultV3 {
  const def = requireTrainingItem(itemKey);
  const effect = def.effect as TrainingEffectV3;
  const eligibility = trainingItemEligibilityV3(itemKey, ctx);
  if (!eligibility.ok) {
    throw new Error(`${eligibility.reason ?? 'ITEM_V3_NOT_ELIGIBLE'}: ${itemKey}`);
  }

  switch (effect.kind) {
    case 'BONUS': {
      const u = unitFromParts(rollSeed, 'item-v3', itemKey);
      return { kind: 'BONUS', itemBonus: round2(uniformInRange(u, effect.min, effect.max)) };
    }
    case 'FLOOR_ZERO': {
      return { kind: 'FLOOR_ZERO', itemBonus: ctx.roll.delta < 0 ? round2(-ctx.roll.delta) : 0 };
    }
    case 'SYNERGY_DOUBLE': {
      return { kind: 'SYNERGY_DOUBLE', itemBonus: ctx.roll.synergy > 0 ? round2(ctx.roll.synergy) : 0 };
    }
    case 'DECAY_SHIELD':
      throw new Error(`ITEM_V3_INSTANT_ONLY: ${itemKey} is applied instantly, not at training confirm`);
  }
}

function requireTrainingItem(itemKey: string): ItemDefinitionV3 {
  const def = ITEM_BY_KEY_V3.get(itemKey);
  if (!def || def.itemClass !== 'TRAINING') {
    throw new Error(`ITEM_V3_UNKNOWN_TRAINING_ITEM: ${itemKey}`);
  }
  return def;
}
