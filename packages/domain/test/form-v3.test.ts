import { describe, expect, it } from 'vitest';
import {
  aggregateVerdictV3,
  conditionGroupLabelV3,
  readAxisV3,
  readFormV3,
  runMatchCountV3,
  runMatchFlagsV3,
  runPerformanceV3,
  type FormRunV3,
} from '../src/index.js';

/**
 * 馬柱の読解(§3/§12.3-b)。芯: ①予報一致走だけを抜き出す ②2走未満は unknown
 * (機械が断定しない=決定論でない) ③隠れた適性値は一切出さない(パターンだけ)。
 */

// 道悪(SOFT/HEAVY)で強い・良馬場で弱い馬の馬柱
const mudLover: FormRunV3[] = [
  { weather: 'RAIN', track: 'HEAVY', surface: 'TURF', rank: 2, entrants: 38 }, // 道悪で好走
  { weather: 'SUNNY', track: 'GOOD', surface: 'TURF', rank: 30, entrants: 38 }, // 良馬場で凡走
  { weather: 'STORM', track: 'SOFT', surface: 'DIRT', rank: 3, entrants: 36 }, // 道悪で好走
  { weather: 'CLOUDY', track: 'FAST', surface: 'TURF', rank: 28, entrants: 40 }, // 良馬場で凡走
  { weather: 'RAIN', track: 'SOFT', surface: 'DIRT', rank: 5, entrants: 34 }, // 道悪で好走
];

describe('runPerformanceV3', () => {
  it('maps 1着→1, 最下位→0, 中位→~0.5', () => {
    expect(runPerformanceV3({ rank: 1, entrants: 10 })).toBe(1);
    expect(runPerformanceV3({ rank: 10, entrants: 10 })).toBe(0);
    expect(runPerformanceV3({ rank: 5, entrants: 9 })).toBeCloseTo(0.5, 5);
    expect(runPerformanceV3({ rank: 1, entrants: 1 })).toBe(0.5); // 判定不能
  });
});

describe('readAxisV3 — 予報一致走の抽出', () => {
  it('extracts only the runs whose axis pole matches tonight (道悪の夜 → 道悪の過去走)', () => {
    const r = readAxisV3(mudLover, 'track', 'HEAVY'); // 今夜は道悪
    expect(r.pole).toBe(1);
    expect(r.matched).toHaveLength(3); // HEAVY/SOFT の3走だけ
    expect(r.matched.every((m) => ['SOFT', 'HEAVY'].includes(m.track))).toBe(true);
    expect(r.hint).toBe('strong'); // 道悪では好走 → 得意そう
  });

  it('reads the opposite pole as weak (良馬場の夜 → 良馬場の過去走は凡走)', () => {
    const r = readAxisV3(mudLover, 'track', 'FAST'); // 今夜は良馬場
    expect(r.pole).toBe(-1);
    expect(r.matched.every((m) => ['FAST', 'GOOD'].includes(m.track))).toBe(true);
    expect(r.hint).toBe('weak');
  });

  it('returns unknown when fewer than 2 matching runs (機械は断定しない・§12.3)', () => {
    const scant: FormRunV3[] = [{ weather: 'RAIN', track: 'HEAVY', surface: 'TURF', rank: 1, entrants: 30 }];
    const r = readAxisV3(scant, 'track', 'SOFT');
    expect(r.matched).toHaveLength(1);
    expect(r.hint).toBe('unknown');
  });

  it('returns unknown/empty when no matching runs', () => {
    const r = readAxisV3([], 'weather', 'RAIN');
    expect(r.matched).toHaveLength(0);
    expect(r.performance).toBeNull();
    expect(r.hint).toBe('unknown');
  });
});

describe('readFormV3 — 3軸まとめ', () => {
  it('reads all three axes independently for tonight’s forecast', () => {
    const reading = readFormV3(mudLover, { weather: 'RAIN', track: 'HEAVY', surface: 'TURF' });
    expect(reading.track.hint).toBe('strong'); // 道悪巧者が見える
    expect(reading.weather.axis).toBe('weather');
    expect(reading.surface.axis).toBe('surface');
    // どの軸も matched は入力の部分集合
    for (const axis of ['weather', 'track', 'surface'] as const) {
      expect(reading[axis].matched.length).toBeLessThanOrEqual(mudLover.length);
    }
  });

  it('never leaks the hidden aptitude value — only ranks/hints are exposed', () => {
    const reading = readFormV3(mudLover, { weather: 'RAIN', track: 'HEAVY', surface: 'TURF' });
    // AxisReading は matched(実着順)/performance/hint のみ。適性の生値フィールドは無い
    expect(Object.keys(reading.track).sort()).toEqual(['axis', 'hint', 'matched', 'performance', 'pole']);
  });
});

describe('条件名ラベル(6条件・§2)', () => {
  it('labels each axis/pole with the player-facing condition name', () => {
    expect(conditionGroupLabelV3('weather', 1)).toBe('雨');
    expect(conditionGroupLabelV3('weather', -1)).toBe('晴');
    expect(conditionGroupLabelV3('track', 1)).toBe('道悪');
    expect(conditionGroupLabelV3('track', -1)).toBe('良馬場');
    expect(conditionGroupLabelV3('surface', 1)).toBe('芝');
    expect(conditionGroupLabelV3('surface', -1)).toBe('ダート');
  });
});

describe('表示層の確定仕様 — 一致フラグ / 総合判定(デザインから委譲・§6)', () => {
  const tonight = { weather: 'RAIN' as const, track: 'SOFT' as const, surface: 'TURF' as const };

  it('runMatchFlagsV3: 各軸で今夜と同じ側かを返す', () => {
    // 嵐(雨側)・不良(道悪側)・芝 は 今夜(雨・道悪・芝)と全軸一致
    const f = runMatchFlagsV3({ weather: 'STORM', track: 'HEAVY', surface: 'TURF', rank: 1, entrants: 30 }, tonight);
    expect(f).toEqual({ weather: true, track: true, surface: true });
    // 晴(晴側)・高速(良側)・ダート は 全軸不一致
    const g = runMatchFlagsV3({ weather: 'SUNNY', track: 'FAST', surface: 'DIRT', rank: 1, entrants: 30 }, tonight);
    expect(g).toEqual({ weather: false, track: false, surface: false });
  });

  it('runMatchCountV3: 一致軸数(2以上で根拠行)', () => {
    expect(runMatchCountV3({ weather: 'STORM', track: 'HEAVY', surface: 'TURF', rank: 1, entrants: 30 }, tonight)).toBe(3);
    expect(runMatchCountV3({ weather: 'RAIN', track: 'FAST', surface: 'DIRT', rank: 1, entrants: 30 }, tonight)).toBe(1);
    expect(runMatchCountV3({ weather: 'SUNNY', track: 'FAST', surface: 'DIRT', rank: 1, entrants: 30 }, tonight)).toBe(0);
  });

  it('aggregateVerdictV3: strong2軸以上→得意 / weak2軸以上→苦手 / 全unknown→まだ読めない', () => {
    const mk = (h: 'strong' | 'weak' | 'even' | 'unknown') => ({
      axis: 'weather' as const, pole: 1 as const, matched: [], performance: null, hint: h,
    });
    const strong = aggregateVerdictV3({ weather: mk('strong'), track: mk('strong'), surface: mk('even') });
    expect(strong.cls).toBe('strong');
    expect(strong.head).toBe('今夜は得意そうだ');
    expect(strong.mark).toBe('◎');
    expect(strong.strongAxes).toHaveLength(2);

    const weak = aggregateVerdictV3({ weather: mk('weak'), track: mk('weak'), surface: mk('strong') });
    expect(weak.cls).toBe('weak');
    expect(weak.head).toBe('今夜は苦手そう');

    const unknown = aggregateVerdictV3({ weather: mk('unknown'), track: mk('unknown'), surface: mk('unknown') });
    expect(unknown.cls).toBe('unknown');
    expect(unknown.mark).toBe('—');

    // 拮抗(strong1/weak1/even1)は五分に倒す・断定しない(R1)
    const even = aggregateVerdictV3({ weather: mk('strong'), track: mk('weak'), surface: mk('even') });
    expect(even.cls).toBe('even');
  });

  it('道悪巧者の馬柱で総合判定が strong(得意)になる(統合)', () => {
    const reading = readFormV3(mudLover, { weather: 'RAIN', track: 'SOFT', surface: 'TURF' });
    const v = aggregateVerdictV3(reading);
    expect(['strong', 'even']).toContain(v.cls); // 少なくとも苦手ではない
    expect(v.mark).not.toBe('▲');
  });
});
