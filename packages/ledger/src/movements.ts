import { Money, sumMoney } from '@sevendays/shared';
import {
  DAY0_MINT_PRICE,
  MLM_REWARD_AMOUNT,
  RESERVE_ALLOCATION_V1,
} from '@sevendays/domain';
import { ensureUserAccounts, getPlatformAccountId, getUserAccountId } from './accounts.js';
import { postTransaction } from './post.js';
import { LedgerError, type EntryDraft, type PostedTransaction, type SqlClient } from './types.js';

/**
 * Typed builders for every money movement in the spec. These are the ONLY
 * ways money moves — there is no generic "adjust balance" anywhere.
 *
 * Settlement flows route through PLATFORM_SETTLEMENT_CLEARING with paired
 * entries in the SAME transaction, so clearing nets to zero per transaction
 * and therefore returns to zero after every successful batch
 * (05_SETTLEMENT_ENGINE.md).
 */

interface Ref {
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
}

function refFields(ref: Ref): Pick<Ref, 'referenceType' | 'referenceId'> {
  const out: Pick<Ref, 'referenceType' | 'referenceId'> = {};
  if (ref.referenceType !== undefined) out.referenceType = ref.referenceType;
  if (ref.referenceId !== undefined) out.referenceId = ref.referenceId;
  return out;
}

/** Confirmed blockchain deposit: external world -> USER_AVAILABLE. */
export async function depositConfirmation(
  client: SqlClient,
  args: Ref & { userId: string; amount: Money },
): Promise<PostedTransaction> {
  const user = await ensureUserAccounts(client, args.userId);
  const clearing = await getPlatformAccountId(client, 'PLATFORM_DEPOSIT_CLEARING');
  return postTransaction(client, {
    type: 'BLOCKCHAIN_DEPOSIT_CONFIRMATION',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: clearing, direction: 'DEBIT', amount: args.amount },
      { accountId: user.available, direction: 'CREDIT', amount: args.amount },
    ],
  });
}

/** Purchase session immediate fund lock: USER_AVAILABLE -> USER_LOCKED. */
export async function purchaseFundLock(
  client: SqlClient,
  args: Ref & { userId: string; amount: Money },
): Promise<PostedTransaction> {
  const user = await ensureUserAccounts(client, args.userId);
  return postTransaction(client, {
    type: 'PURCHASE_FUND_LOCK',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: user.available, direction: 'DEBIT', amount: args.amount },
      { accountId: user.locked, direction: 'CREDIT', amount: args.amount },
    ],
  });
}

/** Refund (cancel / unassigned / price difference): USER_LOCKED -> USER_AVAILABLE. */
export async function purchaseRefund(
  client: SqlClient,
  args: Ref & { userId: string; amount: Money },
): Promise<PostedTransaction> {
  const user = await ensureUserAccounts(client, args.userId);
  return postTransaction(client, {
    type: 'PURCHASE_REFUND',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: user.locked, direction: 'DEBIT', amount: args.amount },
      { accountId: user.available, direction: 'CREDIT', amount: args.amount },
    ],
  });
}

/**
 * P2P assignment settlement. Buyer payment == seller proceeds — platform
 * fee is ALWAYS 0 (01_CONSTITUTION.md). Routed through settlement clearing.
 */
export async function assignmentSettlement(
  client: SqlClient,
  args: Ref & { buyerUserId: string; sellerUserId: string; price: Money },
): Promise<PostedTransaction> {
  const buyerLocked = await getUserAccountId(client, args.buyerUserId, 'USER_LOCKED');
  const seller = await ensureUserAccounts(client, args.sellerUserId);
  const clearing = await getPlatformAccountId(client, 'PLATFORM_SETTLEMENT_CLEARING');
  return postTransaction(client, {
    type: 'ASSIGNMENT_SETTLEMENT',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: buyerLocked, direction: 'DEBIT', amount: args.price },
      { accountId: clearing, direction: 'CREDIT', amount: args.price },
      { accountId: clearing, direction: 'DEBIT', amount: args.price },
      { accountId: seller.available, direction: 'CREDIT', amount: args.price },
    ],
  });
}

/** Day0 Mint fallback settlement: buyer USER_LOCKED -> PLATFORM_MINT_REVENUE (100 USDT). */
export async function day0MintSettlement(
  client: SqlClient,
  args: Ref & { buyerUserId: string },
): Promise<PostedTransaction> {
  const price = Money.of(DAY0_MINT_PRICE);
  const buyerLocked = await getUserAccountId(client, args.buyerUserId, 'USER_LOCKED');
  const clearing = await getPlatformAccountId(client, 'PLATFORM_SETTLEMENT_CLEARING');
  const mintRevenue = await getPlatformAccountId(client, 'PLATFORM_MINT_REVENUE');
  return postTransaction(client, {
    type: 'DAY0_MINT_SETTLEMENT',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: buyerLocked, direction: 'DEBIT', amount: price },
      { accountId: clearing, direction: 'CREDIT', amount: price },
      { accountId: clearing, direction: 'DEBIT', amount: price },
      { accountId: mintRevenue, direction: 'CREDIT', amount: price },
    ],
  });
}

/**
 * Reserve Allocation v1.0: executed immediately after Day0 Mint settlement.
 * 100.00 -> 93.60 / 5.40 / 0.70 / 0.30 (02_BUSINESS_MODEL.md).
 */
export async function reserveAllocation(
  client: SqlClient,
  args: Ref,
): Promise<PostedTransaction> {
  const mintPrice = Money.of(DAY0_MINT_PRICE);
  const parts = Object.entries(RESERVE_ALLOCATION_V1) as [
    keyof typeof RESERVE_ALLOCATION_V1,
    string,
  ][];
  const total = sumMoney(parts.map(([, amount]) => amount));
  if (!total.eq(mintPrice)) {
    throw new LedgerError(
      'LEDGER_UNBALANCED',
      `Reserve allocation ${total.toFixed8()} != mint price ${mintPrice.toFixed8()}`,
    );
  }
  const mintRevenue = await getPlatformAccountId(client, 'PLATFORM_MINT_REVENUE');
  const entries: EntryDraft[] = [
    { accountId: mintRevenue, direction: 'DEBIT', amount: mintPrice },
  ];
  for (const [accountType, amount] of parts) {
    entries.push({
      accountId: await getPlatformAccountId(client, accountType),
      direction: 'CREDIT',
      amount: Money.of(amount),
    });
  }
  return postTransaction(client, {
    type: 'RESERVE_ALLOCATION',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries,
  });
}

/** Buyback payment: PLATFORM_BUYBACK_RESERVE -> USER_AVAILABLE. */
export async function buybackPayment(
  client: SqlClient,
  args: Ref & { userId: string; amount: Money },
): Promise<PostedTransaction> {
  const user = await ensureUserAccounts(client, args.userId);
  const reserve = await getPlatformAccountId(client, 'PLATFORM_BUYBACK_RESERVE');
  return postTransaction(client, {
    type: 'BUYBACK_PAYMENT',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: reserve, direction: 'DEBIT', amount: args.amount },
      { accountId: user.available, direction: 'CREDIT', amount: args.amount },
    ],
  });
}

/** MLM Reward: PLATFORM_MLM_RESERVE -> referrer USER_AVAILABLE (10 USDT, Level 1 only). */
export async function mlmRewardPayment(
  client: SqlClient,
  args: Ref & { referrerUserId: string },
): Promise<PostedTransaction> {
  const amount = Money.of(MLM_REWARD_AMOUNT);
  const user = await ensureUserAccounts(client, args.referrerUserId);
  const reserve = await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE');
  return postTransaction(client, {
    type: 'MLM_REWARD_PAYMENT',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: reserve, direction: 'DEBIT', amount },
      { accountId: user.available, direction: 'CREDIT', amount },
    ],
  });
}

/** Withdrawal fund lock (BEFORE broadcast): USER_AVAILABLE -> WITHDRAWAL_CLEARING. */
export async function withdrawalFundLock(
  client: SqlClient,
  args: Ref & { userId: string; amount: Money },
): Promise<PostedTransaction> {
  const user = await ensureUserAccounts(client, args.userId);
  const clearing = await getPlatformAccountId(client, 'PLATFORM_WITHDRAWAL_CLEARING');
  return postTransaction(client, {
    type: 'WITHDRAWAL_FUND_LOCK',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: user.available, direction: 'DEBIT', amount: args.amount },
      { accountId: clearing, direction: 'CREDIT', amount: args.amount },
    ],
  });
}

/** Withdrawal rejection/failure refund: WITHDRAWAL_CLEARING -> USER_AVAILABLE. */
export async function withdrawalRejectionRefund(
  client: SqlClient,
  args: Ref & { userId: string; amount: Money },
): Promise<PostedTransaction> {
  const user = await ensureUserAccounts(client, args.userId);
  const clearing = await getPlatformAccountId(client, 'PLATFORM_WITHDRAWAL_CLEARING');
  return postTransaction(client, {
    type: 'WITHDRAWAL_REJECTION_REFUND',
    idempotencyKey: args.idempotencyKey,
    ...refFields(args),
    entries: [
      { accountId: clearing, direction: 'DEBIT', amount: args.amount },
      { accountId: user.available, direction: 'CREDIT', amount: args.amount },
    ],
  });
}
