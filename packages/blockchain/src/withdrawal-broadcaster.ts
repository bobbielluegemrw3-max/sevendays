import { Money, insertNotification, type SqlClient } from '@sevendays/shared';
import { WITHDRAWAL_ADMIN_REVIEW_THRESHOLD, renderNotification, type AdminRole } from '@sevendays/domain';
import { withdrawalRejectionRefund } from '@sevendays/ledger';
import { isAddress } from 'viem';
import type { ChainClient, WithdrawalSigner } from './types.js';
import type { ChainConfig } from './config.js';
import { AmountConversionError, gasCostToUsdtFee, moneyToUnits } from './amounts.js';

/**
 * Withdrawal broadcaster core (07_API.md Withdrawal v1.0,
 * 01_CONSTITUTION.md): funds are ALREADY locked through Ledger by
 * POST /wallet/withdraw (rows arrive here as LOCKED); this module deducts
 * the network fee, signs, broadcasts, and confirms.
 *
 * Double-send safety: the signed raw transaction and its hash are persisted
 * (status BROADCAST) BEFORE the first send. Any crash after that point can
 * only ever re-send the SAME bytes — same nonce, same hash — which the chain
 * deduplicates. We never re-sign a row that has raw_tx.
 *
 * Ledger notes: WITHDRAWAL_FUND_LOCK moved requested_amount into
 * PLATFORM_WITHDRAWAL_CLEARING, which (like PLATFORM_DEPOSIT_CLEARING) is
 * the external-world boundary account. On confirmation the funds simply
 * remain there as the record of value that left the platform (net paid to
 * the user, fee consumed by the network), mirroring how deposits leave
 * PLATFORM_DEPOSIT_CLEARING negative. Failure/rejection refunds via
 * WITHDRAWAL_REJECTION_REFUND with the deterministic key `wdrefund:{id}`,
 * so a crash between refund and status update replays harmlessly.
 *
 * Admin Review (E14 threshold pending owner decision): when
 * `adminReviewThreshold` is set, large LOCKED rows are routed to
 * ADMIN_REVIEW and only proceed via approveWithdrawal / rejectWithdrawal.
 */

export interface WithdrawalPolicy {
  /**
   * Decision 061: fee = actual gas cost pass-through. USDT per 1 native
   * token (ops-configured); fee is computed per run from live gas prices.
   */
  nativeUsdtRate: Money;
  /**
   * Decision 060: route requests >= this to ADMIN_REVIEW.
   * OMITTED (undefined) -> the domain default (1,000 USDT) applies, so a
   * misconfigured worker cannot silently disable the review. Explicit
   * null disables routing (tests / owner override only).
   */
  adminReviewThreshold?: Money | null;
  /** Confirmations before a broadcast counts as final (default: deposit's 128). */
  confirmationBlocks?: number;
  /** Broadcast batch size per run. */
  maxBroadcastsPerRun?: number;
}

export interface WithdrawalRunResult {
  lockAcquired: boolean;
  routedToReview: number;
  /** Fully-approved ADMIN_REVIEW rows released here after an approval-side crash. */
  releasedFromReview: number;
  rejected: number;
  broadcast: number;
  sendErrors: number;
  rebroadcast: number;
  confirmed: number;
  failed: number;
}

interface WithdrawalRow {
  id: string;
  user_id: string;
  to_address: string;
  requested_amount: string;
  net_amount: string;
  tx_hash: string | null;
  raw_tx: string | null;
}

async function audit(
  client: SqlClient,
  actor: { type: 'SYSTEM' | 'ADMIN'; id?: string },
  action: string,
  withdrawalId: string,
): Promise<void> {
  await client.query(
    `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id)
     values ($1, $2, $3, 'blockchain_withdrawal', $4)`,
    [actor.type, actor.id ?? null, action, withdrawalId],
  );
}

/**
 * Refund the full locked amount and move the row to `status`. Idempotent:
 * the refund replays by key, the status update converges.
 */
/** True if the rejection/failure refund for this withdrawal was already posted. */
async function refundExists(client: SqlClient, withdrawalId: string): Promise<boolean> {
  const r = await client.query<{ id: string }>(
    `select id from ledger_transactions where idempotency_key = $1`,
    [`wdrefund:${withdrawalId}`],
  );
  return r.rows.length > 0;
}

async function refundAndClose(
  client: SqlClient,
  row: Pick<WithdrawalRow, 'id' | 'user_id' | 'requested_amount'>,
  status: 'REJECTED' | 'FAILED',
  action: string,
  actor: { type: 'SYSTEM' | 'ADMIN'; id?: string },
): Promise<void> {
  await withdrawalRejectionRefund(client, {
    userId: row.user_id,
    amount: Money.of(row.requested_amount),
    idempotencyKey: `wdrefund:${row.id}`,
    referenceType: 'blockchain_withdrawal',
    referenceId: row.id,
  });
  // Notify before the status marker (Decision 065): replays dedupe away.
  await insertNotification(client, {
    userId: row.user_id,
    type: 'WITHDRAWAL_FAILED',
    dedupeKey: `notif:WITHDRAWAL_FAILED:${row.id}`,
    payload: { ...renderNotification('WITHDRAWAL_FAILED'), withdrawal_id: row.id, reason: action },
  });
  await client.query(`update blockchain_withdrawals set status = $2 where id = $1`, [row.id, status]);
  await audit(client, actor, action, row.id);
}

/**
 * Admin approval (Decision 060): dual approval by two DISTINCT admins —
 * one FINANCE_ADMIN and one SUPER_ADMIN, like the Recovery Procedure. The
 * row returns to the broadcast queue (LOCKED) only once both roles have
 * approved; review_approved_at then makes approval terminal (never
 * re-routed). DB constraints enforce distinct persons, one approval per
 * role, and that the approver actually holds the role.
 */
export async function approveWithdrawal(
  client: SqlClient,
  args: { withdrawalId: string; adminUserId: string; adminRole: AdminRole },
): Promise<{ approvedRoles: AdminRole[]; released: boolean }> {
  const row = await client.query<{ status: string; review_approved_at: string | null }>(
    `select status::text as status, review_approved_at::text as review_approved_at
     from blockchain_withdrawals where id = $1`,
    [args.withdrawalId],
  );
  if (!row.rows[0]) throw new Error(`Withdrawal ${args.withdrawalId} is not in ADMIN_REVIEW`);
  if (row.rows[0].status !== 'ADMIN_REVIEW') {
    // Replay of an approval that already released: report the final state.
    if (row.rows[0].review_approved_at) {
      const done = await client.query<{ admin_role: AdminRole }>(
        `select admin_role::text as admin_role from withdrawal_review_approvals where withdrawal_id = $1`,
        [args.withdrawalId],
      );
      return { approvedRoles: done.rows.map((r) => r.admin_role), released: true };
    }
    throw new Error(`Withdrawal ${args.withdrawalId} is not in ADMIN_REVIEW`);
  }

  // A duplicate approval (same admin or same role) is an idempotent replay,
  // NOT an error: the release evaluation below must still run so a crash
  // between insert and release always self-heals on the next call.
  let inserted = true;
  try {
    await client.query(
      `insert into withdrawal_review_approvals (withdrawal_id, admin_user_id, admin_role)
       values ($1, $2, $3)`,
      [args.withdrawalId, args.adminUserId, args.adminRole],
    );
  } catch (error) {
    if (!/duplicate key/i.test((error as Error).message)) throw error;
    inserted = false;
  }
  if (inserted) {
    await audit(
      client,
      { type: 'ADMIN', id: args.adminUserId },
      `WITHDRAWAL_REVIEW_APPROVED:${args.adminRole}`,
      args.withdrawalId,
    );
  }

  const approvals = await client.query<{ admin_role: AdminRole }>(
    `select admin_role::text as admin_role from withdrawal_review_approvals where withdrawal_id = $1`,
    [args.withdrawalId],
  );
  const approvedRoles = approvals.rows.map((r) => r.admin_role);
  const bothRoles = approvedRoles.includes('FINANCE_ADMIN') && approvedRoles.includes('SUPER_ADMIN');
  if (!bothRoles) return { approvedRoles, released: false };

  // A refund posted by a crashed rejection wins: releasing now would pay
  // the user TWICE (refund + broadcast). Converge to REJECTED instead.
  if (await refundExists(client, args.withdrawalId)) {
    await client.query(
      `update blockchain_withdrawals set status = 'REJECTED' where id = $1 and status = 'ADMIN_REVIEW'`,
      [args.withdrawalId],
    );
    await audit(
      client,
      { type: 'ADMIN', id: args.adminUserId },
      'WITHDRAWAL_REVIEW_CONVERGED_TO_REJECTED',
      args.withdrawalId,
    );
    return { approvedRoles, released: false };
  }

  await client.query(
    `update blockchain_withdrawals
     set status = 'LOCKED', review_approved_at = now()
     where id = $1 and status = 'ADMIN_REVIEW'`,
    [args.withdrawalId],
  );
  await audit(client, { type: 'ADMIN', id: args.adminUserId }, 'WITHDRAWAL_REVIEW_RELEASED', args.withdrawalId);
  return { approvedRoles, released: true };
}

/** Admin rejection: ADMIN_REVIEW -> REJECTED with full refund. */
export async function rejectWithdrawal(
  client: SqlClient,
  args: { withdrawalId: string; adminUserId: string },
): Promise<void> {
  const rows = await client.query<WithdrawalRow>(
    `select id, user_id, to_address, requested_amount::text as requested_amount, net_amount::text as net_amount, tx_hash, raw_tx
     from blockchain_withdrawals where id = $1 and status = 'ADMIN_REVIEW'`,
    [args.withdrawalId],
  );
  const row = rows.rows[0];
  if (!row) throw new Error(`Withdrawal ${args.withdrawalId} is not in ADMIN_REVIEW`);
  await refundAndClose(client, row, 'REJECTED', 'WITHDRAWAL_REVIEW_REJECTED', {
    type: 'ADMIN',
    id: args.adminUserId,
  });
}

async function routeLargeWithdrawalsToReview(
  client: SqlClient,
  config: ChainConfig,
  threshold: Money,
  result: WithdrawalRunResult,
): Promise<void> {
  const routed = await client.query<{ id: string }>(
    `update blockchain_withdrawals set status = 'ADMIN_REVIEW'
     where chain_id = $1 and status = 'LOCKED' and requested_amount >= $2
       and review_approved_at is null
     returning id`,
    [config.chainId, threshold.toFixed8()],
  );
  for (const row of routed.rows) {
    await audit(client, { type: 'SYSTEM' }, 'WITHDRAWAL_ROUTED_TO_ADMIN_REVIEW', row.id);
    result.routedToReview += 1;
  }
}

/**
 * Self-heal for the approval crash window: an ADMIN_REVIEW row whose dual
 * approval completed but whose release update was lost is released here —
 * unless a refund was already posted (crashed rejection), in which case it
 * converges to REJECTED (paying out on top of a refund would be a double
 * payment).
 */
async function releaseFullyApprovedReviews(
  client: SqlClient,
  config: ChainConfig,
  result: WithdrawalRunResult,
): Promise<void> {
  const stuck = await client.query<{ id: string; refunded: boolean }>(
    `select w.id,
            exists (select 1 from ledger_transactions t
                    where t.idempotency_key = 'wdrefund:' || w.id) as refunded
     from blockchain_withdrawals w
     where w.chain_id = $1 and w.status = 'ADMIN_REVIEW'
       and (select count(distinct a.admin_role)
            from withdrawal_review_approvals a where a.withdrawal_id = w.id) = 2`,
    [config.chainId],
  );
  for (const row of stuck.rows) {
    if (row.refunded) {
      await client.query(
        `update blockchain_withdrawals set status = 'REJECTED' where id = $1 and status = 'ADMIN_REVIEW'`,
        [row.id],
      );
      await audit(client, { type: 'SYSTEM' }, 'WITHDRAWAL_REVIEW_CONVERGED_TO_REJECTED', row.id);
      result.rejected += 1;
    } else {
      await client.query(
        `update blockchain_withdrawals
         set status = 'LOCKED', review_approved_at = now()
         where id = $1 and status = 'ADMIN_REVIEW'`,
        [row.id],
      );
      await audit(client, { type: 'SYSTEM' }, 'WITHDRAWAL_REVIEW_RELEASED', row.id);
      result.releasedFromReview += 1;
    }
  }
}

async function broadcastLockedWithdrawals(
  client: SqlClient,
  chain: ChainClient,
  signer: WithdrawalSigner,
  config: ChainConfig,
  policy: WithdrawalPolicy,
  reviewThreshold: Money | null,
  result: WithdrawalRunResult,
  broadcastThisRun: Set<string>,
): Promise<void> {
  // The threshold filter here is NOT redundant with the routing phase: a
  // row inserted by the API between routing and this select would
  // otherwise bypass the Decision 060 review entirely.
  const batch = await client.query<WithdrawalRow>(
    `select id, user_id, to_address, requested_amount::text as requested_amount, net_amount::text as net_amount, tx_hash, raw_tx
     from blockchain_withdrawals
     where chain_id = $1 and status = 'LOCKED'
       and ($2::numeric is null or requested_amount < $2::numeric or review_approved_at is not null)
     order by requested_at, id
     limit $3`,
    [config.chainId, reviewThreshold ? reviewThreshold.toFixed8() : null, policy.maxBroadcastsPerRun ?? 20],
  );
  if (batch.rows.length === 0) return;

  // One gas quote per run: the fee is the pre-broadcast actual-cost
  // estimate (Decision 061) and every signature in this run uses the same
  // gas parameters.
  const gas = await chain.getGasFees();
  const networkFee = gasCostToUsdtFee({
    gasLimit: config.transferGasLimit,
    maxFeePerGas: gas.maxFeePerGas,
    nativeUsdtRate: policy.nativeUsdtRate,
    tokenDecimals: config.tokenDecimals,
  });

  let nonce: bigint | null = null;
  for (const row of batch.rows) {
    const requested = Money.of(row.requested_amount);
    const net = requested.sub(networkFee);

    if (!isAddress(row.to_address)) {
      await refundAndClose(client, row, 'REJECTED', 'WITHDRAWAL_REJECTED:INVALID_ADDRESS', { type: 'SYSTEM' });
      result.rejected += 1;
      continue;
    }
    if (net.lte(Money.zero())) {
      await refundAndClose(client, row, 'REJECTED', 'WITHDRAWAL_REJECTED:NET_AMOUNT_NOT_POSITIVE', {
        type: 'SYSTEM',
      });
      result.rejected += 1;
      continue;
    }
    let valueUnits: bigint;
    try {
      valueUnits = moneyToUnits(net, config.tokenDecimals);
    } catch (error) {
      if (!(error instanceof AmountConversionError)) throw error;
      await refundAndClose(client, row, 'REJECTED', 'WITHDRAWAL_REJECTED:AMOUNT_NOT_REPRESENTABLE', {
        type: 'SYSTEM',
      });
      result.rejected += 1;
      continue;
    }

    // net_amount check constraint (net = requested - fee) keeps this honest.
    await client.query(
      `update blockchain_withdrawals set network_fee_amount = $2, net_amount = $3 where id = $1`,
      [row.id, networkFee.toFixed8(), net.toFixed8()],
    );

    nonce = nonce ?? (await chain.getPendingNonce(signer.address));
    const signed = await signer.signTokenTransfer({
      tokenContract: config.tokenContract,
      to: row.to_address,
      valueUnits,
      nonce,
      gas,
    });
    nonce += 1n;

    // Persist the transaction identity BEFORE the first send (see header).
    await client.query(
      `update blockchain_withdrawals
       set tx_hash = $2, raw_tx = $3, status = 'BROADCAST', broadcast_at = now()
       where id = $1 and status = 'LOCKED'`,
      [row.id, signed.txHash, signed.rawTx],
    );
    result.broadcast += 1;
    broadcastThisRun.add(row.id);

    try {
      await chain.sendRawTransaction(signed.rawTx);
    } catch {
      // The row stays BROADCAST with its raw_tx; the confirm pass below (or
      // the next run) re-sends the same bytes. Never re-sign here.
      result.sendErrors += 1;
    }
  }
}

async function confirmBroadcastWithdrawals(
  client: SqlClient,
  chain: ChainClient,
  config: ChainConfig,
  policy: WithdrawalPolicy,
  result: WithdrawalRunResult,
  broadcastThisRun: Set<string>,
): Promise<void> {
  const confirmations = BigInt(policy.confirmationBlocks ?? config.confirmationBlocks);
  const pending = await client.query<WithdrawalRow>(
    `select id, user_id, to_address, requested_amount::text as requested_amount, net_amount::text as net_amount, tx_hash, raw_tx
     from blockchain_withdrawals
     where chain_id = $1 and status = 'BROADCAST'
     order by broadcast_at, id`,
    [config.chainId],
  );
  if (pending.rows.length === 0) return;

  const latest = await chain.getLatestBlockNumber();
  for (const row of pending.rows) {
    const status = await chain.getTransactionStatus(row.tx_hash!);
    if (status.kind === 'NOT_FOUND') {
      // Sent moments ago in this very run — give the mempool a pass before
      // re-sending the same bytes on the NEXT run.
      if (broadcastThisRun.has(row.id)) continue;
      try {
        await chain.sendRawTransaction(row.raw_tx!);
        result.rebroadcast += 1;
      } catch {
        result.sendErrors += 1;
      }
      continue;
    }
    if (status.kind === 'PENDING') continue;

    // Both SUCCESS and REVERTED are only final past the confirmation depth
    // (reorg protection — refunding a reverted tx too early risks paying twice).
    if (latest - status.blockNumber + 1n < confirmations) continue;

    if (status.kind === 'SUCCESS') {
      await insertNotification(client, {
        userId: row.user_id,
        type: 'WITHDRAWAL_COMPLETED',
        dedupeKey: `notif:WITHDRAWAL_COMPLETED:${row.id}`,
        payload: {
          ...renderNotification('WITHDRAWAL_COMPLETED', { amount: row.net_amount }),
          withdrawal_id: row.id,
          tx_hash: row.tx_hash,
        },
      });
      await client.query(
        `update blockchain_withdrawals set status = 'CONFIRMED', confirmed_at = now() where id = $1`,
        [row.id],
      );
      result.confirmed += 1;
    } else {
      await refundAndClose(client, row, 'FAILED', 'WITHDRAWAL_FAILED:ON_CHAIN_REVERT', { type: 'SYSTEM' });
      result.failed += 1;
    }
  }
}

/**
 * One broadcaster pass. A session advisory lock guarantees a single runner
 * per chain (nonce continuity); a held lock returns immediately.
 */
export async function processWithdrawals(
  client: SqlClient,
  chain: ChainClient,
  signer: WithdrawalSigner,
  config: ChainConfig,
  policy: WithdrawalPolicy,
): Promise<WithdrawalRunResult> {
  const result: WithdrawalRunResult = {
    lockAcquired: false,
    routedToReview: 0,
    releasedFromReview: 0,
    rejected: 0,
    broadcast: 0,
    sendErrors: 0,
    rebroadcast: 0,
    confirmed: 0,
    failed: 0,
  };

  const lock = await client.query<{ acquired: boolean }>(
    `select pg_try_advisory_lock(hashtext('withdrawal_broadcaster:' || $1)) as acquired`,
    [config.chainId],
  );
  if (!lock.rows[0]?.acquired) return result;
  result.lockAcquired = true;

  try {
    // undefined -> domain default; only an EXPLICIT null disables routing.
    const reviewThreshold =
      policy.adminReviewThreshold === undefined
        ? Money.of(WITHDRAWAL_ADMIN_REVIEW_THRESHOLD)
        : policy.adminReviewThreshold;
    if (reviewThreshold) {
      await routeLargeWithdrawalsToReview(client, config, reviewThreshold, result);
    }
    await releaseFullyApprovedReviews(client, config, result);
    const broadcastThisRun = new Set<string>();
    await broadcastLockedWithdrawals(client, chain, signer, config, policy, reviewThreshold, result, broadcastThisRun);
    await confirmBroadcastWithdrawals(client, chain, config, policy, result, broadcastThisRun);
  } finally {
    await client.query(`select pg_advisory_unlock(hashtext('withdrawal_broadcaster:' || $1))`, [config.chainId]);
  }
  return result;
}
