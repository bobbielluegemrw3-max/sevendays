import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import { ensureUserAccounts, getBalance, withdrawalFundLock } from '@sevendays/ledger';
import {
  amoyTestConfig,
  createViemChainClient,
  createViemWithdrawalSigner,
  createViemNftMinter,
  deriveDepositAddress,
  ensureDepositAddress,
  memorialTokenId,
  processMemorialMints,
  processWithdrawals,
  runDepositScan,
} from '../dist/index.js';

/**
 * Phase 12 live verification on Polygon Amoy (HANDOVER: Amoy実機検証).
 * Local PGlite database + the REAL chain through QuickNode:
 *   1. deposit: on-chain USDT transfer to an HD address -> watcher detects,
 *      counts 128 confirmations, credits through the Ledger
 *   2. withdrawal: fund lock -> sign -> persist -> broadcast -> 128-deep
 *      confirmation; net amount actually arrives on chain
 *   3. memorial: real ERC-721 mint, idempotent re-run, and the
 *      crash-window replay (minted on chain, DB row completed with the
 *      ORIGINAL transaction)
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const env = readFileSync(join(root, '.env.local'), 'utf8');
const get = (key) => {
  const match = new RegExp(`^${key}=(.+)$`, 'm').exec(env);
  if (!match) throw new Error(`${key} missing from .env.local`);
  return match[1].trim();
};

const rpcUrl = get('AMOY_RPC_URL');
const xpub = get('AMOY_DEPOSIT_XPUB');
const hotKey = get('AMOY_HOT_WALLET_KEY');
const usdtAddress = get('AMOY_USDT_CONTRACT');
const memorialAddress = get('AMOY_MEMORIAL_CONTRACT');

const config = amoyTestConfig(usdtAddress, 6);
// QuickNode Discover (free) plan caps eth_getLogs at a 5-block range.
const chain = createViemChainClient(rpcUrl, { getLogsRangeLimit: 5n });
const signer = createViemWithdrawalSigner(hotKey, config);
const hot = privateKeyToAccount(hotKey);
const publicClient = createPublicClient({ chain: polygonAmoy, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account: hot, chain: polygonAmoy, transport: http(rpcUrl) });

const USDT_ABI = parseAbi([
  'function mint(address to, uint256 value)',
  'function balanceOf(address holder) view returns (uint256)',
]);
const MEMORIAL_ABI = parseAbi(['function ownerOf(uint256 tokenId) view returns (address)']);

const log = (message) => console.log(`[AMOY] ${new Date().toISOString()} ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendUsdt(to, units) {
  const hash = await walletClient.writeContract({
    address: usdtAddress,
    abi: USDT_ABI,
    functionName: 'mint',
    args: [to, units],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`USDT mint reverted: ${hash}`);
  return receipt;
}

const client = await createTestDb();
const user = (
  await client.query(`insert into users (email) values ($1) returning id`, [
    `amoy+${randomUUID()}@verify.dev`,
  ])
).rows[0].id;

// ---------------------------------------------------------------- deposit
const { address: depositAddress, derivationIndex } = await ensureDepositAddress(
  client,
  config,
  xpub,
  user,
);
log(`deposit address #${derivationIndex}: ${depositAddress}`);

const fundReceipt = await sendUsdt(depositAddress, 250_000000n);
log(`on-chain USDT sent to deposit address (block ${fundReceipt.blockNumber}, tx ${fundReceipt.transactionHash})`);
await sendUsdt(hot.address, 1_000_000000n); // hot wallet liquidity for withdrawals

const startBlock = fundReceipt.blockNumber - 3n;
const deadline = Date.now() + 20 * 60_000;
let credited = 0;
while (Date.now() < deadline) {
  const scan = await runDepositScan(client, chain, config, { startBlock, maxBlocksPerScan: 5000 });
  credited += scan.credited;
  const row = (
    await client.query(
      `select status::text as status, confirmation_count from blockchain_deposits where chain_id = $1`,
      [config.chainId],
    )
  ).rows[0];
  log(`deposit scan: status=${row?.status ?? 'none'} confirmations=${row?.confirmation_count ?? 0}/${config.confirmationBlocks}`);
  if (credited > 0) break;
  await sleep(20_000);
}
if (credited === 0) throw new Error('deposit was not credited within the deadline');

const accounts = await ensureUserAccounts(client, user);
const available = await getBalance(client, accounts.available);
if (available !== '250.00000000') throw new Error(`unexpected balance ${available}`);
log(`DEPOSIT VERIFIED: 128-deep confirmation credited 250 USDT through the ledger`);

// ------------------------------------------------------------- withdrawal
const destination = deriveDepositAddress(xpub, 999);
const lock = await withdrawalFundLock(client, {
  userId: user,
  amount: Money.of('40'),
  idempotencyKey: `amoy:wd:${randomUUID()}`,
});
const withdrawalId = (
  await client.query(
    `insert into blockchain_withdrawals
       (user_id, chain_id, token_contract, to_address, requested_amount, network_fee_amount, net_amount, status, ledger_transaction_id)
     values ($1, $2, $3, $4, 40, 0, 40, 'LOCKED', $5) returning id`,
    [user, config.chainId, usdtAddress, destination, lock.transactionId],
  )
).rows[0].id;
log(`withdrawal requested: 40 USDT -> ${destination}`);

let confirmedWithdrawal = false;
while (Date.now() < deadline + 15 * 60_000) {
  const run = await processWithdrawals(client, chain, signer, config, {
    nativeUsdtRate: Money.of('0.2'),
  });
  const row = (
    await client.query(
      `select status::text as status, tx_hash, net_amount::text as net_amount from blockchain_withdrawals where id = $1`,
      [withdrawalId],
    )
  ).rows[0];
  log(`withdrawal: status=${row.status} broadcast=${run.broadcast} confirmed=${run.confirmed} tx=${row.tx_hash ?? '-'}`);
  if (row.status === 'CONFIRMED') {
    const net = Money.of(row.net_amount);
    const onChain = await publicClient.readContract({
      address: usdtAddress,
      abi: USDT_ABI,
      functionName: 'balanceOf',
      args: [destination],
    });
    const expectedUnits = BigInt(net.mulFloor('1000000').toString());
    if (onChain !== expectedUnits) {
      throw new Error(`destination balance ${onChain} != expected ${expectedUnits}`);
    }
    log(`WITHDRAWAL VERIFIED: net ${row.net_amount} USDT arrived on chain (fee = live gas x rate)`);
    confirmedWithdrawal = true;
    break;
  }
  await sleep(20_000);
}
if (!confirmedWithdrawal) throw new Error('withdrawal did not confirm within the deadline');

// --------------------------------------------------------------- memorial
async function newMemorial() {
  const horse = (
    await client.query(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json, status)
       values ($1, 7, $2, 'BALANCED', 'COMMON', $3, 0.50, 'horse_generation_v1.0', $4, $5, 'MEMORIALIZED')
       returning id`,
      [
        user,
        `Amoy Memorial ${randomUUID().slice(0, 8)}`,
        randomUUID().replaceAll('-', ''),
        randomUUID().replaceAll('-', ''),
        JSON.stringify({ speed: 75, power: 75, stamina: 75, recovery: 75, luck: 75 }),
      ],
    )
  ).rows[0].id;
  const schedule = (
    await client.query(
      `insert into buyback_schedules (horse_id, user_id, status, total_amount, payment_count, day7_clear_date)
       values ($1, $2, 'COMPLETED', 200, 7, '2036-01-01') returning id`,
      [horse, user],
    )
  ).rows[0].id;
  return (
    await client.query(
      `insert into memorial_nfts (horse_id, user_id, buyback_schedule_id, metadata_json)
       values ($1, $2, $3, $4) returning id`,
      [horse, user, schedule, JSON.stringify({ version: 'memorial_v1.0', horse_uuid: horse })],
    )
  ).rows[0].id;
}

const minter = createViemNftMinter({
  rpcUrl,
  privateKeyHex: hotKey,
  contractAddress: memorialAddress,
  deployedAtBlock: fundReceipt.blockNumber - 100n,
  getLogsRangeLimit: 5n,
});

const memorialA = await newMemorial();
const mintRun = await processMemorialMints(client, minter, config, { custodyAddress: hot.address });
const rowA = (
  await client.query(`select token_id, mint_tx_hash from memorial_nfts where id = $1`, [memorialA])
).rows[0];
const onChainOwner = await publicClient.readContract({
  address: memorialAddress,
  abi: MEMORIAL_ABI,
  functionName: 'ownerOf',
  args: [BigInt(rowA.token_id)],
});
if (mintRun.minted !== 1 || onChainOwner.toLowerCase() !== hot.address.toLowerCase()) {
  throw new Error('memorial mint verification failed');
}
const rerun = await processMemorialMints(client, minter, config, { custodyAddress: hot.address });
if (rerun.minted !== 0) throw new Error('memorial mint is not idempotent');
log(`MEMORIAL VERIFIED: token ${rowA.token_id} minted on chain (tx ${rowA.mint_tx_hash}); re-run idempotent`);

// Crash window: mint on chain first (as if the DB update was lost)...
const memorialB = await newMemorial();
const direct = await minter.mintMemorial({
  memorialId: memorialB,
  to: hot.address,
  tokenId: memorialTokenId(memorialB),
  metadata: {},
});
const healed = await processMemorialMints(client, minter, config, { custodyAddress: hot.address });
const rowB = (
  await client.query(`select mint_tx_hash from memorial_nfts where id = $1`, [memorialB])
).rows[0];
if (healed.minted !== 1 || rowB.mint_tx_hash !== direct.txHash) {
  throw new Error(`crash-window replay failed (${rowB.mint_tx_hash} vs ${direct.txHash})`);
}
log(`MEMORIAL CRASH-WINDOW VERIFIED: replay completed the row with the ORIGINAL tx ${direct.txHash}`);

log('ALL AMOY VERIFICATIONS PASSED');
process.exit(0);
