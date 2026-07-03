import { Money, generateSecureSeedHex, insertNotification, sha256Hex, sha256Parts } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { DAY0_MINT_PRICE, DAY0_MINT_TOTAL_CHARGE, renderNotification } from '@sevendays/domain';
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
 * Sequential one-to-one: Purchase #i <- Horse #i. Platform fee is ALWAYS 0.
 * Ownership transfers ONLY after ledger settlement (Ledger First,
 * Ownership Second). A successful assignment moves the buyer's ACTIVE
 * revenge buff to APPLIED, bound to the received horse (Decision 057).
 *
 * Crash safety (audit fix F-H): every settlement step is idempotent and the
 * session's ASSIGNED status is the FINAL marker. A session with an existing
 * assignment row RESUMES its recorded pairing (never consumes a new horse),
 * and the horse queue excludes horses already paired in this batch — an
 * interrupted run can always be re-executed to the identical outcome.
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

interface AssignmentRow {
  id: string;
  horse_id: string;
  market_listing_id: string | null;
  seller_user_id: string | null;
  assigned_price: string;
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
    const fresh = await client.query<{ status: string }>(
      `select status::text as status from purchase_sessions where id = $1`,
      [buyer.sessionId],
    );
    if (fresh.rows[0]?.status !== 'PENDING_ASSIGNMENT') continue;

    // Resume an interrupted pairing before consuming anything new (F-H).
    let assignment = await loadAssignment(client, buyer.sessionId);

    if (!assignment) {
      if (horseIndex < horses.length) {
        const horse = horses[horseIndex]!;
        horseIndex += 1;
        const price = getPrice(input.priceTable, horse.currentDay);
        await client.query(
          `insert into ownership_assignments
             (batch_run_id, purchase_session_id, market_listing_id, horse_id, buyer_user_id, seller_user_id, assigned_price)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (purchase_session_id) do nothing`,
          [input.batchRunId, buyer.sessionId, horse.listingId, horse.horseId, buyer.userId, horse.sellerUserId, price.toFixed8()],
        );
      } else if (input.allowDay0Mint && mintedThisBatch < input.dailyDay0MintLimit) {
        const horseId = await mintHorseAtomically(client, input, buyer.sessionId, buyer.userId);
        await client.query(
          `insert into ownership_assignments
             (batch_run_id, purchase_session_id, market_listing_id, horse_id, buyer_user_id, seller_user_id, assigned_price)
           values ($1, $2, null, $3, $4, null, $5)
           on conflict (purchase_session_id) do nothing`,
          [input.batchRunId, buyer.sessionId, horseId, buyer.userId, Money.of(DAY0_MINT_PRICE).toFixed8()],
        );
        mintedThisBatch += 1;
      } else {
        continue; // Step 27 will refund and expire
      }
      assignment = await loadAssignment(client, buyer.sessionId);
    }

    if (!assignment) continue; // defensive: should not happen
    await completeSettlement(client, buyer.sessionId, buyer.userId, assignment);
    if (assignment.market_listing_id === null) mints += 1;
    else p2p += 1;
  }

  const unassigned = buyers.length - p2p - mints;
  return { p2pAssignments: p2p, day0Mints: mints, unassigned };
}

async function loadAssignment(client: SqlClient, sessionId: string): Promise<AssignmentRow | null> {
  const r = await client.query<AssignmentRow>(
    `select id, horse_id, market_listing_id, seller_user_id, assigned_price::text as assigned_price
     from ownership_assignments where purchase_session_id = $1`,
    [sessionId],
  );
  return r.rows[0] ?? null;
}

/**
 * Idempotent settlement sequence — safe to re-run from any interruption
 * point. Session ASSIGNED is the final marker; the caller only invokes this
 * while the session is still PENDING_ASSIGNMENT.
 */
async function completeSettlement(
  client: SqlClient,
  sessionId: string,
  buyerUserId: string,
  assignment: AssignmentRow,
): Promise<void> {
  const price = Money.of(assignment.assigned_price);

  // 1. Ledger First (idempotency key: one settlement per session, ever).
  const settlement =
    assignment.seller_user_id === null
      ? await day0MintSettlement(client, {
          buyerUserId,
          idempotencyKey: `assign:${sessionId}`,
          referenceType: 'ownership_assignment',
          referenceId: assignment.id,
        })
      : await assignmentSettlement(client, {
          buyerUserId,
          sellerUserId: assignment.seller_user_id,
          price,
          idempotencyKey: `assign:${sessionId}`,
          referenceType: 'ownership_assignment',
          referenceId: assignment.id,
        });

  // 2. Refund the lock difference (idempotent by key). Day0 mints charge
  //    price + fee = 102 (Decision 069); P2P charges the listed price (the
  //    seller-side fee never touches the buyer's lock).
  const session = await client.query<{ locked_amount: string }>(
    `select locked_amount::text as locked_amount from purchase_sessions where id = $1`,
    [sessionId],
  );
  const charge = assignment.seller_user_id === null ? Money.of(DAY0_MINT_TOTAL_CHARGE) : price;
  const refund = Money.of(session.rows[0]!.locked_amount).sub(charge);
  if (!refund.isZero()) {
    await purchaseRefund(client, {
      userId: buyerUserId,
      amount: refund,
      idempotencyKey: `assignrefund:${sessionId}`,
      referenceType: 'purchase_session',
      referenceId: sessionId,
    });
  }

  // 3. Ownership Second.
  await client.query(`update horses set owner_user_id = $2 where id = $1`, [
    assignment.horse_id,
    buyerUserId,
  ]);
  if (assignment.market_listing_id !== null) {
    await client.query(`update market_listings set status = 'ASSIGNED' where id = $1`, [
      assignment.market_listing_id,
    ]);
  }
  await client.query(
    `update ownership_assignments set status = 'SETTLED', ledger_transaction_id = $2 where id = $1`,
    [assignment.id, settlement.transactionId],
  );

  // 4. Buff: ACTIVE -> APPLIED bound to the received horse (Decision 057).
  await client.query(
    `update revenge_buffs
     set status = 'APPLIED', applied_horse_id = $2, applied_at = now()
     where user_id = $1 and status = 'ACTIVE'`,
    [buyerUserId, assignment.horse_id],
  );

  // In-App notification (Decision 065) — BEFORE the final marker so a crash
  // re-runs this idempotently (dedupe key) while the session is still open.
  const horse = await client.query<{ name: string; current_day: number }>(
    `select name, current_day from horses where id = $1`,
    [assignment.horse_id],
  );
  const rendered = renderNotification('ASSIGNMENT_COMPLETED', {
    horse_name: horse.rows[0]?.name ?? '',
    current_day: horse.rows[0]?.current_day ?? 0,
    price: price.toFixed8(),
  });
  await insertNotification(client, {
    userId: buyerUserId,
    type: 'ASSIGNMENT_COMPLETED',
    dedupeKey: `notif:ASSIGNMENT_COMPLETED:${sessionId}`,
    payload: { ...rendered, horse_id: assignment.horse_id, price: price.toFixed8() },
  });

  // 5. Final marker.
  await client.query(
    `update purchase_sessions
     set status = 'ASSIGNED', assigned_price = $2, refund_amount = $3,
         settled_at = now(), funds_locked = false
     where id = $1 and status = 'PENDING_ASSIGNMENT'`,
    [sessionId, price.toFixed8(), refund.isZero() ? null : refund.toFixed8()],
  );
}

async function countBatchMints(client: SqlClient, batchRunId: string): Promise<number> {
  const r = await client.query<{ count: string }>(
    `select count(*)::text as count from ownership_assignments
     where batch_run_id = $1 and market_listing_id is null`,
    [batchRunId],
  );
  return Number(r.rows[0]!.count);
}

/**
 * Day0 Mint (audit fix F-I): horse row, commit hash, and seed reveal are
 * one transaction — a horse can never exist without its verifiable
 * commit-reveal record. Horse id derives from the session, so retries
 * never mint twice (a pre-existing horse short-circuits).
 */
async function mintHorseAtomically(
  client: SqlClient,
  input: ExecuteAssignmentInput,
  sessionId: string,
  buyerUserId: string,
): Promise<string> {
  const horseId = uuidFromParts('mint', input.batchRunId, sessionId);
  const existing = await client.query<{ id: string }>(`select id from horses where id = $1`, [horseId]);
  if (existing.rows[0]) return horseId;

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

  await client.query('begin');
  try {
    await client.query(
      `insert into horses (id, owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, $2, $3, $4::horse_type, $5::rarity, $6, $7, $8, $9, $10)
       on conflict (id) do nothing`,
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
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
  return horseId;
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
