import {
  createPublicClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  parseAbiItem,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { ChainClient, TransactionStatus, WithdrawalSigner } from './types.js';
import type { ChainConfig } from './config.js';

/**
 * viem-backed production implementations of ChainClient / WithdrawalSigner.
 *
 * These run ONLY inside Cloud Run workers. The RPC URL and the hot wallet
 * private key come from Google Secret Manager. Nothing here logs addresses'
 * keys or raw secrets.
 *
 * NOTE (pre-launch): exercised by unit tests for signing/encoding, but the
 * live-RPC paths still need Polygon Amoy verification once the owner picks
 * an RPC provider.
 */

const TRANSFER_EVENT = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

/** Errors that mean "this exact transaction is already on its way" — a
 *  re-send of the same signed bytes must be treated as success. */
const IDEMPOTENT_SEND_ERRORS = /already known|already exists|nonce too low|same hash was already imported/i;

export function createViemChainClient(rpcUrl: string): ChainClient {
  const client = createPublicClient({ transport: http(rpcUrl) });

  return {
    async getLatestBlockNumber(): Promise<bigint> {
      return client.getBlockNumber();
    },

    async getTokenTransfers(tokenContract, fromBlock, toBlock) {
      const logs = await client.getLogs({
        address: tokenContract as `0x${string}`,
        event: TRANSFER_EVENT,
        fromBlock,
        toBlock,
      });
      return logs
        .filter((log) => log.transactionHash && log.blockNumber !== null)
        .map((log) => ({
          txHash: log.transactionHash,
          logIndex: log.logIndex ?? 0,
          from: log.args.from as string,
          to: log.args.to as string,
          valueUnits: log.args.value as bigint,
          blockNumber: log.blockNumber,
        }));
    },

    async getTransactionStatus(txHash): Promise<TransactionStatus> {
      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
        return receipt.status === 'success'
          ? { kind: 'SUCCESS', blockNumber: receipt.blockNumber }
          : { kind: 'REVERTED', blockNumber: receipt.blockNumber };
      } catch {
        // No receipt: distinguish mempool-pending from unknown.
        try {
          const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
          return tx ? { kind: 'PENDING' } : { kind: 'NOT_FOUND' };
        } catch {
          return { kind: 'NOT_FOUND' };
        }
      }
    },

    async getPendingNonce(address): Promise<bigint> {
      const count = await client.getTransactionCount({
        address: address as `0x${string}`,
        blockTag: 'pending',
      });
      return BigInt(count);
    },

    async getGasFees() {
      const fees = await client.estimateFeesPerGas();
      return {
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      };
    },

    async sendRawTransaction(rawTx): Promise<void> {
      try {
        await client.sendRawTransaction({ serializedTransaction: rawTx as `0x${string}` });
      } catch (error) {
        if (IDEMPOTENT_SEND_ERRORS.test((error as Error).message)) return;
        throw error;
      }
    },
  };
}

/** Hot wallet signer from a raw private key (Secret Manager only). */
export function createViemWithdrawalSigner(privateKeyHex: string, config: ChainConfig): WithdrawalSigner {
  const normalized = (privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`) as `0x${string}`;
  const account = privateKeyToAccount(normalized);

  return {
    address: account.address,

    async signTokenTransfer({ tokenContract, to, valueUnits, nonce, gas }) {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [to as `0x${string}`, valueUnits],
      });
      const rawTx = await account.signTransaction({
        type: 'eip1559',
        chainId: config.numericChainId,
        to: tokenContract as `0x${string}`,
        value: 0n,
        data,
        nonce: Number(nonce),
        gas: config.transferGasLimit,
        maxFeePerGas: gas.maxFeePerGas,
        maxPriorityFeePerGas: gas.maxPriorityFeePerGas,
      });
      return { rawTx, txHash: keccak256(rawTx) };
    },
  };
}
