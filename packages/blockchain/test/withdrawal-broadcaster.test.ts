import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money, type SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  ensureUserAccounts,
  getBalance,
  getPlatformAccountId,
  reconcile,
  withdrawalFundLock,
  withdrawalRejectionRefund,
} from '@sevendays/ledger';
import {
  POLYGON_POS_USDT,
  approveWithdrawal,
  processWithdrawals,
  rejectWithdrawal,
  type ChainConfig,
  type WithdrawalPolicy,
} from '../src/index.js';
import { FakeChain, FakeSigner } from './fakes.js';

let client: SqlClient;

const VALID_TO = '0x4444444444444444444444444444444444444444';

function testConfig(chainId: string): ChainConfig {
  return { ...POLYGON_POS_USDT, chainId };
}

function policy(overrides: Partial<WithdrawalPolicy> = {}): WithdrawalPolicy {
  // FakeChain quotes 10 gwei; 100k gas -> 0.001 native; rate 1000 -> fee 1 USDT.
  return { nativeUsdtRate: Money.of('1000'), adminReviewThreshold: null, ...overrides };
}

beforeAll(async () => {
  client = await createTestDb();
});

async function newFundedUser(funding: string): Promise<string> {
  const r = await client.query<{ id: string }>(`insert into users (email) values ($1) returning id`, [
    `${randomUUID()}@test.dev`,
  ]);
  const userId = r.rows[0]!.id;
  await depositConfirmation(client, {
    userId,
    amount: Money.of(funding),
    idempotencyKey: randomUUID(),
  });
  return userId;
}

/** Mirrors what POST /wallet/withdraw does: ledger lock + LOCKED row. */
async function requestWithdrawal(
  config: ChainConfig,
  userId: string,
  amount: string,
  toAddress = VALID_TO,
): Promise<string> {
  const lock = await withdrawalFundLock(client, {
    userId,
    amount: Money.of(amount),
    idempotencyKey: `wdlock:${randomUUID()}`,
  });
  const row = await client.query<{ id: string }>(
    `insert into blockchain_withdrawals
       (user_id, chain_id, token_contract, to_address, requested_amount, network_fee_amount, net_amount,
        status, ledger_transaction_id)
     values ($1, $2, 'USDT', $3, $4, 0, $4, 'LOCKED', $5)
     returning id`,
    [userId, config.chainId, toAddress, Money.of(amount).toFixed8(), lock.transactionId],
  );
  return row.rows[0]!.id;
}

async function newAdmin(role: 'FINANCE_ADMIN' | 'SUPER_ADMIN'): Promise<string> {
  const r = await client.query<{ id: string }>(`insert into users (email) values ($1) returning id`, [
    `${randomUUID()}@admin.dev`,
  ]);
  const adminId = r.rows[0]!.id;
  await client.query(`insert into admin_role_grants (user_id, role) values ($1, $2)`, [adminId, role]);
  return adminId;
}

async function availableBalance(userId: string): Promise<string> {
  const accounts = await ensureUserAccounts(client, userId);
  return getBalance(client, accounts.available);
}

async function withdrawalRow(id: string) {
  const r = await client.query<{
    status: string;
    tx_hash: string | null;
    raw_tx: string | null;
    network_fee_amount: string;
    net_amount: string;
  }>(
    `select status::text as status, tx_hash, raw_tx,
            network_fee_amount::text as network_fee_amount, net_amount::text as net_amount
     from blockchain_withdrawals where id = $1`,
    [id],
  );
  return r.rows[0]!;
}

describe('withdrawal broadcaster', () => {
  it('deducts the fee, persists the signed tx before sending, then confirms', async () => {
    const config = testConfig('TEST_WD_FLOW');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const user = await newFundedUser('200');
    const id = await requestWithdrawal(config, user, '100');

    const run = await processWithdrawals(client, chain, signer, config, policy());
    expect(run.lockAcquired).toBe(true);
    expect(run.broadcast).toBe(1);

    const row = await withdrawalRow(id);
    expect(row.status).toBe('BROADCAST');
    expect(row.network_fee_amount).toBe('1.00000000');
    expect(row.net_amount).toBe('99.00000000');
    expect(row.tx_hash).not.toBeNull();
    expect(row.raw_tx).not.toBeNull();
    expect(chain.sent).toEqual([row.raw_tx]);
    expect(await availableBalance(user)).toBe('100.00000000');

    // Mined but not deep enough: stays BROADCAST.
    chain.statuses.set(row.tx_hash!, { kind: 'SUCCESS', blockNumber: 1000n });
    chain.latestBlock = 1100n;
    const early = await processWithdrawals(client, chain, signer, config, policy());
    expect(early.confirmed).toBe(0);
    expect((await withdrawalRow(id)).status).toBe('BROADCAST');

    // 128 confirmations: final.
    chain.latestBlock = 1127n;
    const final = await processWithdrawals(client, chain, signer, config, policy());
    expect(final.confirmed).toBe(1);
    expect((await withdrawalRow(id)).status).toBe('CONFIRMED');

    // The locked funds stay in the withdrawal clearing boundary account.
    const clearing = await getPlatformAccountId(client, 'PLATFORM_WITHDRAWAL_CLEARING');
    expect(Money.of(await getBalance(client, clearing)).gte(Money.of('100'))).toBe(true);

    const audit = await reconcile(client);
    expect(audit.issues).toEqual([]);
  });

  it('crash between persist and send: re-sends the SAME tx, never re-signs', async () => {
    const config = testConfig('TEST_WD_CRASH');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const user = await newFundedUser('50');
    const id = await requestWithdrawal(config, user, '20');

    chain.nextSendError = new Error('connection reset');
    const run = await processWithdrawals(client, chain, signer, config, policy());
    expect(run.broadcast).toBe(1);
    expect(run.sendErrors).toBe(1);
    expect(chain.sent).toEqual([]); // send failed…

    const persisted = await withdrawalRow(id);
    expect(persisted.status).toBe('BROADCAST'); // …but identity is on disk
    const signsSoFar = signer.signCount;

    const retry = await processWithdrawals(client, chain, signer, config, policy());
    expect(retry.rebroadcast).toBe(1);
    expect(signer.signCount).toBe(signsSoFar); // no second signature
    expect(chain.sent).toEqual([persisted.raw_tx]); // identical bytes

    const after = await withdrawalRow(id);
    expect(after.tx_hash).toBe(persisted.tx_hash);
  });

  it('refunds exactly once when the transfer reverts on chain (past reorg depth)', async () => {
    const config = testConfig('TEST_WD_REVERT');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const user = await newFundedUser('80');
    const id = await requestWithdrawal(config, user, '30');

    await processWithdrawals(client, chain, signer, config, policy());
    const row = await withdrawalRow(id);
    expect(await availableBalance(user)).toBe('50.00000000');

    // Reverted but shallow: reorg protection keeps it BROADCAST.
    chain.statuses.set(row.tx_hash!, { kind: 'REVERTED', blockNumber: 2000n });
    chain.latestBlock = 2010n;
    await processWithdrawals(client, chain, signer, config, policy());
    expect((await withdrawalRow(id)).status).toBe('BROADCAST');
    expect(await availableBalance(user)).toBe('50.00000000');

    // Deep enough: refund and close.
    chain.latestBlock = 2127n;
    const run = await processWithdrawals(client, chain, signer, config, policy());
    expect(run.failed).toBe(1);
    expect((await withdrawalRow(id)).status).toBe('FAILED');
    expect(await availableBalance(user)).toBe('80.00000000');

    // Idempotent on re-run.
    const again = await processWithdrawals(client, chain, signer, config, policy());
    expect(again.failed).toBe(0);
    expect(await availableBalance(user)).toBe('80.00000000');
  });

  it('rejects and refunds when the fee eats the whole amount', async () => {
    const config = testConfig('TEST_WD_FEE');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const user = await newFundedUser('15');
    const id = await requestWithdrawal(config, user, '10');

    const run = await processWithdrawals(client, chain, signer, config, policy({ nativeUsdtRate: Money.of('12000') }));
    expect(run.rejected).toBe(1);
    expect((await withdrawalRow(id)).status).toBe('REJECTED');
    expect(await availableBalance(user)).toBe('15.00000000');
    expect(chain.sent).toEqual([]);
  });

  it('rejects amounts not representable in token units (7+ decimals on USDT)', async () => {
    const config = testConfig('TEST_WD_DUST');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const user = await newFundedUser('20');
    const id = await requestWithdrawal(config, user, '10.1234567');

    const run = await processWithdrawals(client, chain, signer, config, policy({ nativeUsdtRate: Money.of('0') }));
    expect(run.rejected).toBe(1);
    expect((await withdrawalRow(id)).status).toBe('REJECTED');
    expect(await availableBalance(user)).toBe('20.00000000');
  });

  it('rejects invalid destination addresses with a full refund', async () => {
    const config = testConfig('TEST_WD_ADDR');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const user = await newFundedUser('30');
    const id = await requestWithdrawal(config, user, '12', 'not-an-address');

    const run = await processWithdrawals(client, chain, signer, config, policy());
    expect(run.rejected).toBe(1);
    expect((await withdrawalRow(id)).status).toBe('REJECTED');
    expect(await availableBalance(user)).toBe('30.00000000');
  });

  it('routes large withdrawals to ADMIN_REVIEW; release needs FINANCE+SUPER dual approval (Decision 060)', async () => {
    const config = testConfig('TEST_WD_REVIEW');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const reviewPolicy = policy({ adminReviewThreshold: Money.of('1000') });
    const financeAdmin = await newAdmin('FINANCE_ADMIN');
    const superAdmin = await newAdmin('SUPER_ADMIN');

    const bigUser = await newFundedUser('3000');
    const approvedId = await requestWithdrawal(config, bigUser, '1500');
    const rejectedId = await requestWithdrawal(config, bigUser, '1200');
    const smallUser = await newFundedUser('100');
    const smallId = await requestWithdrawal(config, smallUser, '50');

    const run = await processWithdrawals(client, chain, signer, config, reviewPolicy);
    expect(run.routedToReview).toBe(2);
    expect(run.broadcast).toBe(1); // the small one goes straight through
    expect((await withdrawalRow(approvedId)).status).toBe('ADMIN_REVIEW');
    expect((await withdrawalRow(rejectedId)).status).toBe('ADMIN_REVIEW');
    expect((await withdrawalRow(smallId)).status).toBe('BROADCAST');

    // One approval alone does NOT release.
    const first = await approveWithdrawal(client, {
      withdrawalId: approvedId,
      adminUserId: financeAdmin,
      adminRole: 'FINANCE_ADMIN',
    });
    expect(first.released).toBe(false);
    expect((await withdrawalRow(approvedId)).status).toBe('ADMIN_REVIEW');

    // The same admin approving again is an idempotent replay — it never
    // counts twice (DB-enforced) and never releases alone.
    const replay = await approveWithdrawal(client, {
      withdrawalId: approvedId,
      adminUserId: financeAdmin,
      adminRole: 'FINANCE_ADMIN',
    });
    expect(replay.released).toBe(false);
    expect(replay.approvedRoles).toEqual(['FINANCE_ADMIN']);
    // Approving with a role the admin does not hold is refused by the DB.
    await expect(
      approveWithdrawal(client, {
        withdrawalId: approvedId,
        adminUserId: financeAdmin,
        adminRole: 'SUPER_ADMIN',
      }),
    ).rejects.toThrow(/WITHDRAWAL_APPROVER_ROLE_MISSING/);

    // The second, DISTINCT admin with the second role releases it.
    const second = await approveWithdrawal(client, {
      withdrawalId: approvedId,
      adminUserId: superAdmin,
      adminRole: 'SUPER_ADMIN',
    });
    expect(second.released).toBe(true);

    // Reject the other: refunded in full.
    await rejectWithdrawal(client, { withdrawalId: rejectedId, adminUserId: superAdmin });
    expect(await availableBalance(bigUser)).toBe('1500.00000000'); // 3000 - 1500 lock (1200 refunded)

    const secondRun = await processWithdrawals(client, chain, signer, config, reviewPolicy);
    expect(secondRun.routedToReview).toBe(0); // approved row is never re-routed
    expect(secondRun.broadcast).toBe(1);
    expect((await withdrawalRow(approvedId)).status).toBe('BROADCAST');
    expect((await withdrawalRow(rejectedId)).status).toBe('REJECTED');

    // Audit trail exists for routing + both decisions.
    const audit = await client.query<{ action: string }>(
      `select action from audit_logs where reference_type = 'blockchain_withdrawal'
       and reference_id in ($1, $2) order by created_at`,
      [approvedId, rejectedId],
    );
    const actions = audit.rows.map((r) => r.action);
    expect(actions).toContain('WITHDRAWAL_ROUTED_TO_ADMIN_REVIEW');
    expect(actions).toContain('WITHDRAWAL_REVIEW_APPROVED:FINANCE_ADMIN');
    expect(actions).toContain('WITHDRAWAL_REVIEW_APPROVED:SUPER_ADMIN');
    expect(actions).toContain('WITHDRAWAL_REVIEW_RELEASED');
    expect(actions).toContain('WITHDRAWAL_REVIEW_REJECTED');
  });

  it('applies the Decision 060 default threshold when the policy omits it', async () => {
    const config = testConfig('TEST_WD_DEFAULT_THRESHOLD');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const user = await newFundedUser('2000');
    const id = await requestWithdrawal(config, user, '1500');

    // No adminReviewThreshold key at all -> 1,000 USDT default applies.
    const run = await processWithdrawals(client, chain, signer, config, {
      nativeUsdtRate: Money.of('1000'),
    });
    expect(run.routedToReview).toBe(1);
    expect((await withdrawalRow(id)).status).toBe('ADMIN_REVIEW');
    expect(chain.sent).toEqual([]);
  });

  it('self-heals a dual-approved row stranded by a crash before release', async () => {
    const config = testConfig('TEST_WD_STUCK');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const reviewPolicy = policy({ adminReviewThreshold: Money.of('1000') });
    const financeAdmin = await newAdmin('FINANCE_ADMIN');
    const superAdmin = await newAdmin('SUPER_ADMIN');
    const user = await newFundedUser('2000');
    const id = await requestWithdrawal(config, user, '1500');

    await processWithdrawals(client, chain, signer, config, reviewPolicy);
    expect((await withdrawalRow(id)).status).toBe('ADMIN_REVIEW');

    // Simulate the crash window: both approvals recorded, release lost.
    await client.query(
      `insert into withdrawal_review_approvals (withdrawal_id, admin_user_id, admin_role)
       values ($1, $2, 'FINANCE_ADMIN'), ($1, $3, 'SUPER_ADMIN')`,
      [id, financeAdmin, superAdmin],
    );

    const heal = await processWithdrawals(client, chain, signer, config, reviewPolicy);
    expect(heal.releasedFromReview).toBe(1);
    expect(heal.broadcast).toBe(1); // released rows broadcast in the same run
    expect((await withdrawalRow(id)).status).toBe('BROADCAST');
  });

  it('a refund from a crashed rejection wins over approvals (no double payout)', async () => {
    const config = testConfig('TEST_WD_REFUND_RACE');
    const chain = new FakeChain();
    const signer = new FakeSigner();
    const reviewPolicy = policy({ adminReviewThreshold: Money.of('1000') });
    const financeAdmin = await newAdmin('FINANCE_ADMIN');
    const superAdmin = await newAdmin('SUPER_ADMIN');
    const user = await newFundedUser('2000');
    const id = await requestWithdrawal(config, user, '1500');

    await processWithdrawals(client, chain, signer, config, reviewPolicy);
    expect((await withdrawalRow(id)).status).toBe('ADMIN_REVIEW');

    // Simulate rejectWithdrawal crashing between the refund and the status
    // update: the refund is posted but the row is still ADMIN_REVIEW.
    await withdrawalRejectionRefund(client, {
      userId: user,
      amount: Money.of('1500'),
      idempotencyKey: `wdrefund:${id}`,
      referenceType: 'blockchain_withdrawal',
      referenceId: id,
    });
    expect(await availableBalance(user)).toBe('2000.00000000');

    // Dual approval afterwards must NOT release the (already refunded) row.
    await approveWithdrawal(client, { withdrawalId: id, adminUserId: financeAdmin, adminRole: 'FINANCE_ADMIN' });
    const second = await approveWithdrawal(client, {
      withdrawalId: id,
      adminUserId: superAdmin,
      adminRole: 'SUPER_ADMIN',
    });
    expect(second.released).toBe(false);
    expect((await withdrawalRow(id)).status).toBe('REJECTED');

    const run = await processWithdrawals(client, chain, signer, config, reviewPolicy);
    expect(run.broadcast).toBe(0);
    expect(chain.sent).toEqual([]);
    expect(await availableBalance(user)).toBe('2000.00000000'); // refunded exactly once, never paid out
  });

  it('DB refuses BROADCAST rows without a persisted transaction identity', async () => {
    const config = testConfig('TEST_WD_GUARD');
    const user = await newFundedUser('40');
    const id = await requestWithdrawal(config, user, '11');

    await expect(
      client.query(`update blockchain_withdrawals set status = 'BROADCAST' where id = $1`, [id]),
    ).rejects.toThrow(/withdrawals_broadcast_requires_tx/);
  });
});
