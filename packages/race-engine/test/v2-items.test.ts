import { describe, expect, it } from 'vitest';
import {
  resolveTrainingItemV3,
  resolveTrainingRollV2,
  trainingItemEligibilityV3,
  hiddenPreferencesV2,
} from '../src/index.js';
import { ITEM_BY_KEY_V3, type TrainingEffectV3 } from '@sevendays/domain';

/**
 * TRAINING系アイテムのロール(カタログV2 / item_policy_v3.0・Decision 109)。
 * 決定論・公開レンジ遵守・適格性ゲート・保険/シナジー算術。
 */

const CTX_BASE = {
  menus: ['HILL', 'GATE'] as const,
  favoriteMenu: 'HILL' as const,
  lv: 3,
  roll: { delta: 4.5, synergy: 1.5 },
};

describe('training item rolls (item_policy_v3.0)', () => {
  it('BONUS rolls are deterministic for the same seed and stay inside the public range', () => {
    for (const key of ['carrot_cube', 'highland_hay', 'protein_mash', 'royal_banquet', 'awakening_elixir']) {
      const effect = ITEM_BY_KEY_V3.get(key)!.effect as Extract<TrainingEffectV3, { kind: 'BONUS' }>;
      const a = resolveTrainingItemV3(key, 'horse-1:2036-01-05:NIGHT', CTX_BASE);
      const b = resolveTrainingItemV3(key, 'horse-1:2036-01-05:NIGHT', CTX_BASE);
      expect(a.itemBonus).toBe(b.itemBonus);
      expect(a.itemBonus).toBeGreaterThanOrEqual(effect.min);
      expect(a.itemBonus).toBeLessThanOrEqual(effect.max);
      // 別サイクルは別ロール(固定値アイテム以外)
      if (effect.min !== effect.max) {
        const rolls = new Set(
          Array.from({ length: 40 }, (_, i) =>
            resolveTrainingItemV3(key, `horse-1:2036-01-05:NIGHT:${i}`, CTX_BASE).itemBonus,
          ),
        );
        expect(rolls.size).toBeGreaterThan(5);
      }
    }
  });

  it('menu-specific boosters refuse a combo without their menu', () => {
    expect(trainingItemEligibilityV3('pool_float', CTX_BASE)).toEqual({
      ok: false,
      reason: 'ITEM_V3_MENU_MISMATCH',
    });
    expect(trainingItemEligibilityV3('hill_manual', CTX_BASE).ok).toBe(true);
    expect(() => resolveTrainingItemV3('pool_float', 'seed', CTX_BASE)).toThrow('ITEM_V3_MENU_MISMATCH');
  });

  it('LV gates: foal milk is young-only, elder blanket is LV4+', () => {
    expect(trainingItemEligibilityV3('foal_milk', { ...CTX_BASE, lv: 1 }).ok).toBe(true);
    expect(trainingItemEligibilityV3('foal_milk', { ...CTX_BASE, lv: 2 }).ok).toBe(false);
    expect(trainingItemEligibilityV3('elder_blanket', { ...CTX_BASE, lv: 4 }).ok).toBe(true);
    expect(trainingItemEligibilityV3('elder_blanket', { ...CTX_BASE, lv: 3 }).ok).toBe(false);
  });

  it('roar soul requires the favorite menu in the combo (burn-drop meta reward)', () => {
    expect(trainingItemEligibilityV3('roar_soul', CTX_BASE).ok).toBe(true);
    expect(
      trainingItemEligibilityV3('roar_soul', { ...CTX_BASE, favoriteMenu: 'POOL' }).ok,
    ).toBe(false);
  });

  it('FLOOR_ZERO pays exactly the shortfall below zero, else nothing', () => {
    const sunk = resolveTrainingItemV3('masters_eye', 'seed', {
      ...CTX_BASE,
      roll: { delta: -3.2, synergy: 0 },
    });
    expect(sunk.itemBonus).toBe(3.2);
    const fine = resolveTrainingItemV3('masters_eye', 'seed', CTX_BASE);
    expect(fine.itemBonus).toBe(0);
  });

  it('SYNERGY_DOUBLE adds the synergy again only when it fired', () => {
    const fired = resolveTrainingItemV3('synergy_incense', 'seed', CTX_BASE);
    expect(fired.itemBonus).toBe(1.5);
    const silent = resolveTrainingItemV3('synergy_incense', 'seed', {
      ...CTX_BASE,
      roll: { delta: 2.0, synergy: 0 },
    });
    expect(silent.itemBonus).toBe(0);
  });

  it('decay shield cannot be attached to a training confirm (instant apply only)', () => {
    expect(trainingItemEligibilityV3('aeon_sand', CTX_BASE).ok).toBe(false);
    expect(() => resolveTrainingItemV3('aeon_sand', 'seed', CTX_BASE)).toThrow('ITEM_V3_INSTANT_ONLY');
  });

  it('integrates with the real training roll: item bonus rides on top of the same cycle seed', () => {
    const dnaHash = 'a'.repeat(64);
    const prefs = hiddenPreferencesV2(dnaHash, 'SPRINTER');
    const roll = resolveTrainingRollV2({
      dnaHash,
      horseType: 'SPRINTER',
      menus: [prefs.favorite, 'GATE'],
      rollSeed: 'horse-9:2036-02-02:MORNING',
    });
    const item = resolveTrainingItemV3('royal_banquet', 'horse-9:2036-02-02:MORNING', {
      menus: [prefs.favorite, 'GATE'],
      favoriteMenu: prefs.favorite,
      lv: 2,
      roll: { delta: roll.delta, synergy: roll.synergy },
    });
    expect(item.itemBonus).toBeGreaterThanOrEqual(3);
    expect(item.itemBonus).toBeLessThanOrEqual(5);
    // 総合値ゲイン = 調教delta + アイテムbonus(エンジン側で合算・ソフトキャップに服する)
    expect(Number.isFinite(roll.delta + item.itemBonus)).toBe(true);
  });
});
