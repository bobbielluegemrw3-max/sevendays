import { describe, expect, it } from 'vitest';
import { applyDecayV2, applyTotalValueGainV2, resolveTrainingRollV3, trainingDecayShieldRacesV3 } from '../src/index.js';
import { TRAINING_MENU_BY_KEY_V3, type TrainingMenuV3 } from '@sevendays/domain';

/**
 * V3 調教ロール(§13 決定2)。芯: ①好み/シナジー無し=EV平坦(同じ馬でも大好物ボーナス無し)
 * ②メニューは公開レンジ内 ③調教アイテムGROWTHを合算 ④REST=0+減衰無効 ⑤決定論。
 */

const seed = (n: number) => `horse-${n}:2036-04-01:NIGHT:nonce${n}`;

describe('resolveTrainingRollV3 — 決定論・公開レンジ', () => {
  it('is deterministic for the same seed+menus', () => {
    const a = resolveTrainingRollV3({ menus: ['HILL', 'POOL'], rollSeed: seed(1) });
    const b = resolveTrainingRollV3({ menus: ['HILL', 'POOL'], rollSeed: seed(1) });
    expect(a).toEqual(b);
  });

  it('keeps every non-REST roll inside its published range', () => {
    for (let i = 0; i < 500; i++) {
      const menus: TrainingMenuV3[] = ['HILL', 'SPAR'];
      const r = resolveTrainingRollV3({ menus, rollSeed: seed(i) });
      for (const pm of r.perMenu) {
        if (pm.menu === 'REST') continue;
        const spec = TRAINING_MENU_BY_KEY_V3.get(pm.menu)!;
        expect(pm.roll).toBeGreaterThanOrEqual(spec.min);
        expect(pm.roll).toBeLessThanOrEqual(spec.max);
      }
    }
  });

  it('rejects 0 or >2 menus', () => {
    expect(() => resolveTrainingRollV3({ menus: [], rollSeed: seed(1) })).toThrow(/TRAINING_COMBO_INVALID/);
    expect(() => resolveTrainingRollV3({ menus: ['HILL', 'POOL', 'WOOD'], rollSeed: seed(1) })).toThrow(
      /TRAINING_COMBO_INVALID/,
    );
  });
});

describe('EV平坦化 — 好み/シナジーの引退(§13 決定2)', () => {
  it('has no synergy field and no preference skew — non-REST menus share the same mean', () => {
    // 5000サンプルで各メニューの平均ロールを測る。好み補正が無ければ全メニューの平均は
    // レンジ中点(=EV均等)に収束し、メニュー間で差が出ない(SPARだけ分散が広い)。
    const means: Record<string, { sum: number; n: number; min: number; max: number }> = {};
    const menus: TrainingMenuV3[] = ['HILL', 'POOL', 'WOOD', 'GATE', 'SPAR'];
    for (let i = 0; i < 5000; i++) {
      const m = menus[i % menus.length]!;
      const r = resolveTrainingRollV3({ menus: [m], rollSeed: seed(i) });
      const roll = r.perMenu[0]!.roll;
      const acc = (means[m] ??= { sum: 0, n: 0, min: 99, max: -99 });
      acc.sum += roll; acc.n += 1; acc.min = Math.min(acc.min, roll); acc.max = Math.max(acc.max, roll);
      // ★シナジーは存在しない
      expect((r as unknown as { synergy?: number }).synergy).toBeUndefined();
    }
    // HILL/POOL/WOOD/GATE(EV均等・低分散)は平均が互いに近い(±0.15)
    const flat = ['HILL', 'POOL', 'WOOD', 'GATE'].map((m) => means[m]!.sum / means[m]!.n);
    for (const avg of flat) expect(avg).toBeCloseTo(flat[0]!, 1);
    // SPAR は分散が広い(0〜5)= 博打の風味
    expect(means.SPAR!.max - means.SPAR!.min).toBeGreaterThan(means.HILL!.max - means.HILL!.min);
  });
});

describe('REST と 調教アイテム', () => {
  it('REST rolls 0 and negates decay', () => {
    const r = resolveTrainingRollV3({ menus: ['REST'], rollSeed: seed(1) });
    expect(r.perMenu[0]!.roll).toBe(0);
    expect(r.restsDecay).toBe(true);
    const r2 = resolveTrainingRollV3({ menus: ['HILL', 'REST'], rollSeed: seed(2) });
    expect(r2.restsDecay).toBe(true);
  });

  it('folds a TRAINING GROWTH item into delta', () => {
    const base = resolveTrainingRollV3({ menus: ['HILL', 'POOL'], rollSeed: seed(3) });
    const withItem = resolveTrainingRollV3({ menus: ['HILL', 'POOL'], trainingItemKey: 'feed_l', rollSeed: seed(3) });
    // 同シードなのでメニューロールは同じ・itemBonus だけ増える
    expect(withItem.itemBonus).toBeGreaterThan(0);
    expect(withItem.delta).toBeCloseTo(base.delta + withItem.itemBonus, 5);
    // feed_l は +2.5〜3.5(§14.5・throttle内)
    expect(withItem.itemBonus).toBeGreaterThanOrEqual(2.5);
    expect(withItem.itemBonus).toBeLessThanOrEqual(3.5);
  });

  it('DECAY_SHIELD item adds no growth but grants shield races', () => {
    const r = resolveTrainingRollV3({ menus: ['HILL'], trainingItemKey: 'shield_3', rollSeed: seed(4) });
    expect(r.itemBonus).toBe(0); // 減衰よけは total_value を伸ばさない
    expect(trainingDecayShieldRacesV3('shield_3')).toBe(3);
    expect(trainingDecayShieldRacesV3('feed_l')).toBe(0); // GROWTH は shield ではない
    expect(trainingDecayShieldRacesV3(null)).toBe(0);
  });

  it('rejects an unknown/non-training item', () => {
    expect(() => resolveTrainingRollV3({ menus: ['HILL'], trainingItemKey: 'turf_shoes_strong', rollSeed: seed(5) })).toThrow(
      /TRAINING_ITEM_UNKNOWN/,
    );
  });
});

describe('聖杯 throttle — 毎走の実効ゲインが +4 に収まる(§15)', () => {
  it('best combo (SPAR max + feed_xl max) delta stays around the +4/走 ceiling region', () => {
    // 最良の伸びでも「毎走 +4 相当」に収まる設計(90+到達は稀・§14.7)。
    // SPAR max 5 は高分散の上限だが期待は2.5。ここでは feed_xl(+3〜4)の上限を確認。
    let maxItem = 0;
    for (let i = 0; i < 3000; i++) {
      const r = resolveTrainingRollV3({ menus: ['REST'], trainingItemKey: 'feed_xl', rollSeed: seed(i) });
      maxItem = Math.max(maxItem, r.itemBonus);
    }
    expect(maxItem).toBeLessThanOrEqual(4.0); // 調教アイテム単体の上乗せは +4 天井(§14.7)
  });
});

describe('総合値の変動は V2 と共有(骨格不変 §9)', () => {
  it('reuses applyTotalValueGainV2 / applyDecayV2 (softcap 85, decay 2.0)', () => {
    expect(applyTotalValueGainV2(84, 4)).toBe(86.5); // 84+1(85到達) + 3×0.5
    expect(applyDecayV2(60, false)).toBe(58);
    expect(applyDecayV2(60, true)).toBe(60);
  });
});
