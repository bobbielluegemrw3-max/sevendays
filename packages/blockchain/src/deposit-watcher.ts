import { Money, type SqlClient } from '@sevendays/shared';
import { depositConfirmation } from '@sevendays/ledger';
import type { ChainClient, TokenTransfer } from './types.js';
import type { ChainConfig } from './config.js';
import { unitsToMoney } from './amounts.js';

/**
 * Deposit watcher core (07_API.md Deposit v1.0, 01_CONSTITUTION.md):
 * detect USDT transfers to per-user HD addresses, count confirmations,
 * and credit USER_AVAILABLE strictly via the
 * BLOCKCHAIN_DEPOSIT_CONFIRMATION ledger transaction.
 *
 * Crash safety: every step is an idempotent statement — detection inserts
 * are absorbed by uq_deposit_chain_tx, the ledger credit replays by its
 * deterministic idempotency key (`deposit:{chain}:{tx_hash}`), and the
 * cursor only advances after the range is fully inserted. A crash anywhere
 * re-runs cleanly with the same result and NEVER double-credits. No
 * explicit transaction wrapping is needed (and postTransaction manages its
 * own), which also avoids the nested-BEGIN pitfall.
 */

export interface DepositScanOptions {
  /** Upper bound of blocks fetched per run (RPC limit protection). */
  maxBlocksPerScan?: number;
  /** First block to scan when no cursor exists yet (backfill/tests). */
  startBlock?: bigint;
}

export interface DepositScanResult {
  scannedFrom: bigint | null;
  scannedTo: bigint | null;
  detected: number;
  alreadyKnown: number;
  skippedUnknownAddress: number;
  /** Extra matching transfers inside a tx_hash that already produced a deposit
   *  (spec: duplicate tx_hash is rejected). Surfaced for ops follow-up. */
  skippedSameTxExtra: number;
  credited: number;
}

async function readCursor(client: SqlClient, chainId: string): Promise<bigint | null> {
  const r = await client.query<{ last_scanned_block: string }>(
    `select last_scanned_block::text as last_scanned_block from chain_scan_cursors where chain_id = $1`,
    [chainId],
  );
  return r.rows[0] ? BigInt(r.rows[0].last_scanned_block) : null;
}

async function detectTransfers(
  client: SqlClient,
  config: ChainConfig,
  transfers: TokenTransfer[],
  result: DepositScanResult,
): Promise<void> {
  if (transfers.length === 0) return;

  const targets = [...new Set(transfers.map((t) => t.to.toLowerCase()))];
  const owners = await client.query<{ user_id: string; address: string }>(
    `select user_id, address from deposit_addresses
     where chain_id = $1 and lower(address) = any($2)`,
    [config.chainId, targets],
  );
  const ownerByAddress = new Map(owners.rows.map((r) => [r.address.toLowerCase(), r.user_id]));

  const ordered = [...transfers].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
  const seenTxInBatch = new Set<string>();
  for (const transfer of ordered) {
    const userId = ownerByAddress.get(transfer.to.toLowerCase());
    if (!userId) {
      result.skippedUnknownAddress += 1;
      continue;
    }
    if (seenTxInBatch.has(transfer.txHash)) {
      result.skippedSameTxExtra += 1;
      continue;
    }
    seenTxInBatch.add(transfer.txHash);
    const amount = unitsToMoney(transfer.valueUnits, config.tokenDecimals);
    const inserted = await client.query(
      `insert into blockchain_deposits
         (user_id, chain_id, token_contract, tx_hash, from_address, to_address, amount, block_number)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict on constraint uq_deposit_chain_tx do nothing`,
      [
        userId,
        config.chainId,
        config.tokenContract,
        transfer.txHash,
        transfer.from,
        transfer.to,
        amount.toFixed8(),
        transfer.blockNumber.toString(),
      ],
    );
    if ((inserted.affectedRows ?? 0) > 0) result.detected += 1;
    else result.alreadyKnown += 1;
  }
}

async function creditConfirmedDeposits(
  client: SqlClient,
  config: ChainConfig,
  latestBlock: bigint,
  result: DepositScanResult,
): Promise<void> {
  // Refresh confirmation counts for everything still in flight.
  await client.query(
    `update blockchain_deposits
     set confirmation_count = greatest(0, least(2147483647, $2::bigint - block_number + 1))::int
     where chain_id = $1 and status in ('DETECTED', 'CONFIRMED') and block_number is not null`,
    [config.chainId, latestBlock.toString()],
  );

  // Credit everything at/over the confirmation threshold. Rows left in
  // CONFIRMED by an earlier crash are picked up again here.
  const due = await client.query<{ id: string; user_id: string; tx_hash: string; amount: string }>(
    `select id, user_id, tx_hash, amount::text as amount
     from blockchain_deposits
     where chain_id = $1 and status in ('DETECTED', 'CONFIRMED') and confirmation_count >= $2
     order by block_number, tx_hash`,
    [config.chainId, config.confirmationBlocks],
  );

  for (const row of due.rows) {
    await client.query(`update blockchain_deposits set status = 'CONFIRMED' where id = $1 and status = 'DETECTED'`, [
      row.id,
    ]);
    const posted = await depositConfirmation(client, {
      userId: row.user_id,
      amount: Money.of(row.amount),
      idempotencyKey: `deposit:${config.chainId}:${row.tx_hash}`,
      referenceType: 'blockchain_deposit',
      referenceId: row.id,
    });
    await client.query(
      `update blockchain_deposits
       set status = 'CREDITED', ledger_transaction_id = $2, confirmed_at = now()
       where id = $1`,
      [row.id, posted.transactionId],
    );
    result.credited += 1;
  }
}

/** One watcher pass: scan new blocks, then confirm/credit pending deposits. */
export async function runDepositScan(
  client: SqlClient,
  chain: ChainClient,
  config: ChainConfig,
  options: DepositScanOptions = {},
): Promise<DepositScanResult> {
  const result: DepositScanResult = {
    scannedFrom: null,
    scannedTo: null,
    detected: 0,
    alreadyKnown: 0,
    skippedUnknownAddress: 0,
    skippedSameTxExtra: 0,
    credited: 0,
  };
  const maxBlocks = BigInt(options.maxBlocksPerScan ?? 2000);
  const latest = await chain.getLatestBlockNumber();

  let cursor = await readCursor(client, config.chainId);
  if (cursor === null) {
    // First run: start watching from `startBlock` if given, else from the
    // next block. Historical backfill is an explicit opt-in.
    const initial = options.startBlock !== undefined ? options.startBlock - 1n : latest;
    await client.query(
      `insert into chain_scan_cursors (chain_id, last_scanned_block)
       values ($1, $2) on conflict (chain_id) do nothing`,
      [config.chainId, (initial < 0n ? 0n : initial).toString()],
    );
    cursor = await readCursor(client, config.chainId);
  }

  const from = cursor! + 1n;
  const to = latest < from + maxBlocks - 1n ? latest : from + maxBlocks - 1n;
  if (from <= to) {
    const transfers = await chain.getTokenTransfers(config.tokenContract, from, to);
    await detectTransfers(client, config, transfers, result);
    // Advance only after the whole range is safely inserted; a crash before
    // this re-scans the same range idempotently.
    await client.query(
      `update chain_scan_cursors set last_scanned_block = $2, updated_at = now() where chain_id = $1`,
      [config.chainId, to.toString()],
    );
    result.scannedFrom = from;
    result.scannedTo = to;
  }

  await creditConfirmedDeposits(client, config, latest, result);
  return result;
}
