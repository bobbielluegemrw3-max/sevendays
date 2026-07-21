import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { DAY0_MINT_TOTAL_CHARGE, P2P_FEE_SPLIT_RATE } from '@sevendays/domain';

/**
 * 施策E (FUN_V3): 利確フレーミング。
 *
 * 自動出品・売却・BURN の通知に「取得実支出(buy)」と「手取り(sell)」を
 * 添えることで、「馬を取られた」ではなく「儲かった / 損した」として
 * 正しく受け取れるようにする。損益の計算・翻訳・符号色はクライアントに
 * 委ねる(通知本文は payload に描画済みの ja 文字列を持つ構造のため、
 * 損益行だけを payload の生数値から5言語で組み立てる)。
 *
 * 盛りすぎ是正(PRELAUNCH_COPY_RISKS): 利益だけでなく損失も必ず出す。
 * BURN は取得実支出の全損(sell=0)として表示する。
 */

export interface AcquisitionCost {
  /** 実支出。ミント= 102.00(100 + 手数料 2)、P2P= 支払額(assigned_price 満額)。 */
  cost: Money;
  isMint: boolean;
}

/**
 * 現所有者がこの馬を取得したときの実支出。取得記録が無ければ null。
 * ミント(seller null)は総支払 102、P2P は買い手が満額を払う(手数料は
 * 売り手の手取りから引かれる)ため assigned_price がそのまま実支出。
 */
export async function acquisitionCost(
  client: SqlClient,
  horseId: string,
  ownerUserId: string,
): Promise<AcquisitionCost | null> {
  const r = await client.query<{ assigned_price: string; is_mint: boolean }>(
    `select assigned_price::text as assigned_price, (seller_user_id is null) as is_mint
     from ownership_assignments
     where horse_id = $1 and buyer_user_id = $2 and status = 'SETTLED'
     order by created_at desc
     limit 1`,
    [horseId, ownerUserId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    cost: row.is_mint ? Money.of(DAY0_MINT_TOTAL_CHARGE) : Money.of(row.assigned_price),
    isMint: row.is_mint,
  };
}

/** 出品価格 → 手取り(2% 控除後)。売却成立時と同一式(movements.ts と一致)。 */
export function netProceeds(price: Money): Money {
  const feeHalf = price.mulFloor(P2P_FEE_SPLIT_RATE);
  return price.sub(feeHalf).sub(feeHalf);
}

/** 通知 payload に添える損益フィールド(値の描画はクライアント側)。 */
export interface PnlPayload {
  buy: string; // 取得実支出(fixed8)
  sell: string; // 手取り(実現/見込み)、BURN は '0'
  projected?: '1'; // 出品時の見込み(実現ではない)
  is_mint?: '1'; // ミント由来(取得内訳の説明に使用可)
}

/** 実現(売却成立)の損益フィールド。 */
export function realizedPnl(acq: AcquisitionCost, netProceedsAmount: Money): PnlPayload {
  return {
    buy: acq.cost.toFixed8(),
    sell: netProceedsAmount.toFixed8(),
    ...(acq.isMint ? { is_mint: '1' as const } : {}),
  };
}

/** 見込み(自動出品)の損益フィールド。 */
export function projectedPnl(acq: AcquisitionCost, listPrice: Money): PnlPayload {
  return {
    buy: acq.cost.toFixed8(),
    sell: netProceeds(listPrice).toFixed8(),
    projected: '1',
    ...(acq.isMint ? { is_mint: '1' as const } : {}),
  };
}

/** 全損(BURN)の損益フィールド。 */
export function burnLossPnl(acq: AcquisitionCost): PnlPayload {
  return {
    buy: acq.cost.toFixed8(),
    sell: '0',
    ...(acq.isMint ? { is_mint: '1' as const } : {}),
  };
}
