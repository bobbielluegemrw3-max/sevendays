import { Money } from '@sevendays/shared';
import { PolicyError } from './policies.js';

/** price_tables.policy_json shape (seeded as price_table_v1.0). */
export interface PriceTablePolicy {
  prices: Record<string, string>;
  buyback_total: string;
  purchase_lock_amount: string;
}

export function validatePriceTable(policy: PriceTablePolicy): void {
  for (const day of [0, 1, 2, 3, 4, 5, 6]) {
    const price = policy.prices[String(day)];
    if (price === undefined || !Money.of(price).gt('0')) {
      throw new PolicyError('POLICY_INVALID', `Price table missing/invalid Day${day}`);
    }
  }
  // lock amount = max assignable price = Day6 price (05_SETTLEMENT_ENGINE.md)
  if (!Money.of(policy.purchase_lock_amount).eq(policy.prices['6']!)) {
    throw new PolicyError('POLICY_INVALID', 'purchase_lock_amount must equal Day6 price');
  }
  if (!Money.of(policy.buyback_total).eq('200')) {
    throw new PolicyError('POLICY_INVALID', 'buyback_total is fixed at 200 in v1.0');
  }
}

/** P2P assignment price is always price_table[current_day] (02_BUSINESS_MODEL.md). */
export function getPrice(policy: PriceTablePolicy, currentDay: number): Money {
  const price = policy.prices[String(currentDay)];
  if (price === undefined) {
    throw new PolicyError('POLICY_INVALID', `No price for day ${currentDay} (0-6 only)`);
  }
  return Money.of(price);
}
