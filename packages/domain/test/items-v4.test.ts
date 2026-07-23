import { describe, expect, it } from 'vitest';
import {
  ITEM_BY_KEY_V4,
  ITEM_CATALOG_V4,
  ITEM_POLICY_VERSION_V4,
  RACE_ITEM_KEYS_V4,
  SURFACES,
  TRACK_CONDITIONS,
  TRAINING_ITEM_KEYS_V4,
  WEATHERS,
  composeConditionPrepV3,
  deriveAptitudeV3,
  raceItemEdgeV4,
  raceItemWithinHalfVesselV4,
  type RaceConditionsV3,
  type RaceEffectV4,
  type TrainingEffectV4,
} from '../src/index.js';

/**
 * カタログ V4(§14.5)。26点・6条件×3段の一貫パターン・加算方式・聖杯 throttle。
 * 芯: ①26点の構造 ②加算値が実条件で hit/miss を返す ③器を壊さない ④聖杯ラダーの上限。
 */

const ALL_CONDITIONS: RaceConditionsV3[] = [];
for (const weather of WEATHERS)
  for (const track of TRACK_CONDITIONS)
    for (const surface of SURFACES) ALL_CONDITIONS.push({ weather, track, surface });

describe('カタログ V4 の構造(§14.5)', () => {
  it('is 26 items = 6 training + 20 race(6条件×3段 + 保険2)', () => {
    expect(ITEM_CATALOG_V4).toHaveLength(26);
    expect(TRAINING_ITEM_KEYS_V4).toHaveLength(6);
    expect(RACE_ITEM_KEYS_V4).toHaveLength(20);
    const raceGraded = ITEM_CATALOG_V4.filter(
      (i) => i.itemClass === 'RACE' && (i.effect as RaceEffectV4).kind === 'CONDITION_PREP',
    );
    expect(raceGraded).toHaveLength(18); // 6条件 × 3段
    const insurance = ITEM_CATALOG_V4.filter(
      (i) => i.itemClass === 'RACE' && (i.effect as RaceEffectV4).kind === 'INSURANCE',
    );
    expect(insurance).toHaveLength(2);
  });

  it('has a stable policy version and unique keys', () => {
    expect(ITEM_POLICY_VERSION_V4).toBe('item_policy_v4.0');
    const keys = ITEM_CATALOG_V4.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('covers all 6 conditions × 3 tiers with the 〔条件・段階〕 pattern', () => {
    const tags = new Set(
      ITEM_CATALOG_V4.filter(
        (i) => i.itemClass === 'RACE' && (i.effect as RaceEffectV4).kind === 'CONDITION_PREP',
      ).map((i) => i.conditionTag),
    );
    for (const cond of ['雨', '晴', '道悪', '良馬場', '芝', 'ダート'])
      for (const step of ['弱', '中', '強']) expect(tags.has(`${cond}・${step}`)).toBe(true);
  });
});

describe('レースアイテム = 加算方式(§14.6)', () => {
  it('returns +hit when the actual condition matches, miss otherwise', () => {
    // 雨合羽・強(雨=weather+ に備える)
    const rainCape = ITEM_BY_KEY_V4.get('rain_cape_strong')!;
    const e = rainCape.effect as RaceEffectV4;
    expect(e.kind).toBe('CONDITION_PREP');
    // 実際が雨 → 的中 +2.5
    expect(raceItemEdgeV4('rain_cape_strong', { weather: 'RAIN', track: 'GOOD', surface: 'TURF' })).toBe(2.5);
    expect(raceItemEdgeV4('rain_cape_strong', { weather: 'STORM', track: 'GOOD', surface: 'TURF' })).toBe(2.5);
    // 実際が晴 → 外れ −2.0
    expect(raceItemEdgeV4('rain_cape_strong', { weather: 'SUNNY', track: 'GOOD', surface: 'TURF' })).toBe(-2.0);
  });

  it('insurance always adds a small positive regardless of condition', () => {
    for (const c of ALL_CONDITIONS) expect(raceItemEdgeV4('full_ready_std', c)).toBe(0.6);
  });

  it('unknown / training keys contribute 0 to condition_prep', () => {
    expect(raceItemEdgeV4('nope', ALL_CONDITIONS[0]!)).toBe(0);
    expect(raceItemEdgeV4('feed_xl', ALL_CONDITIONS[0]!)).toBe(0); // TRAINING は prep に効かない
  });

  it('each tier grades hit/miss (弱<中<強)', () => {
    const hit = (k: string) => (ITEM_BY_KEY_V4.get(k)!.effect as RaceEffectV4 as { hit: number }).hit;
    expect(hit('turf_shoes_weak')).toBeLessThan(hit('turf_shoes_mid'));
    expect(hit('turf_shoes_mid')).toBeLessThan(hit('turf_shoes_strong'));
  });
});

describe('器を壊さない — アイテムを足しても condition_prep は ±4 内(§12.2/§14.6)', () => {
  it('each race item alone stays within the half vessel before summing', () => {
    expect(raceItemWithinHalfVesselV4()).toBe(true);
  });

  it('apt + 2 menus + strongest race item never exceeds ±4 across all conditions', () => {
    const apts = [deriveAptitudeV3('x1'), { weather: 1, track: 1, surface: 1 }, { weather: -1, track: -1, surface: -1 }];
    for (const apt of apts)
      for (const key of RACE_ITEM_KEYS_V4)
        for (const conditions of ALL_CONDITIONS) {
          const itemEdge = raceItemEdgeV4(key, conditions);
          const prep = composeConditionPrepV3({ apt, menus: ['HILL', 'WOOD'], itemEdge, conditions });
          expect(prep).toBeGreaterThanOrEqual(-4);
          expect(prep).toBeLessThanOrEqual(4);
        }
  });
});

describe('聖杯ラダーの throttle(§15) — total_value の伸びが+4/走に収まる', () => {
  it('no training growth item exceeds +4 max (毎走使っても実効+4=90+到達1.5%)', () => {
    for (const key of TRAINING_ITEM_KEYS_V4) {
      const e = ITEM_BY_KEY_V4.get(key)!.effect as TrainingEffectV4;
      if (e.kind === 'GROWTH') expect(e.max).toBeLessThanOrEqual(4.0);
    }
  });

  it('drops the §14.5 draft top tiers (黄金+4〜6/秘伝+3〜5) that breach the 90 ceiling', () => {
    // 黄金(feed_xl)は +3〜4 に、秘伝(feed_l)は +2.5〜3.5 に下方修正済み(§14.7 の p99≤88 制約)
    const golden = ITEM_BY_KEY_V4.get('feed_xl')!.effect as TrainingEffectV4;
    const secret = ITEM_BY_KEY_V4.get('feed_l')!.effect as TrainingEffectV4;
    if (golden.kind === 'GROWTH') expect(golden.max).toBeLessThanOrEqual(4.0);
    if (secret.kind === 'GROWTH') expect(secret.max).toBeLessThanOrEqual(3.5);
  });
});

describe('価格は EV中立起点(§14.7)', () => {
  it('race tiers priced ascending, near the neutral table (弱4.7/中6.4/強7.7)+margin', () => {
    const price = (k: string) => Number(ITEM_BY_KEY_V4.get(k)!.price);
    expect(price('turf_shoes_weak')).toBeLessThan(price('turf_shoes_mid'));
    expect(price('turf_shoes_mid')).toBeLessThan(price('turf_shoes_strong'));
    expect(price('turf_shoes_weak')).toBeGreaterThanOrEqual(4); // 中立4.7 以上
    expect(price('turf_shoes_strong')).toBeGreaterThanOrEqual(7); // 中立7.7 近辺
  });
});
