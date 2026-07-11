import { buildApiRegistry, createWorkerServer } from '@sevendays/api-contracts';
import { createPool, withPoolClient } from '@sevendays/database';
import { Money, batchDateFor, batchStartUtc } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
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
 * Consolidated Render worker (Decision 070): all eleven worker roles in a
 * single always-on private service, with the scheduler IN-PROCESS instead
 * of Cloud Scheduler. Every scheduled job is idempotent, so restarts and
 * double-fires are harmless, and the daily batch trigger is self-healing:
 * "today's batch is due and no batch_runs row exists" re-evaluates every
 * tick rather than firing once at a fixed instant.
 *
 * The Cloud Run path (infra/cloudrun) remains in the repo as the scale-out
 * option; the per-role services stay for targeted re-invocation there.
 */

const port = Number(process.env.PORT ?? 8080);
const databaseUrl = process.env.DATABASE_URL;
const internalToken = process.env.INTERNAL_TOKEN;
if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
if (!internalToken) throw new Error('INTERNAL_TOKEN is not configured');

const registry = buildApiRegistry();
const pool = createPool(databaseUrl);
const withClient = <T>(fn: (client: SqlClient) => Promise<T>): Promise<T> => withPoolClient(pool, fn);

const INTERNAL_PATHS = [
  '/internal/batch/start',
  '/internal/push/race-reminder',
  '/internal/market/post-batch',
  '/internal/race/run',
  '/internal/burn/run',
  '/internal/mlm/pay',
  '/internal/assignment/run',
  '/internal/buyback/pay',
  '/internal/recovery/run',
  '/internal/recovery/check-timeouts',
  '/internal/stress/run',
  '/internal/liquidity/report',
];

// ----------------------------------------------------------------- chain
function chainConfig(): ChainConfig {
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

function chainClientOptions(): { getLogsRangeLimit?: bigint } {
  return process.env.CHAIN_GETLOGS_RANGE
    ? { getLogsRangeLimit: BigInt(process.env.CHAIN_GETLOGS_RANGE) }
    : {};
}

async function depositScanJob(client: SqlClient): Promise<Record<string, unknown>> {
  const config = chainConfig();
  const chain = createViemChainClient(requireEnv('CHAIN_RPC_URL'), chainClientOptions());
  const provisioned = await provisionMissingDepositAddresses(client, config, requireEnv('DEPOSIT_ACCOUNT_XPUB'));
  const scan = await runDepositScan(client, chain, config);
  return {
    provisioned: provisioned.length,
    ...scan,
    scannedFrom: scan.scannedFrom?.toString() ?? null,
    scannedTo: scan.scannedTo?.toString() ?? null,
  };
}

async function withdrawalsJob(client: SqlClient): Promise<Record<string, unknown>> {
  const config = chainConfig();
  const chain = createViemChainClient(requireEnv('CHAIN_RPC_URL'), chainClientOptions());
  const signer = createViemWithdrawalSigner(requireEnv('HOT_WALLET_PRIVATE_KEY'), config);
  return { ...(await processWithdrawals(client, chain, signer, config, {
    nativeUsdtRate: Money.of(requireEnv('NATIVE_USDT_RATE')),
  })) };
}

async function memorialJob(client: SqlClient): Promise<Record<string, unknown>> {
  const contractAddress = process.env.MEMORIAL_CONTRACT_ADDRESS;
  const custodyAddress = process.env.MEMORIAL_CUSTODY_ADDRESS;
  if (!contractAddress || !custodyAddress) {
    return { skipped: 'MEMORIAL_CONTRACT_ADDRESS / MEMORIAL_CUSTODY_ADDRESS not configured' };
  }
  const minter = createViemNftMinter({
    rpcUrl: requireEnv('CHAIN_RPC_URL'),
    privateKeyHex: requireEnv('HOT_WALLET_PRIVATE_KEY'),
    contractAddress,
    ...(process.env.MEMORIAL_DEPLOY_BLOCK
      ? { deployedAtBlock: BigInt(process.env.MEMORIAL_DEPLOY_BLOCK) }
      : {}),
    ...chainClientOptions(),
  });
  return { ...(await processMemorialMints(client, minter, chainConfig(), { custodyAddress })) };
}

// ------------------------------------------------------------- scheduler
const chainEnabled = Boolean(process.env.CHAIN_RPC_URL);
const lastRun: Record<string, number> = {};
let lastPostBatchDate: string | null = null;

function every(key: string, ms: number): boolean {
  const now = Date.now();
  if ((lastRun[key] ?? 0) + ms > now) return false;
  lastRun[key] = now;
  return true;
}

async function dispatchInternal(path: string, body: unknown): Promise<void> {
  const result = await withClient((client) =>
    registry.dispatch(client, { method: 'POST', path, auth: { kind: 'internal' }, body, idempotencyKey: null }),
  );
  console.log(`[scheduler] ${path} -> ${result.status} ${JSON.stringify(result.body).slice(0, 300)}`);
}

let ticking = false;
async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    // Heartbeat: the worker is quiet by design (jobs log only when they do
    // work), so prove liveness every 30 minutes.
    if (every('heartbeat', 1_800_000)) {
      const today = batchDateFor(new Date());
      const nextBatch = batchStartUtc(today).getTime() <= Date.now() ? 'due/ran today' : batchStartUtc(today).toISOString();
      console.log(`[heartbeat] alive; chain=${chainEnabled ? 'on' : 'off'}; daily batch (${today}): ${nextBatch}`);
    }
    // 発走5分前プッシュ(Decision 084): 19:55-20:00 MYT の窓で毎分試行。
    // ブロードキャストの一意クレーム(race-soon:{date})が冪等性を担保するので
    // 多重試行しても1晩1回しか送られない。窓を丸ごと逃した夜は
    // /internal/batch/start 側のフォールバック(race-start)が拾う。
    const todayForPush = batchDateFor(new Date());
    const raceStartMs = batchStartUtc(todayForPush).getTime();
    if (Date.now() >= raceStartMs - 5 * 60_000 && Date.now() < raceStartMs && every('race-reminder', 60_000)) {
      await dispatchInternal('/internal/push/race-reminder', { batch_date: todayForPush });
    }

    // Daily Settlement Batch: due at 20:00 MYT (Decision 047) for the MYT
    // calendar day; the batch_runs existence check makes this self-healing
    // (a FAILED batch is NOT retried here — that is Admin Recovery's job).
    const today = batchDateFor(new Date());
    if (Date.now() >= batchStartUtc(today).getTime()) {
      const existing = await withClient((client) =>
        client.query(`select 1 from batch_runs where batch_date = $1`, [today]),
      );
      if (existing.rows.length === 0) {
        console.log(`[scheduler] daily batch due for ${today}`);
        await dispatchInternal('/internal/batch/start', { batch_date: today });
      }
    }

    // バッチ後スイープ(Decision 086): 当日バッチがCOMPLETEDになったら1回
    // (自動購入予約+売却メール)。エンドポイントは完全冪等なので、
    // ワーカー再起動での再実行は無害。COMPLETEDまでは5分おきに確認する。
    if (
      lastPostBatchDate !== today &&
      Date.now() >= batchStartUtc(today).getTime() &&
      every('market-post-batch', 300_000)
    ) {
      const done = await withClient((client) =>
        client.query(`select 1 from batch_runs where batch_date = $1 and status = 'COMPLETED'`, [today]),
      );
      if (done.rows.length > 0) {
        await dispatchInternal('/internal/market/post-batch', { batch_date: today });
        lastPostBatchDate = today;
      }
    }

    if (every('recovery-timeouts', 3_600_000)) {
      await dispatchInternal('/internal/recovery/check-timeouts', {});
    }

    if (chainEnabled) {
      if (every('deposit-scan', 120_000)) {
        const r = await withClient(depositScanJob);
        console.log(`[scheduler] deposit-scan ${JSON.stringify(r).slice(0, 200)}`);
      }
      if (every('withdrawals', 300_000)) {
        const r = await withClient(withdrawalsJob);
        console.log(`[scheduler] withdrawals ${JSON.stringify(r).slice(0, 200)}`);
      }
      if (every('memorial-mints', 3_600_000)) {
        const r = await withClient(memorialJob);
        console.log(`[scheduler] memorial-mints ${JSON.stringify(r).slice(0, 200)}`);
      }
    }
  } catch (error) {
    console.error('[scheduler]', (error as Error).message);
  } finally {
    ticking = false;
  }
}

// --------------------------------------------------------------- server
const server = createWorkerServer({
  workerName: 'render-worker',
  registry,
  withClient,
  internalToken,
  allowPaths: INTERNAL_PATHS,
  jobs: {
    '/jobs/deposit-scan': depositScanJob,
    '/jobs/process-withdrawals': withdrawalsJob,
    '/jobs/memorial-mints': memorialJob,
  },
});

server.listen(port, () => {
  console.log(`render-worker listening on ${port} (scheduler: 30s tick, chain=${chainEnabled ? 'on' : 'off'})`);
});
setInterval(() => void tick(), 30_000);
void tick();
