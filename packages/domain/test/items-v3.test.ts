import { describe, expect, it } from 'vitest';
import {
  BURN_DROP_KEYS_V3,
  CONDITION_GROUP_MEMBERS_V3,
  ITEM_CATALOG_V2,
  ITEM_CATALOG_V3,
  TRACK_CONDITIONS,
  WEATHERS,
  WEATHER_MODIFIER_V1,
  TRACK_MODIFIER_V1,
  HORSE_TYPES,
  applyRacePrepItemV3,
  type RaceEffectV3,
} from '../src/index.js';

/**
 * カタログV2(Decision 109・コード上は item_policy_v3.0)。
 * 品目の整合・レガシーカタログとのキー非衝突・置換法則(±4の器のスイング)。
 */

describe('item catalog V3 integrity (Decision 109)', () => {
  it('is the legacy scale: 30 sale (15 TRAINING / 15 RACE) + 5 burn drops', () => {
    expect(ITEM_CATALOG_V3).toHaveLength(35);
    const sale = ITEM_CATALOG_V3.filter((i) => i.band !== 'BURN_DROP');
    expect(sale).toHaveLength(30);
    expect(sale.filter((i) => i.itemClass === 'TRAINING')).toHaveLength(15);
    expect(sale.filter((i) => i.itemClass === 'RACE')).toHaveLength(15);
    expect(BURN_DROP_KEYS_V3).toHaveLength(5);
  });

  it('keys are unique and never collide with the live legacy catalog (DB primary key)', () => {
    const keys = ITEM_CATALOG_V3.map((i) => i.key);
    expect(new Set(keys).size).toBe(35);
    const legacy = new Set(ITEM_CATALOG_V2.map((i) => i.key));
    for (const key of keys) expect(legacy.has(key)).toBe(false);
  });

  it('sale items are integer-priced and giftable; burn drops are free and non-giftable (109)', () => {
    for (const item of ITEM_CATALOG_V3) {
      if (item.band === 'BURN_DROP') {
        expect(item.price).toBe('0');
        expect(item.sellable).toBe(false);
        expect(item.giftable).toBe(false);
      } else {
        expect(Number.isInteger(Number(item.price))).toBe(true);
        expect(Number(item.price)).toBeGreaterThanOrEqual(2);
        expect(Number(item.price)).toBeLessThanOrEqual(10);
        expect(item.sellable).toBe(true);
        expect(item.giftable).toBe(true);
      }
    }
  });

  it('condition groups exactly partition the weather and track enums', () => {
    const weathers = [...CONDITION_GROUP_MEMBERS_V3.RAIN_GROUP, ...CONDITION_GROUP_MEMBERS_V3.SUN_GROUP];
    const tracks = [...CONDITION_GROUP_MEMBERS_V3.MUD_GROUP, ...CONDITION_GROUP_MEMBERS_V3.FIRM_GROUP];
    expect([...weathers].sort()).toEqual([...WEATHERS].sort());
    expect([...tracks].sort()).toEqual([...TRACK_CONDITIONS].sort());
  });

  it('every RACE hit/miss value stays inside the per-axis aptitude range (±2)', () => {
    for (const item of ITEM_CATALOG_V3.filter((i) => i.itemClass === 'RACE')) {
      const e = item.effect as RaceEffectV3;
      if (e.kind === 'DUAL_FLOOR') continue;
      expect(e.hit).toBeGreaterThan(0);
      expect(e.hit).toBeLessThanOrEqual(2);
      expect(e.miss).toBeLessThan(0);
      expect(e.miss).toBeGreaterThanOrEqual(-2);
    }
  });
});

describe('race prep override law (±4 vessel swing)', () => {
  it('group prep: hit lifts the axis to at least the floor, miss drags to at most the ceiling', () => {
    const hit = applyRacePrepItemV3({
      itemKey: 'storm_armor', params: null,
      naturalWeatherMod: -2, naturalTrackMod: 1,
      actualWeather: 'STORM', actualTrack: 'GOOD',
    });
    expect(hit.weatherHit).toBe(true);
    expect(hit.weatherMod).toBe(2);
    expect(hit.trackMod).toBe(1); // 触っていない軸は不変

    const miss = applyRacePrepItemV3({
      itemKey: 'storm_armor', params: null,
      naturalWeatherMod: 2, naturalTrackMod: 1,
      actualWeather: 'SUNNY', actualTrack: 'GOOD',
    });
    expect(miss.weatherHit).toBe(false);
    expect(miss.weatherMod).toBe(-2);
  });

  it('a hit never lowers and a miss never raises the axis (override, not add)', () => {
    // 既に得意(+2)なら弱の的中(+1.5 floor)でも下がらない
    const already = applyRacePrepItemV3({
      itemKey: 'rain_cape', params: null,
      naturalWeatherMod: 2, naturalTrackMod: 0,
      actualWeather: 'RAIN', actualTrack: 'GOOD',
    });
    expect(already.weatherMod).toBe(2);
    // 既に苦手(−2)なら弱の外し(−1.0 ceiling)でもそれ以上沈まない
    const floorPreserved = applyRacePrepItemV3({
      itemKey: 'rain_cape', params: null,
      naturalWeatherMod: -2, naturalTrackMod: 0,
      actualWeather: 'SUNNY', actualTrack: 'GOOD',
    });
    expect(floorPreserved.weatherMod).toBe(-2);
  });

  it('pinpoint prep hits only the exact condition', () => {
    const exact = applyRacePrepItemV3({
      itemKey: 'storm_eye', params: null,
      naturalWeatherMod: -1, naturalTrackMod: 0,
      actualWeather: 'STORM', actualTrack: 'GOOD',
    });
    expect(exact.weatherHit).toBe(true);
    expect(exact.weatherMod).toBe(2);
    const nearMiss = applyRacePrepItemV3({
      itemKey: 'storm_eye', params: null,
      naturalWeatherMod: -1, naturalTrackMod: 0,
      actualWeather: 'RAIN', actualTrack: 'GOOD', // 雨でも嵐ではない=外れ
    });
    expect(nearMiss.weatherHit).toBe(false);
    expect(nearMiss.weatherMod).toBe(-1.5);
  });

  it('dual prep requires group params and judges both axes', () => {
    expect(() =>
      applyRacePrepItemV3({
        itemKey: 'full_harness', params: null,
        naturalWeatherMod: 0, naturalTrackMod: 0,
        actualWeather: 'RAIN', actualTrack: 'HEAVY',
      }),
    ).toThrow('ITEM_V3_PARAMS_REQUIRED');
    const both = applyRacePrepItemV3({
      itemKey: 'full_harness', params: { weatherGroup: 'RAIN_GROUP', trackGroup: 'MUD_GROUP' },
      naturalWeatherMod: -2, naturalTrackMod: -2,
      actualWeather: 'RAIN', actualTrack: 'HEAVY',
    });
    expect(both.weatherMod + both.trackMod).toBe(4); // 器の頂点
  });

  it('steady tack floors both axes at 0 with no hit/miss concept', () => {
    const result = applyRacePrepItemV3({
      itemKey: 'steady_tack', params: null,
      naturalWeatherMod: -2, naturalTrackMod: 1.5,
      actualWeather: 'STORM', actualTrack: 'FAST',
    });
    expect(result.weatherMod).toBe(0);
    expect(result.trackMod).toBe(1.5);
    expect(result.weatherHit).toBeNull();
    expect(result.trackHit).toBeNull();
  });

  it('reproduces the approved swing envelope over the real aptitude tables (+4..+8 hit / -8..-3 dual miss)', () => {
    // 実際の公開適性表(V1・発明なし)の全組合せに対して、置換法則が
    // シム確定値のスイング包絡(的中+4〜+8/外れ側は最大−8)を再現することを確認。
    let maxHitSwing = -Infinity;
    let minHitSwing = Infinity;
    let minMissSwing = Infinity;
    for (const type of HORSE_TYPES) {
      for (const weather of WEATHERS) {
        for (const track of TRACK_CONDITIONS) {
          const nw = WEATHER_MODIFIER_V1[weather][type];
          const nt = TRACK_MODIFIER_V1[track][type];
          const natural = nw + nt;
          // 「買う場面」= 両軸とも不利(≤0)な馬が両的中の備えをした場合
          if (nw <= 0 && nt <= 0) {
            const prepped = applyRacePrepItemV3({
              itemKey: 'full_harness',
              params: {
                weatherGroup: CONDITION_GROUP_MEMBERS_V3.RAIN_GROUP.includes(weather) ? 'RAIN_GROUP' : 'SUN_GROUP',
                trackGroup: CONDITION_GROUP_MEMBERS_V3.MUD_GROUP.includes(track) ? 'MUD_GROUP' : 'FIRM_GROUP',
              },
              naturalWeatherMod: nw, naturalTrackMod: nt,
              actualWeather: weather, actualTrack: track,
            });
            const swing = prepped.weatherMod + prepped.trackMod - natural;
            maxHitSwing = Math.max(maxHitSwing, swing);
            minHitSwing = Math.min(minHitSwing, swing);
          }
          // 「外す場面」= 両軸とも有利(≥1)なのに真逆へ備えた場合
          if (nw >= 1 && nt >= 1) {
            const prepped = applyRacePrepItemV3({
              itemKey: 'full_harness',
              params: {
                weatherGroup: CONDITION_GROUP_MEMBERS_V3.RAIN_GROUP.includes(weather) ? 'SUN_GROUP' : 'RAIN_GROUP',
                trackGroup: CONDITION_GROUP_MEMBERS_V3.MUD_GROUP.includes(track) ? 'FIRM_GROUP' : 'MUD_GROUP',
              },
              naturalWeatherMod: nw, naturalTrackMod: nt,
              actualWeather: weather, actualTrack: track,
            });
            const swing = prepped.weatherMod + prepped.trackMod - natural;
            minMissSwing = Math.min(minMissSwing, swing);
            expect(swing).toBeLessThanOrEqual(-3);
          }
        }
      }
    }
    expect(maxHitSwing).toBe(8); // 最悪適性(−2/−2)からの両的中=器の全幅
    expect(minHitSwing).toBeGreaterThanOrEqual(4); // 買う場面の的中は常に+4以上
    expect(minMissSwing).toBeGreaterThanOrEqual(-8); // 外れの底
  });
});
