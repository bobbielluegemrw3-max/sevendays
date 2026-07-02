import { describe, expect, it } from 'vitest';
import { money, sumMoney, floorTimesRate } from '../src/money.js';

describe('Money', () => {
  it('rejects non-integer number inputs (floats are forbidden for money)', () => {
    expect(() => money(0.1)).toThrow(TypeError);
    expect(() => money(100.5)).toThrow(TypeError);
  });

  it('accepts canonical string inputs and integers', () => {
    expect(money('100.00').toFixed8()).toBe('100.00000000');
    expect(money(100).toFixed8()).toBe('100.00000000');
    expect(money('-3.5').toFixed8()).toBe('-3.50000000');
  });

  it('rejects malformed strings', () => {
    expect(() => money('1e5')).toThrow(TypeError);
    expect(() => money('abc')).toThrow(TypeError);
    expect(() => money('1.2.3')).toThrow(TypeError);
    expect(() => money('')).toThrow(TypeError);
  });

  it('rejects values beyond scale 8', () => {
    expect(() => money('0.000000001')).toThrow(RangeError);
  });

  it('adds and subtracts exactly (no float drift)', () => {
    // 0.1 + 0.2 must be exactly 0.3
    expect(money('0.1').add('0.2').eq('0.3')).toBe(true);
    expect(money('177.16').sub('146.41').toFixed8()).toBe('30.75000000');
  });

  it('Buyback: 6 payments of 28.57142857 + final 28.57142858 equals exactly 200', () => {
    const six = Array.from({ length: 6 }, () => '28.57142857');
    const total = sumMoney([...six, '28.57142858']);
    expect(total.eq('200')).toBe(true);
    expect(total.toFixed8()).toBe('200.00000000');
  });

  it('Reserve Allocation v1.0 sums to exactly 100', () => {
    const total = sumMoney(['93.60', '5.40', '0.70', '0.30']);
    expect(total.eq('100')).toBe(true);
  });

  it('comparisons and sign checks work', () => {
    expect(money('10').gt('9.99999999')).toBe(true);
    expect(money('10').gte('10')).toBe(true);
    expect(money('0').isZero()).toBe(true);
    expect(money('-1').isNegative()).toBe(true);
    expect(money('0').isNegative()).toBe(false);
  });

  it('mulFloor rounds down at scale 8', () => {
    expect(money('100').mulFloor('0.333333333333').toFixed8()).toBe('33.33333333');
  });

  it('sumMoney of empty list is zero', () => {
    expect(sumMoney([]).isZero()).toBe(true);
  });
});

describe('floorTimesRate (immutable Burn Target Count rule)', () => {
  it('floors non-integer results', () => {
    expect(floorTimesRate(1000, '0.104')).toBe(104);
    expect(floorTimesRate(999, '0.104')).toBe(103); // 103.896 -> 103
    expect(floorTimesRate(7, '0.10')).toBe(0); // 0.7 -> 0
  });

  it('is exact where binary floats would misround', () => {
    // 55 * 0.108 = 5.94 exactly; float math gives 5.94000000000000005...
    expect(floorTimesRate(55, '0.108')).toBe(5);
    // 1000 * 0.112 = 112 exactly
    expect(floorTimesRate(1000, '0.112')).toBe(112);
  });

  it('rejects invalid counts', () => {
    expect(() => floorTimesRate(-1, '0.1')).toThrow(RangeError);
    expect(() => floorTimesRate(1.5, '0.1')).toThrow(RangeError);
  });
});
