import type { Money } from '@sevendays/shared';
import type { EntryDirection, TransactionType } from '@sevendays/domain';

export type { QueryResult, SqlClient } from '@sevendays/shared';

export type LedgerErrorCode =
  | 'LEDGER_UNBALANCED'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_ENTRY'
  | 'ACCOUNT_NOT_FOUND'
  | 'DUAL_APPROVAL_REQUIRED';

export class LedgerError extends Error {
  constructor(
    readonly code: LedgerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

export interface EntryDraft {
  accountId: string;
  direction: EntryDirection;
  amount: Money;
}

export interface PostTransactionInput {
  type: TransactionType;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  entries: EntryDraft[];
}

export interface PostedTransaction {
  transactionId: string;
  /** true when the idempotency key had already been posted — no new effect. */
  alreadyPosted: boolean;
}
