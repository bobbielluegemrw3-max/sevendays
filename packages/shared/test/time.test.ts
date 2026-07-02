import { describe, expect, it } from 'vitest';
import { toMytDateString, batchDateFor, batchStartUtc, addDays } from '../src/time.js';

describe('MYT time (Decision 047)', () => {
  it('20:00 MYT equals 12:00 UTC on the same calendar day', () => {
    expect(batchStartUtc('2026-07-02').toISOString()).toBe('2026-07-02T12:00:00.000Z');
  });

  it('MYT date rolls over at 16:00 UTC', () => {
    expect(toMytDateString(new Date('2026-07-02T15:59:59Z'))).toBe('2026-07-02');
    expect(toMytDateString(new Date('2026-07-02T16:00:00Z'))).toBe('2026-07-03');
  });

  it('batchDateFor matches MYT calendar date', () => {
    expect(batchDateFor(new Date('2026-07-02T12:00:00Z'))).toBe('2026-07-02');
  });
});

describe('addDays', () => {
  it('handles month and year boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('Buyback due dates D+1..D+7 (Decision 042)', () => {
    const clearDate = '2026-07-02';
    const dues = Array.from({ length: 7 }, (_, i) => addDays(clearDate, i + 1));
    expect(dues[0]).toBe('2026-07-03');
    expect(dues[6]).toBe('2026-07-09');
  });

  it('rejects invalid input', () => {
    expect(() => addDays('2026/07/02', 1)).toThrow(TypeError);
    expect(() => addDays('2026-07-02', 1.5)).toThrow(TypeError);
  });
});
