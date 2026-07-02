import type { AdminRole } from '@sevendays/domain';
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
      await client.query(
        `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id, after_hash)
         values ('ADMIN', $1, 'ADMIN_LEDGER_ADJUSTMENT', 'ledger_transaction', $2, $3)`,
        [input.approvedBy1, posted.transactionId, input.reason],
      );
      await client.query(
        `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id, after_hash)
         values ('ADMIN', $1, 'ADMIN_LEDGER_ADJUSTMENT_APPROVAL', 'ledger_transaction', $2, $3)`,
        [input.approvedBy2, posted.transactionId, input.reason],
      );
    }
    await client.query('commit');
    return posted;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}
