import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { ChainClient, TransactionStatus, WithdrawalSigner } from './types.js';
import type { ChainConfig } from './config.js';
import type { NftMinter } from './memorial-minter.js';

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

export interface ViemChainClientOptions {
  /**
   * Provider-imposed max block range for eth_getLogs; requests are chunked
   * to this size (QuickNode Discover: 5, paid plans: 10k+).
   */
  getLogsRangeLimit?: bigint;
}

export function createViemChainClient(rpcUrl: string, options: ViemChainClientOptions = {}): ChainClient {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const rangeLimit = options.getLogsRangeLimit ?? 2000n;

  return {
    async getLatestBlockNumber(): Promise<bigint> {
      return client.getBlockNumber();
    },

    async getTokenTransfers(tokenContract, fromBlock, toBlock) {
      const transfers = [];
      for (let start = fromBlock; start <= toBlock; start += rangeLimit) {
        const end = start + rangeLimit - 1n > toBlock ? toBlock : start + rangeLimit - 1n;
        const logs = await client.getLogs({
          address: tokenContract as `0x${string}`,
          event: TRANSFER_EVENT,
          fromBlock: start,
          toBlock: end,
        });
        for (const log of logs) {
          if (!log.transactionHash || log.blockNumber === null) continue;
          transfers.push({
            txHash: log.transactionHash,
            logIndex: log.logIndex ?? 0,
            from: log.args.from as string,
            to: log.args.to as string,
            valueUnits: log.args.value as bigint,
            blockNumber: log.blockNumber,
          });
        }
      }
      return transfers;
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

const MEMORIAL_ABI = parseAbi([
  'function mint(address to, uint256 tokenId)',
  'function exists(uint256 tokenId) view returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
]);

/**
 * viem NftMinter for the SevenDaysMemorial ERC-721 (Decision 063). The
 * contract REVERTS on minting an existing token id; this implementation
 * resolves an already-minted id to its ORIGINAL mint transaction (bounded
 * backward log scan), which makes processMemorialMints crash-safe: a
 * re-run after "minted on chain but DB update lost" completes the row with
 * the original transaction instead of failing forever.
 */
export function createViemNftMinter(args: {
  rpcUrl: string;
  privateKeyHex: string;
  contractAddress: string;
  /** Lower bound for the already-minted log scan (contract deploy block). */
  deployedAtBlock?: bigint;
  /** Provider getLogs range limit (see ViemChainClientOptions). */
  getLogsRangeLimit?: bigint;
}): NftMinter {
  const account = privateKeyToAccount(
    (args.privateKeyHex.startsWith('0x') ? args.privateKeyHex : `0x${args.privateKeyHex}`) as `0x${string}`,
  );
  const publicClient = createPublicClient({ transport: http(args.rpcUrl) });
  const walletClient = createWalletClient({ account, transport: http(args.rpcUrl) });
  const contract = args.contractAddress as `0x${string}`;
  const floor = args.deployedAtBlock ?? 0n;

  async function findOriginalMintTx(tokenId: bigint): Promise<string> {
    const latest = await publicClient.getBlockNumber();
    const window = (args.getLogsRangeLimit ?? 2000n) - 1n;
    for (let to = latest; to >= floor; to = to - window - 1n) {
      const from = to > floor + window ? to - window : floor;
      const logs = await publicClient.getLogs({
        address: contract,
        event: MEMORIAL_ABI[2],
        args: { from: '0x0000000000000000000000000000000000000000', tokenId },
        fromBlock: from,
        toBlock: to,
      });
      if (logs[0]?.transactionHash) return logs[0].transactionHash;
      if (from === floor) break;
    }
    throw new Error(`Memorial token ${tokenId} exists but its mint log was not found`);
  }

  return {
    contractAddress: args.contractAddress,

    async mintMemorial(request) {
      const tokenId = BigInt(request.tokenId);
      const alreadyMinted = await publicClient.readContract({
        address: contract,
        abi: MEMORIAL_ABI,
        functionName: 'exists',
        args: [tokenId],
      });
      if (alreadyMinted) {
        return { txHash: await findOriginalMintTx(tokenId) };
      }
      const chainId = await publicClient.getChainId();
      const hash = await walletClient.writeContract({
        chain: null,
        address: contract,
        abi: MEMORIAL_ABI,
        functionName: 'mint',
        args: [request.to as `0x${string}`, tokenId],
        account,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error(`Memorial mint reverted (chain ${chainId}, tx ${hash})`);
      }
      return { txHash: hash };
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
