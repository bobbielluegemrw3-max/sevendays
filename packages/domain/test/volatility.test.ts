import { describe, expect, it } from 'vitest';
import {
  BURN_JITTER_ENVELOPE_V1,
  FORECAST_ACCURACY_V1,
  deriveNightForecastV1,
  nightlyBurnRateV2,
  seedUnit,
} from '../src/volatility.js';

/** 疑似シード列(実運用は64桁hex — テストは多様な文字列で十分)。 */
const seeds = Array.from({ length: 20000 }, (_, i) => `seed-${i}-${(i * 2654435761) % 97}`);

describe('ADR-012 volatility — nightly burn rate', () => {
  it('is deterministic for the same seed', () => {
    expect(nightlyBurnRateV2('abc', 'NORMAL')).toBe(nightlyBurnRateV2('abc', 'NORMAL'));
  });

  it('stays inside the fixed envelope for every status', () => {
    for (const status of ['NORMAL', 'WATCH', 'WINTER', 'EMERGENCY'] as const) {
      for (const s of seeds.slice(0, 2000)) {
        const r = Number(nightlyBurnRateV2(s, status));
        expect(r).toBeGreaterThanOrEqual(Number(BURN_JITTER_ENVELOPE_V1.min));
        expect(r).toBeLessThanOrEqual(Number(BURN_JITTER_ENVELOPE_V1.max));
      }
    }
  });

  it('preserves the mean at the status base rate (NORMAL 10.7%)', () => {
    const mean = seeds.reduce((t, s) => t + Number(nightlyBurnRateV2(s, 'NORMAL')), 0) / seeds.length;
    expect(Math.abs(mean - 0.107)).toBeLessThan(0.0015);
  });

  it('actually varies (not constant) and respects a narrowed amplitude', () => {
    const values = new Set(seeds.slice(0, 200).map((s) => nightlyBurnRateV2(s, 'NORMAL')));
    expect(values.size).toBeGreaterThan(50);
    for (const s of seeds.slice(0, 2000)) {
      const r = Number(nightlyBurnRateV2(s, 'NORMAL', '0.005'));
      expect(Math.abs(r - 0.107)).toBeLessThanOrEqual(0.005 + 1e-9);
    }
  });

  it('never widens beyond the default amplitude even if asked to', () => {
    for (const s of seeds.slice(0, 2000)) {
      const r = Number(nightlyBurnRateV2(s, 'NORMAL', '0.10'));
      expect(Math.abs(r - 0.107)).toBeLessThanOrEqual(0.027 + 1e-9);
    }
  });
});

describe('ADR-012 volatility — forecast', () => {
  it('is deterministic and internally consistent', () => {
    const a = deriveNightForecastV1('seed-x');
    const b = deriveNightForecastV1('seed-x');
    expect(a).toEqual(b);
  });

  it('hits roughly the published accuracy per axis (70%)', () => {
    let w = 0;
    let t = 0;
    let sf = 0;
    for (const s of seeds) {
      const { actual, forecast } = deriveNightForecastV1(s);
      if (forecast.weather === actual.weather) w++;
      if (forecast.track === actual.track) t++;
      if (forecast.surface === actual.surface) sf++;
    }
    const acc = Number(FORECAST_ACCURACY_V1);
    for (const hit of [w, t, sf]) {
      expect(Math.abs(hit / seeds.length - acc)).toBeLessThan(0.02);
    }
  });

  it('actual conditions follow the published distributions (rough)', () => {
    let sunny = 0;
    let turf = 0;
    for (const s of seeds) {
      const { actual } = deriveNightForecastV1(s);
      if (actual.weather === 'SUNNY') sunny++;
      if (actual.surface === 'TURF') turf++;
    }
    expect(Math.abs(sunny / seeds.length - 0.4)).toBeLessThan(0.02);
    expect(Math.abs(turf / seeds.length - 0.6)).toBeLessThan(0.02);
  });

  it('seedUnit channels are independent-ish (different values per channel)', () => {
    expect(seedUnit('same-seed', 'a')).not.toBe(seedUnit('same-seed', 'b'));
  });
});
