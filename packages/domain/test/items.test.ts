import { describe, expect, it } from 'vitest';
import {
  BURN_DROP_KEYS_V1,
  ITEM_BY_KEY_V1,
  ITEM_CATALOG_V1,
  ITEM_MODIFIER_RANGE_V1,
  ITEM_SETTING_COEFFICIENT_V1,
  ITEM_SETTING_PROBABILITY_V1,
  applyItemSettingV1,
  computeItemEffectV1,
  type ItemEffectContext,
} from '../src/items.js';

function ctx(over: Partial<ItemEffectContext> = {}): ItemEffectContext {
  return {
    horseType: 'BALANCED',
    currentDay: 3,
    training: null,
    prevCondition: 60,
    prevFatigue: 10,
    weather: 'CLOUDY',
    ...over,
  };
}

describe('item catalog v1.0 (Decision 078)', () => {
  it('has 30 sellable items (12/12/6 by band) and 5 burn drops', () => {
    const bands = (b: string) => ITEM_CATALOG_V1.filter((i) => i.band === b);
    expect(bands('BASIC')).toHaveLength(12);
    expect(bands('STANDARD')).toHaveLength(12);
    expect(bands('PREMIUM')).toHaveLength(6);
    expect(bands('BURN_DROP')).toHaveLength(5);
    expect(ITEM_CATALOG_V1.filter((i) => i.sellable)).toHaveLength(30);
    expect(BURN_DROP_KEYS_V1).toHaveLength(5);
  });

  it('keys are unique and the map covers everything', () => {
    expect(ITEM_BY_KEY_V1.size).toBe(ITEM_CATALOG_V1.length);
  });

  it('prices: integers, bands 1-2 / 3-4 / 5-7, drops 0, everything giftable (Decision 079)', () => {
    for (const item of ITEM_CATALOG_V1) {
      const price = Number(item.price);
      expect(Number.isInteger(price)).toBe(true);
      expect(item.giftable).toBe(true);
      if (item.band === 'BASIC') expect(price === 1 || price === 2).toBe(true);
      if (item.band === 'STANDARD') expect(price === 3 || price === 4).toBe(true);
      if (item.band === 'PREMIUM') expect(price >= 5 && price <= 7).toBe(true);
      if (item.band === 'BURN_DROP') {
        expect(price).toBe(0);
        expect(item.sellable).toBe(false);
      }
    }
  });

  it('champion saddle is the only day-restricted item (Day5-6)', () => {
    const restricted = ITEM_CATALOG_V1.filter((i) => i.usableDayMin !== undefined);
    expect(restricted.map((i) => i.key)).toEqual(['champion_saddle']);
    expect(restricted[0]).toMatchObject({ usableDayMin: 5, usableDayMax: 6 });
  });
});

describe('computeItemEffectV1 (item_policy_v1.0)', () => {
  it('feeds boost only their own training, with type affinity x1.5', () => {
    expect(computeItemEffectV1('speed_feed', ctx({ training: 'SPEED_TRAINING', horseType: 'SPRINTER' })).itemPoints).toBe(1.5);
    expect(computeItemEffectV1('speed_feed', ctx({ training: 'SPEED_TRAINING' })).itemPoints).toBe(1);
    expect(computeItemEffectV1('speed_feed', ctx({ training: 'POWER_TRAINING' })).itemPoints).toBe(0);
    expect(computeItemEffectV1('speed_feed', ctx()).itemPoints).toBe(0);
  });

  it('conditional items read the stats the player saw (prev day)', () => {
    expect(computeItemEffectV1('iron_horseshoe', ctx({ prevFatigue: 30 })).itemPoints).toBe(1);
    expect(computeItemEffectV1('iron_horseshoe', ctx({ prevFatigue: 29 })).itemPoints).toBe(0.25);
    expect(computeItemEffectV1('focus_bridle', ctx({ prevCondition: 70 })).itemPoints).toBe(1.5);
    expect(computeItemEffectV1('comeback_tonic', ctx({ prevCondition: 39 })).conditionDelta).toBe(12);
    expect(computeItemEffectV1('comeback_tonic', ctx({ prevCondition: 40 })).conditionDelta).toBe(0);
    expect(computeItemEffectV1('phoenix_feather', ctx({ prevCondition: 49, prevFatigue: 40 })).itemPoints).toBe(2.5);
    expect(computeItemEffectV1('phoenix_feather', ctx()).itemPoints).toBe(0.5);
  });

  it('weather bets resolve against the seed-derived weather', () => {
    expect(computeItemEffectV1('storm_cloak', ctx({ weather: 'STORM' })).itemPoints).toBe(1.5);
    expect(computeItemEffectV1('storm_cloak', ctx({ weather: 'SUNNY' })).itemPoints).toBe(0.5);
    expect(computeItemEffectV1('sunny_visor', ctx({ weather: 'SUNNY' })).itemPoints).toBe(1.5);
  });

  it('luck items shift the random range, LUCK type favored', () => {
    expect(computeItemEffectV1('lucky_charm', ctx()).randomShift).toBe(0.5);
    expect(computeItemEffectV1('lucky_charm', ctx({ horseType: 'LUCK' })).randomShift).toBe(0.75);
    const golden = computeItemEffectV1('golden_charm', ctx({ horseType: 'LUCK' }));
    expect(golden.randomShift).toBe(1.0);
    expect(golden.itemPoints).toBe(0.5);
  });

  it('type-matched training gates war banner and spirit roar (BALANCED never matches)', () => {
    expect(computeItemEffectV1('war_banner', ctx({ horseType: 'SPRINTER', training: 'SPEED_TRAINING' })).itemPoints).toBe(2.5);
    expect(computeItemEffectV1('war_banner', ctx({ horseType: 'SPRINTER', training: 'POWER_TRAINING' })).itemPoints).toBe(1);
    expect(computeItemEffectV1('war_banner', ctx({ horseType: 'BALANCED', training: 'SPEED_TRAINING' })).itemPoints).toBe(1);
    expect(computeItemEffectV1('spirit_roar', ctx({ horseType: 'ENDURANCE', training: 'RECOVERY_TRAINING' })).itemPoints).toBe(3);
    expect(computeItemEffectV1('spirit_roar', ctx()).itemPoints).toBe(0);
  });

  it('burn drops sit at or above premium strength', () => {
    expect(computeItemEffectV1('memento_horseshoe', ctx()).itemPoints).toBe(2);
    expect(computeItemEffectV1('memorial_wreath', ctx()).conditionDelta).toBe(15);
    expect(computeItemEffectV1('legacy_mane', ctx()).randomShift).toBe(1.0);
    expect(computeItemEffectV1('stardust_sand', ctx()).fatigueDelta).toBe(-20);
  });

  it('unknown keys are inert (decommissioned items must not crash replays)', () => {
    expect(computeItemEffectV1('no_such_item', ctx())).toEqual({
      itemPoints: 0, randomShift: 0, conditionDelta: 0, fatigueDelta: 0,
    });
  });
});

describe('applyItemSettingV1 (setting 1-6)', () => {
  it('probabilities sum to 1 and coefficients are centered on ~1', () => {
    const total = ITEM_SETTING_PROBABILITY_V1.reduce((a, p) => a + Number(p), 0);
    expect(total).toBeCloseTo(1.0, 10);
    expect(ITEM_SETTING_COEFFICIENT_V1).toEqual([0.5, 0.7, 0.9, 1.1, 1.3, 1.5]);
  });

  it('scales every channel and clamps itemPoints to the v1.1 range', () => {
    const raw = { itemPoints: 2, randomShift: 1, conditionDelta: 10, fatigueDelta: -10 };
    expect(applyItemSettingV1(raw, 1)).toEqual({ itemPoints: 1, randomShift: 0.5, conditionDelta: 5, fatigueDelta: -5 });
    expect(applyItemSettingV1(raw, 6)).toEqual({ itemPoints: 3, randomShift: 1.5, conditionDelta: 15, fatigueDelta: -15 });
    expect(applyItemSettingV1({ ...raw, itemPoints: 5 }, 6).itemPoints).toBe(ITEM_MODIFIER_RANGE_V1.max);
  });

  it('rejects settings outside 1-6', () => {
    const raw = { itemPoints: 1, randomShift: 0, conditionDelta: 0, fatigueDelta: 0 };
    expect(() => applyItemSettingV1(raw, 0)).toThrow('ITEM_SETTING_OUT_OF_RANGE');
    expect(() => applyItemSettingV1(raw, 7)).toThrow('ITEM_SETTING_OUT_OF_RANGE');
  });
});
