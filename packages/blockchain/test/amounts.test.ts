import { describe, expect, it } from 'vitest';
import { Money } from '@sevendays/shared';
import { AmountConversionError, moneyToUnits, unitsToMoney } from '../src/index.js';

describe('unitsToMoney', () => {
  it('converts Polygon USDT units (6 decimals) exactly', () => {
    expect(unitsToMoney(100_000_000n, 6).toString()).toBe('100');
    expect(unitsToMoney(1n, 6).toString()).toBe('0.000001');
    expect(unitsToMoney(123_456_789n, 6).toString()).toBe('123.456789');
    expect(unitsToMoney(0n, 6).toString()).toBe('0');
  });

  it('converts 18-decimals tokens when the tail fits NUMERIC(20,8)', () => {
    // 1.5 tokens with 18 decimals
    expect(unitsToMoney(1_500_000_000_000_000_000n, 18).toString()).toBe('1.5');
  });

  it('rejects sub-NUMERIC(20,8) dust instead of rounding', () => {
    // 1 wei-level unit of an 18-decimals token is not representable
    expect(() => unitsToMoney(1n, 18)).toThrow(AmountConversionError);
  });

  it('rejects negative amounts', () => {
    expect(() => unitsToMoney(-1n, 6)).toThrow(AmountConversionError);
  });
});

describe('moneyToUnits', () => {
  it('converts Money to units exactly', () => {
    expect(moneyToUnits(Money.of('100'), 6)).toBe(100_000_000n);
    expect(moneyToUnits(Money.of('0.000001'), 6)).toBe(1n);
    expect(moneyToUnits(Money.of('99.999999'), 6)).toBe(99_999_999n);
  });

  it('round-trips with unitsToMoney', () => {
    for (const units of [1n, 999n, 10_000_000n, 123_456_789_012n]) {
      expect(moneyToUnits(unitsToMoney(units, 6), 6)).toBe(units);
    }
  });

  it('rejects amounts finer than the token decimals', () => {
    expect(() => moneyToUnits(Money.of('10.1234567'), 6)).toThrow(AmountConversionError);
  });

  it('accepts trailing zeros beyond token decimals', () => {
    expect(moneyToUnits(Money.of('10.12345600'), 6)).toBe(10_123_456n);
  });
});
