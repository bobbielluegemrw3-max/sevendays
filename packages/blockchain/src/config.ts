import { DEPOSIT_CONFIRMATION_BLOCKS } from '@sevendays/domain';

/**
 * Chain configuration (07_API.md Deposit / Withdrawal v1.0).
 *
 * v1.0 is Polygon PoS USDT only. The owner may switch to BSC USDT before
 * launch (Decision pending): switching = supplying a different ChainConfig —
 * no code change. Multi-chain at the same time is out of scope.
 */
export interface ChainConfig {
  /** Matches blockchain_deposits.chain_id / blockchain_withdrawals.chain_id. */
  chainId: string;
  /** EIP-155 numeric chain id used in transaction signing. */
  numericChainId: number;
  /** USDT ERC-20 contract address. */
  tokenContract: string;
  /** On-chain token decimals (Polygon PoS USDT = 6). */
  tokenDecimals: number;
  /** Blocks required before a deposit is credited (spec: 128). */
  confirmationBlocks: number;
  /** ERC-20 transfer gas limit. */
  transferGasLimit: bigint;
}

/** Polygon PoS mainnet USDT (spec default). */
export const POLYGON_POS_USDT: ChainConfig = {
  chainId: 'POLYGON_POS',
  numericChainId: 137,
  tokenContract: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
  tokenDecimals: 6,
  confirmationBlocks: DEPOSIT_CONFIRMATION_BLOCKS,
  transferGasLimit: 100_000n,
};

/**
 * Polygon Amoy testnet skeleton for pre-launch verification. There is no
 * canonical USDT on Amoy — the test token contract must be supplied.
 */
export function amoyTestConfig(tokenContract: string, tokenDecimals: number): ChainConfig {
  return {
    chainId: 'POLYGON_AMOY',
    numericChainId: 80002,
    tokenContract,
    tokenDecimals,
    confirmationBlocks: DEPOSIT_CONFIRMATION_BLOCKS,
    transferGasLimit: 100_000n,
  };
}
