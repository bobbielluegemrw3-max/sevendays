import { insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { renderNotification } from '@sevendays/domain';
import type { EligibleHorse, PriceTablePolicy } from '@sevendays/economy-engine';
import { getPrice } from '@sevendays/economy-engine';
import { marketTiebreakScore } from '../assignment/tiebreak.js';
import { acquisitionCost, projectedPnl } from './pnl.js';

/**
 * Batch Step 22 — Create Market Listings from the deterministic Profit
 * Taking selection. Listing only: ownership stays with the seller until
 * Assignment Settlement completes (Decision 015). Each created listing
 * notifies its owner (AUTO_LISTED, Decision 086) — dedupe-keyed so a
 * resumed batch never double-notifies.
 */
export async function createMarketListings(
  client: SqlClient,
  input: {
    batchRunId: string;
    selection: readonly EligibleHorse[];
    priceTable: PriceTablePolicy;
    assignmentAlgorithmVersion: string;
  },
): Promise<number> {
  let created = 0;
  for (const horse of input.selection) {
    const price = getPrice(input.priceTable, horse.currentDay);
    const inserted = await client.query<{ id: string }>(
      `insert into market_listings
         (horse_id, seller_user_id, listing_price, current_day, batch_run_id, deterministic_market_tiebreak_score)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (horse_id) where status = 'LISTED' do nothing
       returning id`,
      [
        horse.horseId,
        horse.ownerUserId,
        price.toFixed8(),
        horse.currentDay,
        input.batchRunId,
        marketTiebreakScore(input.batchRunId, horse.horseId, input.assignmentAlgorithmVersion),
      ],
    );
    if (inserted.rows.length === 0) continue;
    created += 1;
    await client.query(`update horses set last_listed_at = now() where id = $1`, [horse.horseId]);

    const named = await client.query<{ name: string }>(`select name from horses where id = $1`, [
      horse.horseId,
    ]);
    const rendered = renderNotification('AUTO_LISTED', {
      horse_name: named.rows[0]?.name ?? '',
      price: price.toFixed8(),
    });
    // 施策E: 見込み損益(売却されれば幾ら手取りになるか)を添える。
    // 出品はまだ売却ではないので projected として表示する。
    const acq = await acquisitionCost(client, horse.horseId, horse.ownerUserId);
    const pnl = acq ? projectedPnl(acq, price) : {};
    await insertNotification(client, {
      userId: horse.ownerUserId,
      type: 'AUTO_LISTED',
      dedupeKey: `notif:AUTO_LISTED:${input.batchRunId}:${horse.horseId}`,
      payload: { ...rendered, horse_id: horse.horseId, price: price.toFixed8(), ...pnl },
    });
  }
  return created;
}
