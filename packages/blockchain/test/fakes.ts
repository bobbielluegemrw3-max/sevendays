import { createHash } from 'node:crypto';
import type {
  ChainClient,
  GasFees,
  TokenTransfer,
  TransactionStatus,
  WithdrawalSigner,
} from '../src/index.js';

/** Scripted in-memory chain for watcher/broadcaster tests. */
export class FakeChain implements ChainClient {
  latestBlock = 0n;
  transfers: TokenTransfer[] = [];
  statuses = new Map<string, TransactionStatus>();
  sent: string[] = [];
  pendingNonce = 0n;
  /** When set, the next sendRawTransaction throws once. */
  nextSendError: Error | null = null;

  async getLatestBlockNumber(): Promise<bigint> {
    return this.latestBlock;
  }

  async getTokenTransfers(_token: string, fromBlock: bigint, toBlock: bigint): Promise<TokenTransfer[]> {
    return this.transfers.filter((t) => t.blockNumber >= fromBlock && t.blockNumber <= toBlock);
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const explicit = this.statuses.get(txHash);
    if (explicit) return explicit;
    // Chain-faithful default: a transaction whose Transfer event is visible
    // has a SUCCESS receipt in that block; anything else is unknown.
    const transfer = this.transfers.find((t) => t.txHash === txHash);
    return transfer ? { kind: 'SUCCESS', blockNumber: transfer.blockNumber } : { kind: 'NOT_FOUND' };
  }

  async getPendingNonce(): Promise<bigint> {
    return this.pendingNonce;
  }

  async getGasFees(): Promise<GasFees> {
    // 10 gwei x transferGasLimit 100k = 0.001 native token per transfer,
    // so a nativeUsdtRate of 1000 makes the pass-through fee exactly 1 USDT.
    return { maxFeePerGas: 10_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };
  }

  async sendRawTransaction(rawTx: string): Promise<void> {
    if (this.nextSendError) {
      const error = this.nextSendError;
      this.nextSendError = null;
      throw error;
    }
    this.sent.push(rawTx);
  }
}

/** Deterministic signer — tx identity derived from the signing inputs,
 *  mirroring the real property that same inputs => same raw tx => same hash. */
export class FakeSigner implements WithdrawalSigner {
  readonly address = '0x1111111111111111111111111111111111111111';
  signCount = 0;

  async signTokenTransfer(args: {
    tokenContract: string;
    to: string;
    valueUnits: bigint;
    nonce: bigint;
  }): Promise<{ rawTx: string; txHash: string }> {
    this.signCount += 1;
    const digest = createHash('sha256')
      .update(`${args.tokenContract}|${args.to}|${args.valueUnits}|${args.nonce}`)
      .digest('hex');
    return { txHash: `0x${digest}`, rawTx: `raw:0x${digest}` };
  }
}
