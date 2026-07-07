import { describe, expect, it } from 'vitest';
import { computeUnlockedTiers } from '../src/burn/support-bonus.js';

/** Decision 077 unlock rule — pure boundary checks (org + direct-from-T5). */
describe('computeUnlockedTiers (Decision 077)', () => {
  it('T1 is unconditional', () => {
    expect(computeUnlockedTiers('0', '0')).toBe(1);
  });

  it('org thresholds gate T2-T4 (inclusive bounds, fractions fall down)', () => {
    expect(computeUnlockedTiers('9999.99', '0')).toBe(1);
    expect(computeUnlockedTiers('10000.00', '0')).toBe(2);
    expect(computeUnlockedTiers('19999.99', '0')).toBe(2);
    expect(computeUnlockedTiers('20000.00', '0')).toBe(3);
    expect(computeUnlockedTiers('50000.00', '0')).toBe(4);
  });

  it('T5+ additionally requires the direct metric (field-tested values)', () => {
    // Huge org but weak personal recruiting -> capped at T4.
    expect(computeUnlockedTiers('999999.00', '30000.99')).toBe(4);
    expect(computeUnlockedTiers('250000.00', '30001.00')).toBe(5);
    expect(computeUnlockedTiers('400000.00', '30001.00')).toBe(5); // direct blocks T6
    expect(computeUnlockedTiers('400000.00', '50001.00')).toBe(6);
    expect(computeUnlockedTiers('600000.00', '70001.00')).toBe(7);
    // Strong recruiter but small org -> org gates first.
    expect(computeUnlockedTiers('249999.99', '70001.00')).toBe(4);
  });

  it('tiers are consecutive — a gap stops the ladder', () => {
    // org qualifies T5 range but direct fails T5 -> stays T4 even though
    // there is no "skip to T6".
    expect(computeUnlockedTiers('600000.00', '0')).toBe(4);
  });
});
