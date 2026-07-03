import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money, type SqlClient } from '@sevendays/shared';
import { ensureUserAccounts, getBalance } from '@sevendays/ledger';
import {
  POLYGON_POS_USDT,
  deriveAccountXpub,
  deriveDepositAddress,
  ensureDepositAddress,
  parseMasterSeedHex,
  provisionMissingDepositAddresses,
  runDepositScan,
  type ChainConfig,
} from '../src/index.js';
import { FakeChain } from './fakes.js';

const TEST_SEED_HEX =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';

let client: SqlClient;
const xpub = deriveAccountXpub(parseMasterSeedHex(TEST_SEED_HEX));

// A private test chain id per suite run keeps cursor/index state isolated.
function testConfig(chainId: string): ChainConfig {
  return { ...POLYGON_POS_USDT, chainId };
}

beforeAll(async () => {
  client = await createTestDb();
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(`insert into users (email) values ($1) returning id`, [
    `${randomUUID()}@test.dev`,
  ]);
  return r.rows[0]!.id;
}

async function availableBalance(userId: string): Promise<string> {
  const accounts = await ensureUserAccounts(client, userId);
  return getBalance(client, accounts.available);
}

function transferTo(address: string, opts: { block: bigint; units: bigint; txHash?: string; logIndex?: number }) {
  return {
    txHash: opts.txHash ?? `0x${randomUUID().replaceAll('-', '')}${randomUUID().replaceAll('-', '')}`.slice(0, 66),
    logIndex: opts.logIndex ?? 0,
    from: '0x2222222222222222222222222222222222222222',
    to: address,
    valueUnits: opts.units,
    blockNumber: opts.block,
  };
}

describe('deposit address provisioning', () => {
  const config = testConfig('TEST_PROVISION');

  it('allocates sequential HD indices and is idempotent per user', async () => {
    const userA = await newUser();
    const userB = await newUser();

    const a1 = await ensureDepositAddress(client, config, xpub, userA);
    const a2 = await ensureDepositAddress(client, config, xpub, userA);
    const b = await ensureDepositAddress(client, config, xpub, userB);

    expect(a1.derivationIndex).toBe(0);
    expect(a2).toEqual(a1);
    expect(b.derivationIndex).toBe(1);
    expect(a1.address).toBe(deriveDepositAddress(xpub, 0));
    expect(b.address).toBe(deriveDepositAddress(xpub, 1));
    expect(a1.address).not.toBe(b.address);
  });

  it('provisionMissingDepositAddresses covers users without an address', async () => {
    const userC = await newUser();
    const provisioned = await provisionMissingDepositAddresses(client, config, xpub);
    expect(provisioned.some((p) => p.userId === userC)).toBe(true);

    const again = await provisionMissingDepositAddresses(client, config, xpub);
    expect(again.filter((p) => p.userId === userC)).toHaveLength(0);
  });
});

describe('deposit watcher', () => {
  it('launch day: empty chain scans cleanly and credits nothing', async () => {
    const config = testConfig('TEST_EMPTY');
    const chain = new FakeChain();
    chain.latestBlock = 500n;

    const result = await runDepositScan(client, chain, config);
    // First run initializes the cursor at `latest`; nothing to scan yet.
    expect(result.detected).toBe(0);
    expect(result.credited).toBe(0);

    chain.latestBlock = 510n;
    const second = await runDepositScan(client, chain, config);
    expect(second.scannedFrom).toBe(501n);
    expect(second.scannedTo).toBe(510n);
    expect(second.detected).toBe(0);
  });

  it('detects, tracks confirmations, and credits exactly once at 128 blocks', async () => {
    const config = testConfig('TEST_FLOW');
    const chain = new FakeChain();
    const user = await newUser();
    const { address } = await ensureDepositAddress(client, config, xpub, user);

    const txHash = `0x${'ab'.repeat(32)}`;
    chain.transfers.push(transferTo(address, { block: 900n, units: 100_000_000n, txHash }));
    chain.latestBlock = 1000n;

    // Scan from block 900: detected but only 101 confirmations — not credited.
    const first = await runDepositScan(client, chain, config, { startBlock: 900n });
    expect(first.detected).toBe(1);
    expect(first.credited).toBe(0);
    expect(Money.of(await availableBalance(user)).isZero()).toBe(true);

    const row = await client.query<{ status: string; confirmation_count: number; block_number: string }>(
      `select status::text as status, confirmation_count, block_number::text as block_number
       from blockchain_deposits where chain_id = $1 and tx_hash = $2`,
      [config.chainId, txHash],
    );
    expect(row.rows[0]).toMatchObject({ status: 'DETECTED', confirmation_count: 101, block_number: '900' });

    // 128th confirmation arrives: credit through the Ledger, exactly once.
    chain.latestBlock = 1027n;
    const second = await runDepositScan(client, chain, config);
    expect(second.credited).toBe(1);
    expect(await availableBalance(user)).toBe('100.00000000');

    const credited = await client.query<{ status: string; ledger_transaction_id: string | null }>(
      `select status::text as status, ledger_transaction_id from blockchain_deposits
       where chain_id = $1 and tx_hash = $2`,
      [config.chainId, txHash],
    );
    expect(credited.rows[0]!.status).toBe('CREDITED');
    expect(credited.rows[0]!.ledger_transaction_id).not.toBeNull();

    // Re-scanning the same range (cursor rolled back = crash replay) must
    // not double-detect or double-credit.
    await client.query(`update chain_scan_cursors set last_scanned_block = 899 where chain_id = $1`, [
      config.chainId,
    ]);
    const replay = await runDepositScan(client, chain, config);
    expect(replay.alreadyKnown).toBe(1);
    expect(replay.detected).toBe(0);
    expect(replay.credited).toBe(0);
    expect(await availableBalance(user)).toBe('100.00000000');
  });

  it('credits a row stranded in CONFIRMED by a crash, without double credit', async () => {
    const config = testConfig('TEST_CRASH');
    const chain = new FakeChain();
    const user = await newUser();
    const { address } = await ensureDepositAddress(client, config, xpub, user);

    const txHash = `0x${'cd'.repeat(32)}`;
    chain.transfers.push(transferTo(address, { block: 100n, units: 55_000_000n, txHash }));
    chain.latestBlock = 300n;

    await runDepositScan(client, chain, config, { startBlock: 100n });
    expect(await availableBalance(user)).toBe('55.00000000');

    // Simulate the crash window: pretend the CREDITED update was lost.
    await client.query(
      `update blockchain_deposits set status = 'CONFIRMED', ledger_transaction_id = null
       where chain_id = $1 and tx_hash = $2`,
      [config.chainId, txHash],
    );
    const rerun = await runDepositScan(client, chain, config);
    expect(rerun.credited).toBe(1); // row re-processed…
    expect(await availableBalance(user)).toBe('55.00000000'); // …but the ledger replayed idempotently

    const row = await client.query<{ status: string }>(
      `select status::text as status from blockchain_deposits where chain_id = $1 and tx_hash = $2`,
      [config.chainId, txHash],
    );
    expect(row.rows[0]!.status).toBe('CREDITED');
  });

  it('ignores transfers to unknown addresses', async () => {
    const config = testConfig('TEST_UNKNOWN');
    const chain = new FakeChain();
    chain.transfers.push(
      transferTo('0x3333333333333333333333333333333333333333', { block: 10n, units: 1_000_000n }),
    );
    chain.latestBlock = 20n;

    const result = await runDepositScan(client, chain, config, { startBlock: 1n });
    expect(result.skippedUnknownAddress).toBe(1);
    expect(result.detected).toBe(0);
  });

  it('takes only the first matching transfer of a tx_hash (spec: duplicate tx rejected)', async () => {
    const config = testConfig('TEST_MULTI');
    const chain = new FakeChain();
    const userA = await newUser();
    const userB = await newUser();
    const a = await ensureDepositAddress(client, config, xpub, userA);
    const b = await ensureDepositAddress(client, config, xpub, userB);

    const txHash = `0x${'ef'.repeat(32)}`;
    chain.transfers.push(
      transferTo(a.address, { block: 50n, units: 10_000_000n, txHash, logIndex: 0 }),
      transferTo(b.address, { block: 50n, units: 20_000_000n, txHash, logIndex: 1 }),
    );
    chain.latestBlock = 60n;

    const result = await runDepositScan(client, chain, config, { startBlock: 1n });
    expect(result.detected).toBe(1);
    expect(result.skippedSameTxExtra).toBe(1);
  });

  it('preserves unit-level precision (1 unit = 0.000001 USDT)', async () => {
    const config = testConfig('TEST_DUST');
    const chain = new FakeChain();
    const user = await newUser();
    const { address } = await ensureDepositAddress(client, config, xpub, user);

    chain.transfers.push(transferTo(address, { block: 5n, units: 1n }));
    chain.latestBlock = 200n;

    const result = await runDepositScan(client, chain, config, { startBlock: 1n });
    expect(result.credited).toBe(1);
    expect(await availableBalance(user)).toBe('0.00000100');
  });
});
