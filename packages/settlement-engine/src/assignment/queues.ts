import type { SqlClient } from '@sevendays/shared';
import { marketTiebreakScore, purchaseTiebreakScore } from './tiebreak.js';

/**
 * Deterministic queues (05_SETTLEMENT_ENGINE.md, Decisions 012/013).
 *
 * Horse Queue:  listed_at ASC -> current_day DESC -> market tiebreak DESC -> horse_uuid ASC
 * Buyer Queue:  created_at ASC -> purchase tiebreak DESC -> session_uuid ASC
 *
 * VIP, referral, balance size, AI preference, or admin preference MUST
 * NEVER affect these orders. Sorting happens in JS on exact values so the
 * comparison semantics are fixed by code, not by DB collation.
 */

export interface QueuedHorse {
  listingId: string;
  horseId: string;
  sellerUserId: string;
  currentDay: number;
  listedAtMs: number;
  listingPrice: string;
  tiebreak: number;
}

export interface QueuedBuyer {
  sessionId: string;
  userId: string;
  lockedAmount: string;
  createdAtMs: number;
  tiebreak: number;
}

/** Batch Step 23 — Build Horse Queue from live listings (Day1-Day6 only). */
export async function buildHorseQueue(
  client: SqlClient,
  batchRunId: string,
  assignmentAlgorithmVersion: string,
): Promise<QueuedHorse[]> {
  const listings = await client.query<{
    id: string;
    horse_id: string;
    seller_user_id: string;
    current_day: number;
    listed_at: string;
    listing_price: string;
  }>(
    `select l.id, l.horse_id, l.seller_user_id, l.current_day,
            l.listed_at::text as listed_at, l.listing_price::text as listing_price
     from market_listings l
     join horses h on h.id = l.horse_id
     where l.status = 'LISTED' and h.status = 'ACTIVE'
       and l.current_day between 1 and 6
       -- crash-resume safety (F-H): a horse already paired in this batch is
       -- reserved for its interrupted assignment and never re-queued
       and not exists (select 1 from ownership_assignments oa
                       where oa.horse_id = l.horse_id and oa.batch_run_id = $1)`,
    [batchRunId],
  );
  const queue: QueuedHorse[] = listings.rows.map((l) => ({
    listingId: l.id,
    horseId: l.horse_id,
    sellerUserId: l.seller_user_id,
    currentDay: l.current_day,
    listedAtMs: new Date(l.listed_at).getTime(),
    listingPrice: l.listing_price,
    tiebreak: marketTiebreakScore(batchRunId, l.horse_id, assignmentAlgorithmVersion),
  }));
  queue.sort((a, b) => {
    if (a.listedAtMs !== b.listedAtMs) return a.listedAtMs - b.listedAtMs;
    if (a.currentDay !== b.currentDay) return b.currentDay - a.currentDay;
    if (a.tiebreak !== b.tiebreak) return b.tiebreak - a.tiebreak;
    return a.horseId < b.horseId ? -1 : a.horseId > b.horseId ? 1 : 0;
  });
  return queue;
}

/** Batch Step 24 — Build Buyer Queue from sessions locked into this batch. */
export async function buildBuyerQueue(
  client: SqlClient,
  batchRunId: string,
  assignmentAlgorithmVersion: string,
): Promise<QueuedBuyer[]> {
  const sessions = await client.query<{
    id: string;
    user_id: string;
    locked_amount: string;
    created_at: string;
  }>(
    `select id, user_id, locked_amount::text as locked_amount, created_at::text as created_at
     from purchase_sessions
     where batch_run_id = $1 and status = 'PENDING_ASSIGNMENT'`,
    [batchRunId],
  );
  const queue: QueuedBuyer[] = sessions.rows.map((s) => ({
    sessionId: s.id,
    userId: s.user_id,
    lockedAmount: s.locked_amount,
    createdAtMs: new Date(s.created_at).getTime(),
    tiebreak: purchaseTiebreakScore(batchRunId, s.id, assignmentAlgorithmVersion),
  }));
  queue.sort((a, b) => {
    if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
    if (a.tiebreak !== b.tiebreak) return b.tiebreak - a.tiebreak;
    return a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0;
  });
  return queue;
}
