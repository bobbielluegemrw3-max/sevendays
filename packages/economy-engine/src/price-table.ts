import { Money } from '@sevendays/shared';
import { bandedPriceStr } from '@sevendays/domain';
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

/**
 * P2P assignment price (02_BUSINESS_MODEL.md ＋ FUN_V3 §4 変動価格).
 *
 * `totalValue` 未指定(または Day0/Day6 のバンド幅0)＝従来の階段価格 policy.prices[day]。
 * `totalValue` 指定＝バンド価格: 階段 × (1 + width_day × tvPct)。
 *   tvPct = clamp((totalValue − FLOOR) / (CAP − FLOOR), 0, 1)  ・下限=階段, 上限≤177.16<200。
 * 価格は 2dp 切り捨て(plan §4 表と一致: Day3 tv=CAP → 133.10×1.15=153.06)。
 *
 * ★式は total_value + Day のみの純関数(field相対でない)＝割当は決定論・母集団中立を保つ。
 *   price は 2dp 確定値でありバランス累積ではないので、比率計算に Number を用いてよい
 *   (「Money は float 禁止」は残高の累積の話。ここは価格の導出＋2dp確定)。
 */
export function getPrice(
  policy: PriceTablePolicy,
  currentDay: number,
  totalValue?: number | null,
): Money {
  const ladder = policy.prices[String(currentDay)];
  if (ladder === undefined) {
    throw new PolicyError('POLICY_INVALID', `No price for day ${currentDay} (0-6 only)`);
  }
  // バンド計算は domain の純関数に集約(getPrice / 手動出品で式を1本化)。
  return Money.of(bandedPriceStr(ladder, currentDay, totalValue ?? null));
}
