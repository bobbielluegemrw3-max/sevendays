import { describe, expect, it } from 'vitest';
import {
  BURN_DROP_KEYS_V2,
  ITEM_BY_KEY_V2,
  ITEM_CATALOG_V2,
  ITEM_MODIFIER_RANGE_V1,
  SURFACE_PROBABILITY_V1,
  TRACK_PROBABILITY_V1,
  WEATHER_PROBABILITY_V1,
  applyItemConditionsV2,
  computeItemEffectV2,
  itemConditionCoefficientV2,
  raceNightNameV2,
  type ItemAffinity,
  type ItemEffectContext,
  type RaceConditions,
  SURFACES,
  TRACK_CONDITIONS,
  WEATHERS,
} from '../src/index.js';

function ctx(overrides: Partial<ItemEffectContext> = {}): ItemEffectContext {
  return {
    horseType: 'BALANCED',
    currentDay: 3,
    training: null,
    prevCondition: 60,
    prevFatigue: 10,
    weather: 'CLOUDY',
    ...overrides,
  };
}

const COND: RaceConditions = { weather: 'CLOUDY', track: 'GOOD', surface: 'TURF' };

describe('catalog v2 (Decision 082)', () => {
  it('keeps the 12/12/6/5 band structure (30 sellable + 5 burn drops)', () => {
    const bands = (b: string) => ITEM_CATALOG_V2.filter((i) => i.band === b);
    expect(bands('BASIC')).toHaveLength(12);
    expect(bands('STANDARD')).toHaveLength(12);
    expect(bands('PREMIUM')).toHaveLength(6);
    expect(bands('BURN_DROP')).toHaveLength(5);
    expect(ITEM_CATALOG_V2.filter((i) => i.sellable)).toHaveLength(30);
    expect(BURN_DROP_KEYS_V2).toHaveLength(5);
    expect(ITEM_BY_KEY_V2.size).toBe(ITEM_CATALOG_V2.length);
  });

  it('every item carries a valid affinity and unique key', () => {
    const keys = new Set<string>();
    for (const item of ITEM_CATALOG_V2) {
      expect(keys.has(item.key)).toBe(false);
      keys.add(item.key);
      expect(item.affinity).toBeTruthy();
      expect(Number(item.price)).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes the new condition-themed gear', () => {
    for (const key of [
      'turf_spikes', 'dirt_shoes', 'rain_hood',
      'firm_plates', 'mud_guards', 'turf_master_saddle', 'dirt_master_saddle',
      'storm_emperor_cloak', 'mudlord_crown',
    ]) {
      expect(ITEM_BY_KEY_V2.has(key)).toBe(true);
    }
    // v1 keys retired from the shop
    for (const key of ['iron_horseshoe', 'golden_charm', 'war_banner']) {
      expect(ITEM_BY_KEY_V2.has(key)).toBe(false);
    }
  });
});

describe('condition coefficient (affinity x conditions)', () => {
  const AFFINITIES: ItemAffinity[] = ['ALL', 'TURF', 'DIRT', 'SUN', 'RAIN', 'FIRM', 'MUD', 'STORM_EPIC'];

  it('stays inside the v1 bounds [0.5, 1.5] for every combination', () => {
    for (const affinity of AFFINITIES) {
      for (const weather of WEATHERS) {
        for (const track of TRACK_CONDITIONS) {
          for (const surface of SURFACES) {
            const coeff = itemConditionCoefficientV2(affinity, { weather, track, surface });
            expect(coeff).toBeGreaterThanOrEqual(0.5);
            expect(coeff).toBeLessThanOrEqual(1.5);
          }
        }
      }
    }
  });

  it('is economy-neutral: EV over the public distributions is ~1.0 per affinity', () => {
    for (const affinity of AFFINITIES) {
      let ev = 0;
      for (const weather of WEATHERS) {
        for (const track of TRACK_CONDITIONS) {
          for (const surface of SURFACES) {
            const p =
              Number(WEATHER_PROBABILITY_V1[weather]) *
              Number(TRACK_PROBABILITY_V1[track]) *
              Number(SURFACE_PROBABILITY_V1[surface]);
            ev += p * itemConditionCoefficientV2(affinity, { weather, track, surface });
          }
        }
      }
      expect(ev).toBeGreaterThan(0.95);
      expect(ev).toBeLessThan(1.05);
    }
  });

  it('rewards the matching condition (雨の鬼 in rain, ダート巧者 on dirt)', () => {
    expect(itemConditionCoefficientV2('RAIN', { ...COND, weather: 'RAIN' })).toBe(1.5);
    expect(itemConditionCoefficientV2('RAIN', { ...COND, weather: 'SUNNY' })).toBe(0.6);
    expect(itemConditionCoefficientV2('DIRT', { ...COND, surface: 'DIRT' })).toBe(1.5);
    expect(itemConditionCoefficientV2('MUD', { ...COND, track: 'HEAVY' })).toBe(1.5);
    expect(itemConditionCoefficientV2('STORM_EPIC', { ...COND, weather: 'STORM' })).toBe(1.5);
    expect(itemConditionCoefficientV2('ALL', COND)).toBe(1.0);
  });
});

describe('computeItemEffectV2 (item_policy_v2.0)', () => {
  it('feeds boost only their own training, with type affinity x1.5', () => {
    expect(computeItemEffectV2('speed_feed', ctx({ training: 'SPEED_TRAINING', horseType: 'SPRINTER' })).itemPoints).toBe(1.5);
    expect(computeItemEffectV2('speed_feed', ctx({ training: 'SPEED_TRAINING' })).itemPoints).toBe(1);
    expect(computeItemEffectV2('speed_feed', ctx({ training: 'POWER_TRAINING' })).itemPoints).toBe(0);
  });

  it('conditional items read the stats the player saw (prev day)', () => {
    expect(computeItemEffectV2('focus_bridle', ctx({ prevCondition: 70 })).itemPoints).toBe(1.5);
    expect(computeItemEffectV2('comeback_tonic', ctx({ prevCondition: 39 })).conditionDelta).toBe(12);
    expect(computeItemEffectV2('phoenix_feather', ctx({ prevCondition: 49, prevFatigue: 40 })).itemPoints).toBe(2.5);
  });

  it('condition gear has flat raw effects — the response lives in the affinity (no double dipping)', () => {
    expect(computeItemEffectV2('storm_cloak', ctx({ weather: 'STORM' })).itemPoints).toBe(1);
    expect(computeItemEffectV2('storm_cloak', ctx({ weather: 'SUNNY' })).itemPoints).toBe(1);
    expect(computeItemEffectV2('turf_spikes', ctx()).itemPoints).toBe(0.75);
    expect(computeItemEffectV2('mudlord_crown', ctx()).itemPoints).toBe(1.5);
  });

  it('legacy v1 keys still resolve (held inventories must replay)', () => {
    expect(computeItemEffectV2('iron_horseshoe', ctx({ prevFatigue: 30 })).itemPoints).toBe(1);
    expect(computeItemEffectV2('war_banner', ctx({ horseType: 'SPRINTER', training: 'SPEED_TRAINING' })).itemPoints).toBe(2.5);
    expect(computeItemEffectV2('golden_charm', ctx({ horseType: 'LUCK' })).randomShift).toBe(1.0);
  });

  it('burn drops sit at or above premium strength', () => {
    expect(computeItemEffectV2('memento_horseshoe', ctx()).itemPoints).toBe(2);
    expect(computeItemEffectV2('spirit_roar', ctx({ horseType: 'ENDURANCE', training: 'RECOVERY_TRAINING' })).itemPoints).toBe(3);
    expect(computeItemEffectV2('stardust_sand', ctx()).fatigueDelta).toBe(-20);
  });

  it('unknown keys are inert (decommissioned items must not crash replays)', () => {
    expect(computeItemEffectV2('no_such_item', ctx())).toEqual({
      itemPoints: 0, randomShift: 0, conditionDelta: 0, fatigueDelta: 0,
    });
  });
});

describe('applyItemConditionsV2', () => {
  it('scales every channel by the item affinity coefficient and clamps itemPoints', () => {
    const raw = { itemPoints: 2, randomShift: 1, conditionDelta: 10, fatigueDelta: -10 };
    // storm_cloak = RAIN affinity: rain -> x1.5
    expect(applyItemConditionsV2('storm_cloak', raw, { ...COND, weather: 'RAIN' })).toEqual({
      itemPoints: 3, randomShift: 1.5, conditionDelta: 15, fatigueDelta: -15,
    });
    // sunny day -> x0.6
    expect(applyItemConditionsV2('storm_cloak', raw, { ...COND, weather: 'SUNNY' })).toEqual({
      itemPoints: 1.2, randomShift: 0.6, conditionDelta: 6, fatigueDelta: -6,
    });
    // clamp
    expect(applyItemConditionsV2('storm_cloak', { ...raw, itemPoints: 5 }, { ...COND, weather: 'RAIN' }).itemPoints)
      .toBe(ITEM_MODIFIER_RANGE_V1.max);
    // legacy key = ALL x1.0
    expect(applyItemConditionsV2('war_banner', raw, { ...COND, weather: 'STORM' })).toEqual(raw);
  });
});

describe('raceNightNameV2 (祭りの夜)', () => {
  it('crowns the rare combinations, null on ordinary nights', () => {
    expect(raceNightNameV2({ weather: 'STORM', track: 'HEAVY', surface: 'TURF' })).toBe('嵐の荒天決戦');
    expect(raceNightNameV2({ weather: 'STORM', track: 'GOOD', surface: 'TURF' })).toBe('嵐の夜');
    expect(raceNightNameV2({ weather: 'RAIN', track: 'HEAVY', surface: 'DIRT' })).toBe('豪雨のダート決戦');
    expect(raceNightNameV2({ weather: 'RAIN', track: 'HEAVY', surface: 'TURF' })).toBe('豪雨の不良馬場');
    expect(raceNightNameV2({ weather: 'CLOUDY', track: 'HEAVY', surface: 'TURF' })).toBe('道悪の夜');
    expect(raceNightNameV2({ weather: 'SUNNY', track: 'FAST', surface: 'TURF' })).toBe('絶好の芝日和');
    expect(raceNightNameV2({ weather: 'SUNNY', track: 'FAST', surface: 'DIRT' })).toBe('快晴のダート日和');
    expect(raceNightNameV2(COND)).toBeNull();
  });
});
