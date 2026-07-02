import { Decimal } from 'decimal.js';

/**
 * Money arithmetic for Seven Days Derby.
 *
 * All monetary values are NUMERIC(20,8) per 06_DATABASE.md.
 * JavaScript floats are FORBIDDEN for money. Inputs must be strings
 * (canonical), integers, or Money instances. Non-integer `number`
 * inputs throw.
 */

const MONEY_SCALE = 8;

// Dedicated Decimal clone so external Decimal.set() calls cannot affect money math.
const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
});

export type MoneyInput = Money | string | number;

function toDecimal(value: MoneyInput): Decimal {
  if (value instanceof Money) return value.raw;
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(
        `Non-integer number is forbidden for money: ${value}. Use a string instead.`,
      );
    }
    return new MoneyDecimal(value);
  }
  if (typeof value === 'string') {
    if (!/^-?\d+(\.\d+)?$/.test(value.trim())) {
      throw new TypeError(`Invalid money string: "${value}"`);
    }
    return new MoneyDecimal(value.trim());
  }
  throw new TypeError(`Unsupported money input: ${String(value)}`);
}

export class Money {
  readonly raw: Decimal;

  private constructor(raw: Decimal) {
    if (raw.decimalPlaces() > MONEY_SCALE) {
      throw new RangeError(
        `Money exceeds scale ${MONEY_SCALE}: ${raw.toString()}. Round explicitly first.`,
      );
    }
    this.raw = raw;
  }

  static of(value: MoneyInput): Money {
    return new Money(toDecimal(value));
  }

  static zero(): Money {
    return Money.of('0');
  }

  add(other: MoneyInput): Money {
    return new Money(this.raw.plus(toDecimal(other)));
  }

  sub(other: MoneyInput): Money {
    return new Money(this.raw.minus(toDecimal(other)));
  }

  /** Multiply by an exact factor (e.g. a rate given as string). Result rounds DOWN to scale 8. */
  mulFloor(factor: string): Money {
    const result = this.raw.times(new MoneyDecimal(factor));
    return new Money(result.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_DOWN));
  }

  neg(): Money {
    return new Money(this.raw.negated());
  }

  eq(other: MoneyInput): boolean {
    return this.raw.equals(toDecimal(other));
  }

  gt(other: MoneyInput): boolean {
    return this.raw.greaterThan(toDecimal(other));
  }

  gte(other: MoneyInput): boolean {
    return this.raw.greaterThanOrEqualTo(toDecimal(other));
  }

  lt(other: MoneyInput): boolean {
    return this.raw.lessThan(toDecimal(other));
  }

  lte(other: MoneyInput): boolean {
    return this.raw.lessThanOrEqualTo(toDecimal(other));
  }

  isZero(): boolean {
    return this.raw.isZero();
  }

  isNegative(): boolean {
    return this.raw.isNegative() && !this.raw.isZero();
  }

  /** Canonical NUMERIC(20,8) string, e.g. "100.00000000". */
  toFixed8(): string {
    return this.raw.toFixed(MONEY_SCALE);
  }

  /** Human-oriented string without forced trailing zeros. */
  toString(): string {
    return this.raw.toString();
  }
}

export function money(value: MoneyInput): Money {
  return Money.of(value);
}

/** Sum a list of money values. Returns zero for an empty list. */
export function sumMoney(values: readonly MoneyInput[]): Money {
  return values.reduce<Money>((acc, v) => acc.add(v), Money.zero());
}

/**
 * floor(count * rate) — the immutable Burn Target Count rule (01_CONSTITUTION.md)
 * and listing target count rule (04_ECONOMY_ENGINE.md).
 * `rate` is an exact decimal string like "0.104".
 */
export function floorTimesRate(count: number, rate: string): number {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`count must be a non-negative integer: ${count}`);
  }
  const result = new MoneyDecimal(count).times(new MoneyDecimal(rate));
  return result.floor().toNumber();
}
