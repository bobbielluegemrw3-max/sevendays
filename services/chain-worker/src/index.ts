import { buildApiRegistry, createWorkerServer } from '@sevendays/api-contracts';
import { createPool, withPoolClient } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import {
  POLYGON_POS_USDT,
  amoyTestConfig,
  createViemChainClient,
  createViemNftMinter,
  createViemWithdrawalSigner,
  provisionMissingDepositAddresses,
  processMemorialMints,
  processWithdrawals,
  runDepositScan,
  type ChainConfig,
} from '@sevendays/blockchain';

/**
 * Blockchain worker (08_INFRASTRUCTURE.md Cloud Run responsibilities:
 * deposit watcher / withdrawal broadcaster / memorial mint). Not one of the
 * ten spec-fixed service directories — those cover the settlement domain;
 * this one hosts the Phase 12 chain loops. Scheduler invokes the jobs
 * periodically; every job is idempotent and crash-safe by design.
 *
 * Secrets (RPC key, HD xpub, hot wallet key) come from Secret Manager via
 * env. The master seed itself never reaches this process — deposit
 * provisioning is xpub-only; only the hot wallet private key is loaded.
 */

const port = Number(process.env.PORT ?? 8080);
const databaseUrl = process.env.DATABASE_URL;
const internalToken = process.env.INTERNAL_TOKEN;
if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
if (!internalToken) throw new Error('INTERNAL_TOKEN is not configured');

function chainConfig(): ChainConfig {
  // Decision 062: Polygon PoS is THE launch chain; Amoy is the pre-launch
  // verification environment.
  if (process.env.CHAIN_PRESET === 'POLYGON_AMOY') {
    const token = process.env.AMOY_TOKEN_CONTRACT;
    if (!token) throw new Error('AMOY_TOKEN_CONTRACT is required for the Amoy preset');
    return amoyTestConfig(token, Number(process.env.AMOY_TOKEN_DECIMALS ?? 6));
  }
  return POLYGON_POS_USDT;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

/** eth_getLogs range cap differs per RPC plan (QuickNode free: 5). */
function chainClientOptions(): { getLogsRangeLimit?: bigint } {
  return process.env.CHAIN_GETLOGS_RANGE
    ? { getLogsRangeLimit: BigInt(process.env.CHAIN_GETLOGS_RANGE) }
    : {};
}

const pool = createPool(databaseUrl);
const server = createWorkerServer({
  workerName: 'chain-worker',
  registry: buildApiRegistry(),
  withClient: (fn) => withPoolClient(pool, fn),
  internalToken,
  allowPaths: [],
  jobs: {
    '/jobs/deposit-scan': async (client) => {
      const config = chainConfig();
      const chain = createViemChainClient(requireEnv('CHAIN_RPC_URL'), chainClientOptions());
      const xpub = requireEnv('DEPOSIT_ACCOUNT_XPUB');
      const provisioned = await provisionMissingDepositAddresses(client, config, xpub);
      const scan = await runDepositScan(client, chain, config);
      return {
        provisioned: provisioned.length,
        ...scan,
        scannedFrom: scan.scannedFrom?.toString() ?? null,
        scannedTo: scan.scannedTo?.toString() ?? null,
      };
    },

    '/jobs/process-withdrawals': async (client) => {
      const config = chainConfig();
      const chain = createViemChainClient(requireEnv('CHAIN_RPC_URL'), chainClientOptions());
      const signer = createViemWithdrawalSigner(requireEnv('HOT_WALLET_PRIVATE_KEY'), config);
      // Decision 060 threshold defaults inside the policy when omitted;
      // Decision 061 rate is the ops-configured POL/USDT pass-through rate.
      return processWithdrawals(client, chain, signer, config, {
        nativeUsdtRate: Money.of(requireEnv('NATIVE_USDT_RATE')),
      });
    },

    '/jobs/memorial-mints': async (client) => {
      // Decision 063: mint after all seven buyback payments. Until ops set
      // the contract/custody env (per environment), the job reports itself
      // as skipped instead of failing the schedule.
      const contractAddress = process.env.MEMORIAL_CONTRACT_ADDRESS;
      const custodyAddress = process.env.MEMORIAL_CUSTODY_ADDRESS;
      if (!contractAddress || !custodyAddress) {
        return { skipped: 'MEMORIAL_CONTRACT_ADDRESS / MEMORIAL_CUSTODY_ADDRESS not configured' };
      }
      const config = chainConfig();
      const minter = createViemNftMinter({
        rpcUrl: requireEnv('CHAIN_RPC_URL'),
        privateKeyHex: requireEnv('HOT_WALLET_PRIVATE_KEY'),
        contractAddress,
        ...(process.env.MEMORIAL_DEPLOY_BLOCK
          ? { deployedAtBlock: BigInt(process.env.MEMORIAL_DEPLOY_BLOCK) }
          : {}),
      });
      return processMemorialMints(client, minter, config, { custodyAddress });
    },
  },
});

server.listen(port, () => {
  console.log(`chain-worker listening on ${port}`);
});
