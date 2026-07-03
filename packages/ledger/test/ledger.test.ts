import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import {
  LedgerError,
  type SqlClient,
  ensureUserAccounts,
  getPlatformAccountId,
  getBalance,
  computeBalanceFromEntries,
  postTransaction,
  depositConfirmation,
  purchaseFundLock,
  purchaseRefund,
  assignmentSettlement,
  day0MintSettlement,
  reserveAllocation,
  buybackPayment,
  mlmRewardPayment,
  withdrawalFundLock,
  withdrawalRejectionRefund,
  reconcile,
  postAdminAdjustment,
} from '../src/index.js';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  return r.rows[0]!.id;
}

/** Deposit funds so the user has an available balance to work with. */
async function fundUser(userId: string, amount: string): Promise<void> {
  await depositConfirmation(client, {
    userId,
    amount: Money.of(amount),
    idempotencyKey: randomUUID(),
  });
}

async function expectLedgerError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LedgerError);
    expect((error as LedgerError).code).toBe(code);
    return;
  }
  throw new Error(`Expected LedgerError ${code}, but call succeeded`);
}

// ---------------------------------------------------------------------------

describe('postTransaction core', () => {
  it('debit total must equal credit total (app-level fast fail)', async () => {
    const user = await newUser();
    const accounts = await ensureUserAccounts(client, user);
    await expectLedgerError(
      postTransaction(client, {
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: randomUUID(),
        entries: [
          { accountId: accounts.available, direction: 'DEBIT', amount: Money.of('10') },
          { accountId: accounts.locked, direction: 'CREDIT', amount: Money.of('9') },
        ],
      }),
      'LEDGER_UNBALANCED',
    );
  });

  it('rejects single-entry and non-positive amounts', async () => {
    const user = await newUser();
    const accounts = await ensureUserAccounts(client, user);
    await expectLedgerError(
      postTransaction(client, {
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: randomUUID(),
        entries: [{ accountId: accounts.available, direction: 'DEBIT', amount: Money.of('10') }],
      }),
      'LEDGER_UNBALANCED',
    );
    await expectLedgerError(
      postTransaction(client, {
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: randomUUID(),
        entries: [
          { accountId: accounts.available, direction: 'DEBIT', amount: Money.of('0') },
          { accountId: accounts.locked, direction: 'CREDIT', amount: Money.of('0') },
        ],
      }),
      'INVALID_ENTRY',
    );
  });

  it('is idempotent: same key posts once, balances unchanged on replay', async () => {
    const user = await newUser();
    const key = randomUUID();
    const first = await depositConfirmation(client, {
      userId: user,
      amount: Money.of('100'),
      idempotencyKey: key,
    });
    const replay = await depositConfirmation(client, {
      userId: user,
      amount: Money.of('100'),
      idempotencyKey: key,
    });
    expect(first.alreadyPosted).toBe(false);
    expect(replay.alreadyPosted).toBe(true);
    expect(replay.transactionId).toBe(first.transactionId);

    const accounts = await ensureUserAccounts(client, user);
    expect(await getBalance(client, accounts.available)).toBe('100.00000000');
  });

  it('maps DB negative-balance rejection to INSUFFICIENT_BALANCE', async () => {
    const user = await newUser();
    await fundUser(user, '50');
    await expectLedgerError(
      purchaseFundLock(client, {
        userId: user,
        amount: Money.of('177.16'),
        idempotencyKey: randomUUID(),
      }),
      'INSUFFICIENT_BALANCE',
    );
    // balance unchanged after the failed lock
    const accounts = await ensureUserAccounts(client, user);
    expect(await getBalance(client, accounts.available)).toBe('50.00000000');
  });
});

// ---------------------------------------------------------------------------

describe('purchase flow (05_SETTLEMENT_ENGINE.md)', () => {
  it('lock 177.16 -> assign at 110 -> seller +110, buyer refund 67.16, clearing zero', async () => {
    const buyer = await newUser();
    const seller = await newUser();
    await fundUser(buyer, '200');

    await purchaseFundLock(client, {
      userId: buyer,
      amount: Money.of('177.16'),
      idempotencyKey: randomUUID(),
    });

    await assignmentSettlement(client, {
      buyerUserId: buyer,
      sellerUserId: seller,
      price: Money.of('110.00'),
      idempotencyKey: randomUUID(),
    });

    await purchaseRefund(client, {
      userId: buyer,
      amount: Money.of('67.16'),
      idempotencyKey: randomUUID(),
    });

    const buyerAccounts = await ensureUserAccounts(client, buyer);
    const sellerAccounts = await ensureUserAccounts(client, seller);
    // buyer: 200 - 177.16 + 67.16 = 90; locked: 0
    expect(await getBalance(client, buyerAccounts.available)).toBe('90.00000000');
    expect(await getBalance(client, buyerAccounts.locked)).toBe('0.00000000');
    // Decision 069: seller receives price minus the 2% fee (110 -> 107.80);
    // the fee is split 1.10 / 1.10 to operating and buyback.
    expect(await getBalance(client, sellerAccounts.available)).toBe('107.80000000');
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');
    const buyback = await getPlatformAccountId(client, 'PLATFORM_BUYBACK_RESERVE');
    expect(Money.of(await getBalance(client, operating)).gte(Money.of('1.10'))).toBe(true);
    expect(Money.of(await getBalance(client, buyback)).gte(Money.of('1.10'))).toBe(true);
    // settlement clearing nets to zero
    const clearing = await getPlatformAccountId(client, 'PLATFORM_SETTLEMENT_CLEARING');
    expect(await getBalance(client, clearing)).toBe('0.00000000');
  });

  it('Day0 Mint settlement + Reserve Allocation splits 100 into 93.60/5.40/0.70/0.30', async () => {
    const buyer = await newUser();
    // Decision 069: mint charge = 100 price + 2 fee.
    await fundUser(buyer, '102');
    await purchaseFundLock(client, {
      userId: buyer,
      amount: Money.of('102'),
      idempotencyKey: randomUUID(),
    });

    const mintRevenue = await getPlatformAccountId(client, 'PLATFORM_MINT_REVENUE');
    const before = await getBalance(client, mintRevenue);

    await day0MintSettlement(client, { buyerUserId: buyer, idempotencyKey: randomUUID() });
    expect(await getBalance(client, mintRevenue)).toBe(
      Money.of(before).add('100').toFixed8(),
    );

    const buyback = await getPlatformAccountId(client, 'PLATFORM_BUYBACK_RESERVE');
    const mlm = await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE');
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');
    const emergency = await getPlatformAccountId(client, 'PLATFORM_EMERGENCY_RESERVE');
    const buybackBefore = await getBalance(client, buyback);
    const mlmBefore = await getBalance(client, mlm);
    const operatingBefore = await getBalance(client, operating);
    const emergencyBefore = await getBalance(client, emergency);

    await reserveAllocation(client, { idempotencyKey: randomUUID() });

    // fully allocated (numeric equality — cache returns '0' before first touch)
    expect(Money.of(await getBalance(client, mintRevenue)).eq(before)).toBe(true);
    expect(await getBalance(client, buyback)).toBe(Money.of(buybackBefore).add('93.60').toFixed8());
    expect(await getBalance(client, mlm)).toBe(Money.of(mlmBefore).add('5.40').toFixed8());
    expect(await getBalance(client, operating)).toBe(Money.of(operatingBefore).add('0.70').toFixed8());
    expect(await getBalance(client, emergency)).toBe(Money.of(emergencyBefore).add('0.30').toFixed8());
  });
});

// ---------------------------------------------------------------------------

describe('buyback / MLM payments', () => {
  it('pays buyback from PLATFORM_BUYBACK_RESERVE and MLM from PLATFORM_MLM_RESERVE', async () => {
    // fund reserves via a mint + allocation (Decision 069: charge is 102)
    const buyer = await newUser();
    await fundUser(buyer, '102');
    await purchaseFundLock(client, { userId: buyer, amount: Money.of('102'), idempotencyKey: randomUUID() });
    await day0MintSettlement(client, { buyerUserId: buyer, idempotencyKey: randomUUID() });
    await reserveAllocation(client, { idempotencyKey: randomUUID() });

    const receiver = await newUser();
    await buybackPayment(client, {
      userId: receiver,
      amount: Money.of('28.57142857'),
      idempotencyKey: randomUUID(),
    });
    const referrer = await newUser();
    await mlmRewardPayment(client, { referrerUserId: referrer, idempotencyKey: randomUUID() });

    const receiverAccounts = await ensureUserAccounts(client, receiver);
    const referrerAccounts = await ensureUserAccounts(client, referrer);
    expect(await getBalance(client, receiverAccounts.available)).toBe('28.57142857');
    expect(await getBalance(client, referrerAccounts.available)).toBe('10.00000000');
  });

  it('buyback payment fails when the reserve lacks funds (never prints money)', async () => {
    // drain check: try to pay far more than the reserve holds
    const receiver = await newUser();
    await expectLedgerError(
      buybackPayment(client, {
        userId: receiver,
        amount: Money.of('999999'),
        idempotencyKey: randomUUID(),
      }),
      'INSUFFICIENT_BALANCE',
    );
  });
});

// ---------------------------------------------------------------------------

describe('withdrawal flow', () => {
  it('locks funds before broadcast and refunds on rejection', async () => {
    const user = await newUser();
    await fundUser(user, '30');
    await withdrawalFundLock(client, {
      userId: user,
      amount: Money.of('30'),
      idempotencyKey: randomUUID(),
    });
    const accounts = await ensureUserAccounts(client, user);
    expect(await getBalance(client, accounts.available)).toBe('0.00000000');

    await withdrawalRejectionRefund(client, {
      userId: user,
      amount: Money.of('30'),
      idempotencyKey: randomUUID(),
    });
    expect(await getBalance(client, accounts.available)).toBe('30.00000000');
  });
});

// ---------------------------------------------------------------------------

describe('reconciliation (settlement verification)', () => {
  it('passes on a healthy ledger and clearing is zero', async () => {
    const report = await reconcile(client);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('balance cache matches entry-derived balances', async () => {
    const user = await newUser();
    await fundUser(user, '42');
    const accounts = await ensureUserAccounts(client, user);
    const cached = await getBalance(client, accounts.available);
    const derived = await computeBalanceFromEntries(client, accounts.available);
    expect(cached).toBe(derived);
  });
});

// ---------------------------------------------------------------------------

describe('admin adjustment (dual approval + audit)', () => {
  async function grantRole(userId: string, role: 'FINANCE_ADMIN' | 'SUPER_ADMIN'): Promise<void> {
    await client.query(
      `insert into admin_role_grants (user_id, role) values ($1, $2::admin_role)`,
      [userId, role],
    );
  }

  it('posts with two distinct qualified approvers and writes audit records', async () => {
    const finance = await newUser();
    const superAdmin = await newUser();
    await grantRole(finance, 'FINANCE_ADMIN');
    await grantRole(superAdmin, 'SUPER_ADMIN');

    const user = await newUser();
    await fundUser(user, '10');
    const accounts = await ensureUserAccounts(client, user);
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');

    const posted = await postAdminAdjustment(client, {
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey: randomUUID(),
      reason: 'test adjustment',
      approvedBy1: finance,
      approvedBy2: superAdmin,
      entries: [
        { accountId: accounts.available, direction: 'DEBIT', amount: Money.of('1') },
        { accountId: operating, direction: 'CREDIT', amount: Money.of('1') },
      ],
    });

    const audits = await client.query<{ count: string }>(
      `select count(*)::text as count from audit_logs
       where reference_type = 'ledger_transaction' and reference_id = $1`,
      [posted.transactionId],
    );
    expect(audits.rows[0]!.count).toBe('2'); // adjustment + approval
  });

  it('rejects the same approver twice and unqualified approvers', async () => {
    const finance = await newUser();
    await grantRole(finance, 'FINANCE_ADMIN');
    const nobody = await newUser();

    const user = await newUser();
    const accounts = await ensureUserAccounts(client, user);
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');
    const entries = [
      { accountId: accounts.available, direction: 'DEBIT' as const, amount: Money.of('1') },
      { accountId: operating, direction: 'CREDIT' as const, amount: Money.of('1') },
    ];

    await expectLedgerError(
      postAdminAdjustment(client, {
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: randomUUID(),
        reason: 'x',
        approvedBy1: finance,
        approvedBy2: finance,
        entries,
      }),
      'DUAL_APPROVAL_REQUIRED',
    );

    await expectLedgerError(
      postAdminAdjustment(client, {
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: randomUUID(),
        reason: 'x',
        approvedBy1: finance,
        approvedBy2: nobody, // no SUPER_ADMIN role anywhere
        entries,
      }),
      'DUAL_APPROVAL_REQUIRED',
    );
  });

  it('rejects non-ACTIVE approvers even with valid roles', async () => {
    const finance = await newUser();
    const superAdmin = await newUser();
    await grantRole(finance, 'FINANCE_ADMIN');
    await grantRole(superAdmin, 'SUPER_ADMIN');
    await client.query(`update users set status = 'BANNED' where id = $1`, [superAdmin]);

    const user = await newUser();
    const accounts = await ensureUserAccounts(client, user);
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');

    await expectLedgerError(
      postAdminAdjustment(client, {
        type: 'ADMIN_ADJUSTMENT',
        idempotencyKey: randomUUID(),
        reason: 'x',
        approvedBy1: finance,
        approvedBy2: superAdmin, // BANNED
        entries: [
          { accountId: accounts.available, direction: 'DEBIT', amount: Money.of('1') },
          { accountId: operating, direction: 'CREDIT', amount: Money.of('1') },
        ],
      }),
      'DUAL_APPROVAL_REQUIRED',
    );
  });
});
