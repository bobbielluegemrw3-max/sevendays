/**
 * Chain access boundary for Phase 12 (deposit watcher / withdrawal
 * broadcaster). Core logic depends ONLY on these interfaces; the real
 * viem-backed implementations live in rpc.ts. Tests use scripted fakes.
 */

/** An ERC-20 Transfer event observed on chain. */
export interface TokenTransfer {
  txHash: string;
  logIndex: number;
  from: string;
  to: string;
  /** Raw token units (e.g. 6-decimals for Polygon PoS USDT). */
  valueUnits: bigint;
  blockNumber: bigint;
}

export type TransactionStatus =
  | { kind: 'NOT_FOUND' }
  | { kind: 'PENDING' }
  | { kind: 'SUCCESS'; blockNumber: bigint }
  | { kind: 'REVERTED'; blockNumber: bigint };

export interface GasFees {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

export interface ChainClient {
  getLatestBlockNumber(): Promise<bigint>;
  /** All Transfer events of `tokenContract` in [fromBlock, toBlock]. */
  getTokenTransfers(tokenContract: string, fromBlock: bigint, toBlock: bigint): Promise<TokenTransfer[]>;
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;
  /** Next nonce for `address` including pending transactions. */
  getPendingNonce(address: string): Promise<bigint>;
  getGasFees(): Promise<GasFees>;
  /**
   * Broadcast a signed raw transaction. MUST be idempotent for a re-send of
   * the same payload: "already known" / "nonce too low" style errors are
   * treated as success (the transaction identity is fixed by the signature).
   */
  sendRawTransaction(rawTx: string): Promise<void>;
}

/** Signs USDT transfers from the hot wallet. Key material never leaves the signer. */
export interface WithdrawalSigner {
  /** Hot wallet address (checksummed). */
  readonly address: string;
  signTokenTransfer(args: {
    tokenContract: string;
    to: string;
    valueUnits: bigint;
    nonce: bigint;
    gas: GasFees;
  }): Promise<{ rawTx: string; txHash: string }>;
}
