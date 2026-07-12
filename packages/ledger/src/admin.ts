import type { AdminRole } from '@sevendays/domain';
import { Money } from '@sevendays/shared';
import { postTransaction } from './post.js';
import {
  LedgerError,
  type PostTransactionInput,
  type PostedTransaction,
  type SqlClient,
} from './types.js';

/**
 * Admin ledger adjustment (01_CONSTITUTION.md):
 *   "Admin adjustments require audit records and dual approval."
 *
 * Dual approval means two DISTINCT users whose active roles together cover
 * FINANCE_ADMIN and SUPER_ADMIN. The adjustment and its audit record are
 * committed atomically — an adjustment without an audit row cannot exist.
 */

export interface AdminAdjustmentInput extends PostTransactionInput {
  reason: string;
  approvedBy1: string;
  approvedBy2: string;
}

/**
 * Decision 089 (2026-07-13): adjustments of this size or less may be posted
 * by a SINGLE active FINANCE_ADMIN/SUPER_ADMIN (audit record still
 * mandatory). Mirrors the withdrawal-review threshold philosophy
 * (Decision 060-064: only large movements need two humans). Larger
 * adjustments keep constitutional dual approval.
 */
export const SINGLE_APPROVAL_ADJUSTMENT_LIMIT_USDT = 1000;

export interface SingleApproverAdjustmentInput extends PostTransactionInput {
  reason: string;
  approvedBy: string;
}

async function activeRolesOf(client: SqlClient, userId: string): Promise<AdminRole[]> {
  const r = await client.query<{ role: AdminRole }>(
    `select role from admin_role_grants where user_id = $1 and revoked_at is null`,
    [userId],
  );
  return r.rows.map((row) => row.role);
}

export async function postAdminAdjustment(
  client: SqlClient,
  input: AdminAdjustmentInput,
): Promise<PostedTransaction> {
  if (input.approvedBy1 === input.approvedBy2) {
    throw new LedgerError(
      'DUAL_APPROVAL_REQUIRED',
      'Dual approval requires two distinct approvers',
    );
  }
  // Approvers must be ACTIVE users — a suspended/banned admin cannot approve.
  const statuses = await client.query<{ id: string; status: string }>(
    `select id, status::text as status from users where id in ($1, $2)`,
    [input.approvedBy1, input.approvedBy2],
  );
  const activeIds = new Set(statuses.rows.filter((r) => r.status === 'ACTIVE').map((r) => r.id));
  if (!activeIds.has(input.approvedBy1) || !activeIds.has(input.approvedBy2)) {
    throw new LedgerError('DUAL_APPROVAL_REQUIRED', 'Approvers must be ACTIVE users');
  }
  const roles1 = await activeRolesOf(client, input.approvedBy1);
  const roles2 = await activeRolesOf(client, input.approvedBy2);
  const combined = new Set<AdminRole>([...roles1, ...roles2]);
  if (!combined.has('FINANCE_ADMIN') || !combined.has('SUPER_ADMIN')) {
    throw new LedgerError(
      'DUAL_APPROVAL_REQUIRED',
      'Approvers must jointly hold FINANCE_ADMIN and SUPER_ADMIN roles',
    );
  }

  await client.query('begin');
  try {
    const posted = await postTransaction(
      client,
      { ...input, type: 'ADMIN_ADJUSTMENT' },
      { manageTransaction: false },
    );
    if (!posted.alreadyPosted) {
      const metadata = JSON.stringify({ reason: input.reason });
      await client.query(
        `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id, metadata_json)
         values ('ADMIN', $1, 'ADMIN_LEDGER_ADJUSTMENT', 'ledger_transaction', $2, $3)`,
        [input.approvedBy1, posted.transactionId, metadata],
      );
      await client.query(
        `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id, metadata_json)
         values ('ADMIN', $1, 'ADMIN_LEDGER_ADJUSTMENT_APPROVAL', 'ledger_transaction', $2, $3)`,
        [input.approvedBy2, posted.transactionId, metadata],
      );
    }
    await client.query('commit');
    return posted;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

/**
 * Small-adjustment fast path (Decision 089): ONE active approver holding
 * FINANCE_ADMIN or SUPER_ADMIN, hard-capped at
 * SINGLE_APPROVAL_ADJUSTMENT_LIMIT_USDT (defense in depth — callers also
 * gate). The audit record remains mandatory and atomic with the posting,
 * exactly like the dual-approval path.
 */
export async function postSingleApproverAdjustment(
  client: SqlClient,
  input: SingleApproverAdjustmentInput,
): Promise<PostedTransaction> {
  const total = input.entries
    .filter((e) => e.direction === 'DEBIT')
    .reduce((sum, e) => sum.add(e.amount), Money.zero());
  if (total.gt(SINGLE_APPROVAL_ADJUSTMENT_LIMIT_USDT)) {
    throw new LedgerError(
      'DUAL_APPROVAL_REQUIRED',
      `Adjustments above ${SINGLE_APPROVAL_ADJUSTMENT_LIMIT_USDT} USDT require dual approval`,
    );
  }
  const status = await client.query<{ status: string }>(
    `select status::text as status from users where id = $1`,
    [input.approvedBy],
  );
  if (status.rows[0]?.status !== 'ACTIVE') {
    throw new LedgerError('DUAL_APPROVAL_REQUIRED', 'Approver must be an ACTIVE user');
  }
  const roles = await activeRolesOf(client, input.approvedBy);
  if (!roles.includes('FINANCE_ADMIN') && !roles.includes('SUPER_ADMIN')) {
    throw new LedgerError(
      'DUAL_APPROVAL_REQUIRED',
      'Single-approver adjustments require FINANCE_ADMIN or SUPER_ADMIN',
    );
  }

  await client.query('begin');
  try {
    const posted = await postTransaction(
      client,
      { ...input, type: 'ADMIN_ADJUSTMENT' },
      { manageTransaction: false },
    );
    if (!posted.alreadyPosted) {
      const metadata = JSON.stringify({ reason: input.reason, single_approver: true });
      await client.query(
        `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id, metadata_json)
         values ('ADMIN', $1, 'ADMIN_LEDGER_ADJUSTMENT', 'ledger_transaction', $2, $3)`,
        [input.approvedBy, posted.transactionId, metadata],
      );
    }
    await client.query('commit');
    return posted;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}
