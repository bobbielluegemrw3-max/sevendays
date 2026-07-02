import { Money, sumMoney } from '@sevendays/shared';
import { PolicyError } from './policies.js';

/** reserve_policies.policy_json shape (seeded as reserve_policy_v1.0). */
export interface ReservePolicy {
  mint_price: string;
  allocation: Record<string, string>;
}

const REQUIRED_RESERVES = [
  'PLATFORM_BUYBACK_RESERVE',
  'PLATFORM_MLM_RESERVE',
  'PLATFORM_OPERATING_RESERVE',
  'PLATFORM_EMERGENCY_RESERVE',
] as const;

/**
 * Reserve Allocation is governed by reserve_policy_version and the
 * allocation MUST sum exactly to the mint price (02_BUSINESS_MODEL.md).
 */
export function validateReservePolicy(policy: ReservePolicy): void {
  for (const account of REQUIRED_RESERVES) {
    if (policy.allocation[account] === undefined) {
      throw new PolicyError('POLICY_INVALID', `Reserve policy missing ${account}`);
    }
  }
  const total = sumMoney(Object.values(policy.allocation));
  if (!total.eq(policy.mint_price)) {
    throw new PolicyError(
      'POLICY_INVALID',
      `Allocation total ${total.toFixed8()} != mint price ${Money.of(policy.mint_price).toFixed8()}`,
    );
  }
}
