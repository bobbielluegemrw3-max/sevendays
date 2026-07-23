import {
  ITEM_BY_KEY_V4,
  TRAINING_COMBO_SIZE_V3,
  TRAINING_MENU_BY_KEY_V3,
  menusNegateDecayV3,
  type TrainingEffectV4,
  type TrainingMenuV3,
} from '@sevendays/domain';
import { round2, uniformInRange, unitFromParts } from '../random.js';

/**
 * ============================================================================
 * エンジンV3 — 調教ロール(TRAINING_APTITUDE_REDESIGN.md §13 決定2 / §4)
 * ============================================================================
 * V2 との違い(§13 決定2「好みシステムを条件適性に一本化」):
 *  - **好み/シナジー/苦手を引退**(PREFERENCE_LAW / SYNERGY / DISLIKE は使わない)。
 *    どのメニューも成長は均等(EV平坦化=HILL一択の根治)。SPAR のみ高分散を風味として残す。
 *  - メニューは「どの条件に備えるか」を選ぶ手段(成長は付随)。条件適性は別レイヤー(v3.ts)。
 *  - 調教アイテム(V4 TRAINING GROWTH)を確定ロールに合算(total_value へ・§7.5.12/§14.5)。
 *
 * total_value の変動(ソフトキャップ85 / 減衰2.0 / 0-100クランプ)は V2 と同一(骨格不変 §9)。
 * → **`applyTotalValueGainV2` / `applyDecayV2` をそのまま使う**(v2/total-value.ts・重複させない)。
 * すべて純関数・決定論(確定の瞬間に呼ぶ・Decision 112: ロールは確定時に total_value へ反映)。
 */

export interface TrainingRollInputV3 {
  /** 選んだメニュー(1〜2個・同一2回可)。 */
  menus: readonly TrainingMenuV3[];
  /** 調教アイテム(V4 TRAINING・任意)。GROWTH のみ total_value に合流(DECAY_SHIELD は別処理)。 */
  trainingItemKey?: string | null;
  /** 確定の一意性を担うシード(例: `${horseId}:${batchDate}:${slot}:${confirmNonce}`)。 */
  rollSeed: string;
}

export interface TrainingRollResultV3 {
  perMenu: { menu: TrainingMenuV3; roll: number }[];
  /** 調教アイテムの上乗せ(なければ 0)。 */
  itemBonus: number;
  /** perMenu合計 + itemBonus(減衰・キャップ適用前の生デルタ)。 */
  delta: number;
  /** RESTを含む=このレースの減衰を1回無効化。 */
  restsDecay: boolean;
}

/**
 * V3 調教ロール — EV平坦・好み無し。各メニューは公開レンジ内で一様ロール(SPARは広い)。
 * 調教アイテム(GROWTH)を同じ確定で合算。DECAY_SHIELD は total_value に効かない(別途 horses.decay_shield)。
 */
export function resolveTrainingRollV3(input: TrainingRollInputV3): TrainingRollResultV3 {
  if (input.menus.length < 1 || input.menus.length > TRAINING_COMBO_SIZE_V3) {
    throw new Error(`TRAINING_COMBO_INVALID: choose 1..${TRAINING_COMBO_SIZE_V3} menus`);
  }
  const perMenu: { menu: TrainingMenuV3; roll: number }[] = [];

  input.menus.forEach((menu, i) => {
    const spec = TRAINING_MENU_BY_KEY_V3.get(menu);
    if (!spec) throw new Error(`TRAINING_MENU_UNKNOWN: ${menu}`);
    // REST は成長0(減衰無効の守り)。他は公開レンジで一様(好み補正なし=平坦)。
    if (menu === 'REST') {
      perMenu.push({ menu, roll: 0 });
      return;
    }
    const u = unitFromParts(input.rollSeed, 'train-v3', String(i), menu);
    perMenu.push({ menu, roll: round2(uniformInRange(u, spec.min, spec.max)) });
  });

  let itemBonus = 0;
  if (input.trainingItemKey) {
    const def = ITEM_BY_KEY_V4.get(input.trainingItemKey);
    if (!def || def.itemClass !== 'TRAINING') {
      throw new Error(`TRAINING_ITEM_UNKNOWN: ${input.trainingItemKey}`);
    }
    const eff = def.effect as TrainingEffectV4;
    if (eff.kind === 'GROWTH') {
      const u = unitFromParts(input.rollSeed, 'train-v3', 'item', input.trainingItemKey);
      itemBonus = round2(uniformInRange(u, eff.min, eff.max));
    }
    // DECAY_SHIELD は total_value に効かない(horses.decay_shield_v2 を別途 +races・確定時に付与)。
  }

  const delta = round2(perMenu.reduce((s, m) => s + m.roll, 0) + itemBonus);
  return { perMenu, itemBonus, delta, restsDecay: menusNegateDecayV3(input.menus) };
}

/** 調教アイテムが DECAY_SHIELD の場合の付与レース数(0=非対象)。 */
export function trainingDecayShieldRacesV3(trainingItemKey: string | null | undefined): number {
  if (!trainingItemKey) return 0;
  const def = ITEM_BY_KEY_V4.get(trainingItemKey);
  if (!def || def.itemClass !== 'TRAINING') return 0;
  const eff = def.effect as TrainingEffectV4;
  return eff.kind === 'DECAY_SHIELD' ? eff.races : 0;
}
