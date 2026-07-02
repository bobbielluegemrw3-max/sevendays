import { Money, generateSecureSeedHex, sha256Hex, sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { DAY0_MINT_PRICE } from '@sevendays/domain';
import {
  assignmentSettlement,
  day0MintSettlement,
  purchaseRefund,
  reserveAllocation,
} from '@sevendays/ledger';
import { generateBaseName, generateHorse, resolveNameCollision } from '@sevendays/race-engine';
import type { PriceTablePolicy } from '@sevendays/economy-engine';
import { getPrice } from '@sevendays/economy-engine';
import { buildBuyerQueue, buildHorseQueue } from './queues.js';

/**
 * Batch Steps 25-27 — Execute Assignment (05_SETTLEMENT_ENGINE.md).
 *
 * Priority (Decision 011, immutable):
 *   1. Eligible P2P horses Day1-Day6
 *   2. Day0 Mint fallback — only if the liquidity policy allows
 *   3. Refund
 *
 * Sequential one-to-one: Purchase #i <- Horse #i. Platform fee is ALWAYS 0:
 * buyer payment == seller proceeds. Ownership transfers ONLY after ledger
 * settlement (Ledger First, Ownership Second). A successful assignment
 * moves the buyer's ACTIVE revenge buff to APPLIED, bound to the received
 * horse (Decision 057).
 */

export interface ExecuteAssignmentInput {
  batchRunId: string;
  assignmentAlgorithmVersion: string;
  priceTable: PriceTablePolicy;
  allowDay0Mint: boolean;
  dailyDay0MintLimit: number;
  horseGenerationVersion: string;
}

export interface ExecuteAssignmentResult {
  p2pAssignments: number;
  day0Mints: number;
  unassigned: number;
}

export async function executeAssignment(
  client: SqlClient,
  input: ExecuteAssignmentInput,
): Promise<ExecuteAssignmentResult> {
  const horses = await buildHorseQueue(client, input.batchRunId, input.assignmentAlgorithmVersion);
  const buyers = await buildBuyerQueue(client, input.batchRunId, input.assignmentAlgorithmVersion);

  let p2p = 0;
  let mints = 0;
  let horseIndex = 0;
  let mintedThisBatch = await countBatchMints(client, input.batchRunId);

  for (const buyer of buyers) {
    // Skip sessions already settled (retry safety).
    const fresh = await client.query<{ status: string }>(
      `select status::text as status from purchase_sessions where id = $1`,
      [buyer.sessionId],
    );
    if (fresh.rows[0]?.status !== 'PENDING_ASSIGNMENT') continue;

    if (horseIndex < horses.length) {
      const horse = horses[horseIndex]!;
      horseIndex += 1;
      await settleP2pAssignment(client, input, buyer.sessionId, buyer.userId, horse);
      p2p += 1;
    } else if (input.allowDay0Mint && mintedThisBatch < input.dailyDay0MintLimit) {
      await settleDay0Mint(client, input, buyer.sessionId, buyer.userId);
      mints += 1;
      mintedThisBatch += 1;
    }
    // else: left PENDING for Step 27 (refund -> EXPIRED)
  }

  const unassigned = buyers.length - p2p - mints;
  return { p2pAssignments: p2p, day0Mints: mints, unassigned };
}

async function countBatchMints(client: SqlClient, batchRunId: string): Promise<number> {
  const r = await client.query<{ count: string }>(
    `select count(*)::text as count from ownership_assignments
     where batch_run_id = $1 and market_listing_id is null`,
    [batchRunId],
  );
  return Number(r.rows[0]!.count);
}

async function settleP2pAssignment(
  client: SqlClient,
  input: ExecuteAssignmentInput,
  sessionId: string,
  buyerUserId: string,
  horse: { listingId: string; horseId: string; sellerUserId: string; currentDay: number },
): Promise<void> {
  // P2P assignment price is ALWAYS price_table[current_day] (02_BUSINESS_MODEL.md).
  const price = getPrice(input.priceTable, horse.currentDay);

  const assignment = await client.query<{ id: string }>(
    `insert into ownership_assignments
       (batch_run_id, purchase_session_id, market_listing_id, horse_id, buyer_user_id, seller_user_id, assigned_price)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (purchase_session_id) do nothing
     returning id`,
    [input.batchRunId, sessionId, horse.listingId, horse.horseId, buyerUserId, horse.sellerUserId, price.toFixed8()],
  );
  if (assignment.rows.length === 0) return; // already assigned (retry)
  const assignmentId = assignment.rows[0]!.id;

  // Ledger First: buyer locked -> seller available, fee 0.
  const settlement = await assignmentSettlement(client, {
    buyerUserId,
    sellerUserId: horse.sellerUserId,
    price,
    idempotencyKey: `assign:${sessionId}`,
    referenceType: 'ownership_assignment',
    referenceId: assignmentId,
  });
  await refundLockDifference(client, sessionId, buyerUserId, price);

  // Ownership Second.
  await client.query(
    `update horses set owner_user_id = $2 where id = $1`,
    [horse.horseId, buyerUserId],
  );
  await client.query(
    `update market_listings set status = 'ASSIGNED' where id = $1`,
    [horse.listingId],
  );
  await client.query(
    `update ownership_assignments set status = 'SETTLED', ledger_transaction_id = $2 where id = $1`,
    [assignmentId, settlement.transactionId],
  );
  await client.query(
    `update purchase_sessions
     set status = 'ASSIGNED', assigned_price = $2, settled_at = now(), funds_locked = false
     where id = $1`,
    [sessionId, price.toFixed8()],
  );
  await applyRevengeBuff(client, buyerUserId, horse.horseId);
}

async function settleDay0Mint(
  client: SqlClient,
  input: ExecuteAssignmentInput,
  sessionId: string,
  buyerUserId: string,
): Promise<void> {
  const price = Money.of(DAY0_MINT_PRICE);

  // Deterministic horse id per session -> retries never mint twice.
  const horseId = uuidFromParts('mint', input.batchRunId, sessionId);

  // Commit-reveal mint seed (03_GAME_DESIGN.md): commit hash, generate, reveal.
  const mintSeed = generateSecureSeedHex();
  const mintSeedHash = sha256Hex(mintSeed);
  const generated = generateHorse({
    mintSeed,
    horseUuid: horseId,
    userUuid: buyerUserId,
    version: input.horseGenerationVersion,
  });
  const baseName = generateBaseName({
    mintSeed,
    horseUuid: horseId,
    version: input.horseGenerationVersion,
  });
  const taken = await client.query<{ count: string }>(
    `select count(*)::text as count from horses where name = $1 or name like $1 || ' %'`,
    [baseName],
  );
  const name = resolveNameCollision(baseName, Number(taken.rows[0]!.count));

  const inserted = await client.query<{ id: string }>(
    `insert into horses (id, owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, $3, $4::horse_type, $5::rarity, $6, $7, $8, $9, $10)
     on conflict (id) do nothing
     returning id`,
    [
      horseId,
      buyerUserId,
      name,
      generated.horseType,
      generated.rarity,
      generated.dnaHash,
      generated.dnaModifier,
      input.horseGenerationVersion,
      mintSeedHash,
      JSON.stringify({ ...generated.abilities, base_ability_score: generated.baseAbilityScore }),
    ],
  );
  if (inserted.rows.length > 0) {
    // Record + reveal the mint seed (verifiable: SHA-256(seed) == hash).
    await client.query(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('MINT', $1, $2)
       on conflict (reference_type, reference_id) do nothing`,
      [horseId, mintSeedHash],
    );
    await client.query(
      `update randomness_commits set reveal_seed = $2
       where reference_type = 'MINT' and reference_id = $1 and reveal_seed is null`,
      [horseId, mintSeed],
    );
  }

  const assignment = await client.query<{ id: string }>(
    `insert into ownership_assignments
       (batch_run_id, purchase_session_id, market_listing_id, horse_id, buyer_user_id, seller_user_id, assigned_price)
     values ($1, $2, null, $3, $4, null, $5)
     on conflict (purchase_session_id) do nothing
     returning id`,
    [input.batchRunId, sessionId, horseId, buyerUserId, price.toFixed8()],
  );
  if (assignment.rows.length === 0) return;
  const assignmentId = assignment.rows[0]!.id;

  // Ledger First: buyer locked -> platform mint revenue (Day0 Mint = the
  // ONLY platform revenue source).
  const settlement = await day0MintSettlement(client, {
    buyerUserId,
    idempotencyKey: `assign:${sessionId}`,
    referenceType: 'ownership_assignment',
    referenceId: assignmentId,
  });
  await refundLockDifference(client, sessionId, buyerUserId, price);

  await client.query(
    `update ownership_assignments set status = 'SETTLED', ledger_transaction_id = $2 where id = $1`,
    [assignmentId, settlement.transactionId],
  );
  await client.query(
    `update purchase_sessions
     set status = 'ASSIGNED', assigned_price = $2, settled_at = now(), funds_locked = false
     where id = $1`,
    [sessionId, price.toFixed8()],
  );
  await applyRevengeBuff(client, buyerUserId, horseId);
}

/** refund_amount = locked_amount - assigned_price (05_SETTLEMENT_ENGINE.md). */
async function refundLockDifference(
  client: SqlClient,
  sessionId: string,
  buyerUserId: string,
  price: Money,
): Promise<void> {
  const session = await client.query<{ locked_amount: string }>(
    `select locked_amount::text as locked_amount from purchase_sessions where id = $1`,
    [sessionId],
  );
  const refund = Money.of(session.rows[0]!.locked_amount).sub(price);
  if (refund.isZero()) return;
  await purchaseRefund(client, {
    userId: buyerUserId,
    amount: refund,
    idempotencyKey: `assignrefund:${sessionId}`,
    referenceType: 'purchase_session',
    referenceId: sessionId,
  });
  await client.query(
    `update purchase_sessions set refund_amount = $2 where id = $1`,
    [sessionId, refund.toFixed8()],
  );
}

/**
 * Decision 057: a successful assignment moves the buyer's ACTIVE buff to
 * APPLIED, bound to the received horse. Failed/refunded assignments never
 * reach this call.
 */
async function applyRevengeBuff(
  client: SqlClient,
  buyerUserId: string,
  horseId: string,
): Promise<void> {
  await client.query(
    `update revenge_buffs
     set status = 'APPLIED', applied_horse_id = $2, applied_at = now()
     where user_id = $1 and status = 'ACTIVE'`,
    [buyerUserId, horseId],
  );
}

/**
 * Batch Step 26 — Execute Reserve Allocation for every Day0 Mint settlement
 * in this batch (02_BUSINESS_MODEL.md: allocation immediately after mint).
 */
export async function executeReserveAllocations(
  client: SqlClient,
  batchRunId: string,
): Promise<number> {
  const mints = await client.query<{ id: string }>(
    `select id from ownership_assignments
     where batch_run_id = $1 and market_listing_id is null and status = 'SETTLED'
     order by id`,
    [batchRunId],
  );
  let allocations = 0;
  for (const mint of mints.rows) {
    const posted = await reserveAllocation(client, {
      idempotencyKey: `reserve:${mint.id}`,
      referenceType: 'ownership_assignment',
      referenceId: mint.id,
    });
    if (!posted.alreadyPosted) allocations += 1;
  }
  return allocations;
}

function uuidFromParts(...parts: string[]): string {
  const hex = sha256Parts(...parts).slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
