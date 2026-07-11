import { insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { renderNotification, type MarketplaceState } from '@sevendays/domain';

/**
 * Marketplace state control (05_SETTLEMENT_ENGINE.md):
 * MARKET_LOCKED at batch start; reopens ONLY after the batch completes
 * successfully. On failure it stays locked until Admin Recovery.
 */

export async function getMarketplaceState(client: SqlClient): Promise<MarketplaceState> {
  const r = await client.query<{ state: MarketplaceState }>(
    `select state::text as state from marketplace_status where id = true`,
  );
  const row = r.rows[0];
  if (!row) throw new Error('marketplace_status singleton row missing');
  return row.state;
}

export async function lockMarketplace(client: SqlClient, batchRunId: string): Promise<void> {
  await client.query(
    `update marketplace_status
     set state = 'MARKET_LOCKED', locked_by_batch_run_id = $1, locked_at = now(), updated_at = now()
     where id = true`,
    [batchRunId],
  );
  await client.query(
    `update batch_runs set marketplace_locked_at = now() where id = $1 and marketplace_locked_at is null`,
    [batchRunId],
  );
  // Broadcast notification (Decision 065): one row for everyone.
  await insertNotification(client, {
    userId: null,
    type: 'MARKETPLACE_LOCKED',
    dedupeKey: `notif:MARKETPLACE_LOCKED:${batchRunId}`,
    payload: { ...renderNotification('MARKETPLACE_LOCKED'), batch_run_id: batchRunId },
  });
}

export async function reopenMarketplace(client: SqlClient, batchRunId: string): Promise<void> {
  // Manual Marketplace (Decision 076): unlist requests take effect AFTER
  // the batch. A listing that survived tonight's matching is delisted now
  // (a sale tonight wins — matched listings are no longer LISTED) and the
  // horse races again from tomorrow. Idempotent by shape.
  // Decision 086: auto_list OFF切替でフラグされたSMART出品も同じ約束事で
  // ここで取り下げる(sourceを問わない)。
  await client.query(
    `update market_listings set status = 'CANCELLED'
     where status = 'LISTED' and cancel_after_batch = true`,
  );
  // Decision 087: 売れ残ったSMART出品は毎晩ここで自動取り下げる。SMART出品中の
  // 馬は走り続けてDayが進むため、出品を持ち越すと「古いDay価格のまま今のDayの馬が
  // 売れる」価格ズレが生じる(売り手が損)。取り下げれば翌晩の利確選定が最新Dayの
  // 価格で出品し直す。手動出品は馬ごと凍結される(価格とDayが常に一致)ので持ち越す。
  await client.query(
    `update market_listings set status = 'CANCELLED'
     where status = 'LISTED' and source = 'SMART'`,
  );
  await client.query(
    `update marketplace_status
     set state = 'OPEN', locked_by_batch_run_id = null, locked_at = null, updated_at = now()
     where id = true and (locked_by_batch_run_id = $1 or locked_by_batch_run_id is null)`,
    [batchRunId],
  );
  await insertNotification(client, {
    userId: null,
    type: 'MARKETPLACE_REOPENED',
    dedupeKey: `notif:MARKETPLACE_REOPENED:${batchRunId}`,
    payload: { ...renderNotification('MARKETPLACE_REOPENED'), batch_run_id: batchRunId },
  });
}
