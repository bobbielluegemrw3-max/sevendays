import { Money } from '@sevendays/shared';

/**
 * Exact conversion between on-chain token units (bigint) and Money
 * (NUMERIC(20,8)). No floats anywhere; both directions throw instead of
 * rounding silently.
 */

export class AmountConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmountConversionError';
  }
}

/** On-chain units -> Money. Throws if decimals > 8 would lose precision. */
export function unitsToMoney(units: bigint, decimals: number): Money {
  if (units < 0n) throw new AmountConversionError(`Negative token amount: ${units}`);
  if (decimals < 0 || decimals > 18 || !Number.isInteger(decimals)) {
    throw new AmountConversionError(`Unsupported token decimals: ${decimals}`);
  }
  const base = 10n ** BigInt(decimals);
  const whole = units / base;
  const frac = units % base;
  if (frac === 0n) return Money.of(whole.toString());
  const fracStr = frac.toString().padStart(decimals, '0');
  if (decimals > 8 && !/^0*$/.test(fracStr.slice(8))) {
    throw new AmountConversionError(
      `Token amount ${units} (decimals ${decimals}) does not fit NUMERIC(20,8)`,
    );
  }
  return Money.of(`${whole.toString()}.${fracStr.slice(0, 8)}`);
}

/**
 * Decision 061: withdrawal network fee = actual gas cost pass-through.
 * Converts a native-token gas cost (wei) to a USDT fee via the
 * ops-configured native/USDT rate, rounded UP at `tokenDecimals` so the
 * platform never subsidizes gas. Never booked as revenue.
 */
export function gasCostToUsdtFee(args: {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  /** USDT per 1 native token (e.g. POL), as Money. */
  nativeUsdtRate: Money;
  tokenDecimals: number;
}): Money {
  const { gasLimit, maxFeePerGas, nativeUsdtRate, tokenDecimals } = args;
  if (gasLimit <= 0n || maxFeePerGas < 0n) {
    throw new AmountConversionError(`Invalid gas parameters: limit=${gasLimit}, maxFeePerGas=${maxFeePerGas}`);
  }
  const costWei = gasLimit * maxFeePerGas;
  const rateUnits = moneyToUnits(nativeUsdtRate, 8);
  // fee(token units) = ceil(costWei * rate / 10^(18 native decimals + 8 rate scale - tokenDecimals))
  const denominator = 10n ** BigInt(18 + 8 - tokenDecimals);
  const numerator = costWei * rateUnits;
  const feeUnits = (numerator + denominator - 1n) / denominator;
  return unitsToMoney(feeUnits, tokenDecimals);
}

/** Money -> on-chain units. Throws if the amount is not representable. */
export function moneyToUnits(amount: Money, decimals: number): bigint {
  if (amount.isNegative()) throw new AmountConversionError(`Negative money amount: ${amount.toString()}`);
  const [whole, frac = ''] = amount.toString().split('.') as [string, string?];
  if (frac.length > decimals && !/^0*$/.test(frac.slice(decimals))) {
    throw new AmountConversionError(
      `Amount ${amount.toString()} is not representable with ${decimals} token decimals`,
    );
  }
  const fracPadded = frac.slice(0, decimals).padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded === '' ? '0' : fracPadded);
}
