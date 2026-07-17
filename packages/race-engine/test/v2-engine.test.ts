import { describe, expect, it } from 'vitest';
import {
  applyDecayV2,
  applyTotalValueGainV2,
  computeScoreV2,
  hiddenPreferencesV2,
  mintTotalValueV2,
  resolveTrainingRollV2,
} from '../src/index.js';
import {
  DISLIKE_EXTRA_DOWNSIDE_V2,
  PREFERENCE_LAW_V2,
  PREFERENCE_TYPE_CORRELATION_V2,
  TOTAL_VALUE_V2,
  TRAINING_MENU_BY_KEY_V2,
  type HorseType,
  type TrainingMenuV2,
} from '@sevendays/domain';

/** エンジンV2 純関数層(Decision 101/104)。決定論・レンジ・法則の統計を検証する。 */

const dna = (n: number) => n.toString(16).padStart(64, 'a');

describe('mintTotalValueV2', () => {
  it('決定論・40〜75の範囲', () => {
    for (let i = 0; i < 2000; i++) {
      const v = mintTotalValueV2([`seed-${i}`, 'horse']);
      expect(v).toBeGreaterThanOrEqual(TOTAL_VALUE_V2.mintMin);
      expect(v).toBeLessThanOrEqual(TOTAL_VALUE_V2.mintMax);
      expect(v).toBe(mintTotalValueV2([`seed-${i}`, 'horse'])); // 再現性
    }
  });
});

describe('hiddenPreferencesV2', () => {
  it('決定論で、大好物≠苦手・RESTは対象外', () => {
    for (let i = 0; i < 500; i++) {
      const p = hiddenPreferencesV2(dna(i), 'SPRINTER');
      expect(p).toEqual(hiddenPreferencesV2(dna(i), 'SPRINTER'));
      expect(p.favorite).not.toBe(p.dislike);
      expect(p.favorite).not.toBe('REST');
      expect(p.dislike).not.toBe('REST');
    }
  });

  it('タイプ相関の法則: 約70%が法則集合から出る(Decision 104)', () => {
    const types: HorseType[] = ['SPRINTER', 'POWER', 'ENDURANCE', 'BALANCED', 'LUCK'];
    for (const type of types) {
      const law = PREFERENCE_LAW_V2[type];
      let inLaw = 0;
      const n = 4000;
      for (let i = 0; i < n; i++) {
        const p = hiddenPreferencesV2(dna(i * 7 + 1), type);
        if (law.includes(p.favorite)) inLaw++;
      }
      const ratio = inLaw / n;
      expect(ratio).toBeGreaterThan(PREFERENCE_TYPE_CORRELATION_V2 - 0.05);
      expect(ratio).toBeLessThan(PREFERENCE_TYPE_CORRELATION_V2 + 0.05);
    }
  });
});

describe('resolveTrainingRollV2', () => {
  it('決定論・公開レンジ順守(苦手は下限拡大まで許容)', () => {
    for (let i = 0; i < 1000; i++) {
      const input = {
        dnaHash: dna(i),
        horseType: 'POWER' as const,
        menus: ['HILL', 'SPAR'] as TrainingMenuV2[],
        rollSeed: `roll-${i}`,
      };
      const r = resolveTrainingRollV2(input);
      expect(r).toEqual(resolveTrainingRollV2(input)); // 再現性
      for (const m of r.perMenu) {
        const spec = TRAINING_MENU_BY_KEY_V2.get(m.menu)!;
        expect(m.roll).toBeGreaterThanOrEqual(spec.min - DISLIKE_EXTRA_DOWNSIDE_V2);
        expect(m.roll).toBeLessThanOrEqual(spec.max);
      }
    }
  });

  it('大好物込みコンボはシナジーが付き、平均が明確に高い', () => {
    let favSum = 0;
    let otherSum = 0;
    let favN = 0;
    let otherN = 0;
    for (let i = 0; i < 3000; i++) {
      const dnaHash = dna(i * 3 + 2);
      const prefs = hiddenPreferencesV2(dnaHash, 'SPRINTER');
      const others = (['HILL', 'POOL', 'GATE', 'WOOD'] as TrainingMenuV2[]).filter(
        (m) => m !== prefs.favorite && m !== prefs.dislike,
      );
      const fav = resolveTrainingRollV2({
        dnaHash, horseType: 'SPRINTER', menus: [prefs.favorite, prefs.favorite], rollSeed: `s-${i}`,
      });
      const other = resolveTrainingRollV2({
        dnaHash, horseType: 'SPRINTER', menus: [others[0]!, others[0]!], rollSeed: `s-${i}`,
      });
      expect(fav.synergy).toBeGreaterThan(0);
      expect(other.synergy).toBe(0);
      favSum += fav.delta; favN++;
      otherSum += other.delta; otherN++;
    }
    expect(favSum / favN).toBeGreaterThan(otherSum / otherN + 1.5);
  });

  it('RESTは減衰無効・ロール0。メニュー数は1〜2を強制', () => {
    const r = resolveTrainingRollV2({
      dnaHash: dna(9), horseType: 'LUCK', menus: ['REST'], rollSeed: 'r',
    });
    expect(r.restsDecay).toBe(true);
    expect(r.perMenu[0]!.roll).toBe(0);
    expect(() =>
      resolveTrainingRollV2({ dnaHash: dna(9), horseType: 'LUCK', menus: [], rollSeed: 'r' }),
    ).toThrow(/TRAINING_COMBO_INVALID/);
    expect(() =>
      resolveTrainingRollV2({
        dnaHash: dna(9), horseType: 'LUCK',
        menus: ['HILL', 'HILL', 'HILL'] as TrainingMenuV2[], rollSeed: 'r',
      }),
    ).toThrow(/TRAINING_COMBO_INVALID/);
  });
});

describe('applyTotalValueGainV2 / applyDecayV2', () => {
  it('ソフトキャップ85: 超過分の上昇は半減・0〜100クランプ', () => {
    expect(applyTotalValueGainV2(80, 4)).toBe(84);
    expect(applyTotalValueGainV2(80, 10)).toBe(87.5); // 85まで5+残り5×0.5
    expect(applyTotalValueGainV2(90, 6)).toBe(93); // 全量半減
    expect(applyTotalValueGainV2(99, 10)).toBe(100); // クランプ
    expect(applyTotalValueGainV2(50, -8)).toBe(42); // 下降はそのまま
    expect(applyTotalValueGainV2(3, -10)).toBe(0); // 下側クランプ
  });

  it('減衰2.0/レース・RESTで無効', () => {
    expect(applyDecayV2(60, false)).toBe(58);
    expect(applyDecayV2(60, true)).toBe(60);
    expect(applyDecayV2(1, false)).toBe(0);
  });
});

describe('computeScoreV2', () => {
  it('スコア=総合値+備え+運。決定論・レンジ強制', () => {
    const input = {
      horseUuid: '00000000-0000-4000-8000-0000000000aa',
      horseType: 'BALANCED' as const,
      totalValue: 72,
      conditionPrepModifier: 2.5,
      trained: true,
      raceSeed: 'race-seed-1',
      raceEngineVersion: 'race_v2.0',
    };
    const s = computeScoreV2(input);
    expect(s).toEqual(computeScoreV2(input));
    expect(s.luckModifier).toBeGreaterThanOrEqual(-3);
    expect(s.luckModifier).toBeLessThanOrEqual(3);
    expect(s.finalScore).toBeCloseTo(72 + 2.5 + s.luckModifier, 2);
    expect(() => computeScoreV2({ ...input, conditionPrepModifier: 9 })).toThrow(/MODIFIER_OUT_OF_RANGE/);
    expect(() => computeScoreV2({ ...input, totalValue: 120 })).toThrow(/MODIFIER_OUT_OF_RANGE/);
  });

  it('LUCK×調教済みは運レンジが−2〜+4に広がる(Decision 052/101)', () => {
    let seenAbove3 = false;
    for (let i = 0; i < 3000; i++) {
      const s = computeScoreV2({
        horseUuid: '00000000-0000-4000-8000-0000000000bb',
        horseType: 'LUCK',
        totalValue: 50,
        conditionPrepModifier: 0,
        trained: true,
        raceSeed: `seed-${i}`,
        raceEngineVersion: 'race_v2.0',
      });
      expect(s.luckModifier).toBeGreaterThanOrEqual(-2);
      expect(s.luckModifier).toBeLessThanOrEqual(4);
      if (s.luckModifier > 3) seenAbove3 = true;
    }
    expect(seenAbove3).toBe(true); // 通常レンジ(±3)を実際に超える
  });
});
