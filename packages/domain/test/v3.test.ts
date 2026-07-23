import { describe, expect, it } from 'vitest';
import {
  APTITUDE_LABELS_V3,
  AXIS_POSITIVE_MEMBERS_V3,
  CONDITION_AXES_V3,
  CONDITION_PREP_RANGE_V3,
  MENU_CONDITION_V3,
  RACE_ENGINE_V3_VERSION,
  SURFACES,
  TRACK_CONDITIONS,
  TRAINING_MENUS_V3,
  TRAINING_MENU_KEYS_V3,
  WEATHERS,
  aptitudeEdgeV3,
  composeConditionPrepV3,
  conditionPoleV3,
  deriveAptitudeV3,
  isRaceEngineV3,
  menusNegateDecayV3,
  trainingPrepEdgeV3,
  type RaceConditionsV3,
  type TrainingMenuV3,
} from '../src/index.js';

/**
 * V3 ドメイン核(TRAINING_APTITUDE_REDESIGN.md)。
 * 検証の芯: ①適性は dna から決定論・個体別 ②condition_prep は絶対に ±4 を超えない
 * (エンジンが例外を投げる境界) ③メニュー↔条件が1対1 ④EV平坦(HILL一択の根治)。
 */

const ALL_CONDITIONS: RaceConditionsV3[] = [];
for (const weather of WEATHERS)
  for (const track of TRACK_CONDITIONS)
    for (const surface of SURFACES) ALL_CONDITIONS.push({ weather, track, surface });

describe('V3 version gating', () => {
  it('recognises its own version and rejects V2', () => {
    expect(isRaceEngineV3(RACE_ENGINE_V3_VERSION)).toBe(true);
    expect(isRaceEngineV3('race_engine_v2.0')).toBe(false);
  });
});

describe('deriveAptitudeV3 — 個体別・決定論', () => {
  it('is deterministic for the same dna_hash', () => {
    const a = deriveAptitudeV3('deadbeefcafe');
    const b = deriveAptitudeV3('deadbeefcafe');
    expect(a).toEqual(b);
  });

  it('gives different horses different aptitudes (not type-fixed)', () => {
    const a = deriveAptitudeV3('0000aaaa');
    const b = deriveAptitudeV3('ffff5555');
    expect(a).not.toEqual(b);
  });

  it('stays within [-1, 1] on every axis across many dna hashes', () => {
    for (let i = 0; i < 2000; i++) {
      const apt = deriveAptitudeV3(`dna-${i}-${i * 7}`);
      for (const axis of CONDITION_AXES_V3) {
        expect(apt[axis]).toBeGreaterThanOrEqual(-1);
        expect(apt[axis]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is roughly centred (individual spread, no systemic bias)', () => {
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) sum += deriveAptitudeV3(`h${i}`).track;
    expect(Math.abs(sum / N)).toBeLessThan(0.05);
  });
});

describe('6条件モデル — 極性', () => {
  it('assigns +1 to 雨/道悪/芝 and −1 to 晴/良馬場/ダート', () => {
    expect(conditionPoleV3('weather', 'RAIN')).toBe(1);
    expect(conditionPoleV3('weather', 'STORM')).toBe(1);
    expect(conditionPoleV3('weather', 'SUNNY')).toBe(-1);
    expect(conditionPoleV3('weather', 'CLOUDY')).toBe(-1);
    expect(conditionPoleV3('track', 'SOFT')).toBe(1);
    expect(conditionPoleV3('track', 'HEAVY')).toBe(1);
    expect(conditionPoleV3('track', 'FAST')).toBe(-1);
    expect(conditionPoleV3('track', 'GOOD')).toBe(-1);
    expect(conditionPoleV3('surface', 'TURF')).toBe(1);
    expect(conditionPoleV3('surface', 'DIRT')).toBe(-1);
  });

  it('every weather/track value belongs to exactly one pole', () => {
    for (const w of WEATHERS) expect([-1, 1]).toContain(conditionPoleV3('weather', w));
    for (const t of TRACK_CONDITIONS) expect([-1, 1]).toContain(conditionPoleV3('track', t));
    // +極メンバーは各軸に必ず1つ以上(二極が成立している)
    expect(AXIS_POSITIVE_MEMBERS_V3.weather.length).toBeGreaterThan(0);
  });
});

describe('メニュー↔条件は1対1で6条件を覆う(§4)', () => {
  it('has 6 menus, each mapping to a distinct (axis,pole)', () => {
    expect(TRAINING_MENU_KEYS_V3).toHaveLength(6);
    const targets = new Set<string>();
    for (const key of TRAINING_MENU_KEYS_V3) {
      const m = MENU_CONDITION_V3[key];
      targets.add(`${m.axis}:${m.pole}`);
    }
    // 3軸 × 2極 = 6 の全てがちょうど1回ずつ
    expect(targets.size).toBe(6);
  });

  it('REST alone negates decay', () => {
    expect(menusNegateDecayV3(['REST'])).toBe(true);
    expect(menusNegateDecayV3(['HILL', 'REST'])).toBe(true);
    expect(menusNegateDecayV3(['HILL', 'POOL'])).toBe(false);
  });
});

describe('EV平坦化 — HILL一択の根治(§13 決定2)', () => {
  it('all non-REST menus share the same expected growth', () => {
    const ev = (m: { min: number; max: number }) => (m.min + m.max) / 2;
    const nonRest = TRAINING_MENUS_V3.filter((m) => m.key !== 'REST');
    const evs = nonRest.map(ev);
    for (const e of evs) expect(e).toBeCloseTo(evs[0]!, 6);
  });

  it('SPAR keeps the widest spread (博打の風味) while REST grows zero', () => {
    const spar = TRAINING_MENUS_V3.find((m) => m.key === 'SPAR')!;
    const hill = TRAINING_MENUS_V3.find((m) => m.key === 'HILL')!;
    const rest = TRAINING_MENUS_V3.find((m) => m.key === 'REST')!;
    expect(spar.max - spar.min).toBeGreaterThan(hill.max - hill.min);
    expect(rest.min).toBe(0);
    expect(rest.max).toBe(0);
  });
});

describe('condition_prep は絶対に ±4 を超えない(エンジンが例外を投げる境界)', () => {
  it('clamps every apt × menus × item combination across all conditions', () => {
    const extremeApts = [
      { weather: 1, track: 1, surface: 1 },
      { weather: -1, track: -1, surface: -1 },
      { weather: 1, track: -1, surface: 1 },
    ];
    const menuCombos: TrainingMenuV3[][] = [
      ['HILL', 'HILL'],
      ['HILL', 'POOL'],
      ['WOOD', 'SPAR'],
      ['REST', 'GATE'],
    ];
    // レースアイテムの想定最大(強+2.5)を両端で足しても超えない
    const itemEdges = [0, 2.5, -2.0, 4, -4, 99, -99, NaN, Infinity];
    for (const apt of extremeApts)
      for (const menus of menuCombos)
        for (const itemEdge of itemEdges)
          for (const conditions of ALL_CONDITIONS) {
            const prep = composeConditionPrepV3({ apt, menus, itemEdge, conditions });
            expect(prep).toBeGreaterThanOrEqual(CONDITION_PREP_RANGE_V3.min);
            expect(prep).toBeLessThanOrEqual(CONDITION_PREP_RANGE_V3.max);
            expect(Number.isFinite(prep)).toBe(true);
          }
  });

  it('aptitude alone never exceeds its total weight', () => {
    const maxApt = { weather: 1, track: 1, surface: 1 };
    // 全軸が+極に整列する条件(雨・道悪・芝)で最大化
    const edge = aptitudeEdgeV3(maxApt, { weather: 'RAIN', track: 'HEAVY', surface: 'TURF' });
    expect(edge).toBeCloseTo(2.5, 6);
  });

  it('training prep alone never exceeds its total weight', () => {
    // 2メニューが両方噛み合う: 坂路(道悪)+水泳(雨) が 道悪×雨 の夜
    const edge = trainingPrepEdgeV3(['HILL', 'POOL'], { weather: 'RAIN', track: 'HEAVY', surface: 'TURF' });
    expect(edge).toBeCloseTo(0.8, 6);
  });

  it('mispreparation is a whiff/penalty, not a bonus (§6 外すと空振り)', () => {
    // 良馬場向けに調教したのに道悪 → 負に振れる
    const edge = trainingPrepEdgeV3(['GATE', 'GATE'], { weather: 'SUNNY', track: 'HEAVY', surface: 'TURF' });
    expect(edge).toBeLessThan(0);
  });
});

describe('強さは主・条件は従(§9 基準B)', () => {
  it('condition_prep の全振れ幅 (±4) は total_value レンジ(40〜85+)より十分小さい', () => {
    const span = CONDITION_PREP_RANGE_V3.max - CONDITION_PREP_RANGE_V3.min; // 8
    expect(span).toBeLessThan(85 - 40); // 45 の強さレンジを条件が飲まない
  });
});

describe('適性ラベルは巧者で統一(A案)', () => {
  it('all six labels end with 巧者', () => {
    const labels = Object.values(APTITUDE_LABELS_V3).flatMap((l) => [l.positive, l.negative]);
    expect(labels).toHaveLength(6);
    for (const label of labels) expect(label.endsWith('巧者')).toBe(true);
  });
});
