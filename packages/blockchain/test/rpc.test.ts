import { describe, expect, it } from 'vitest';
import { decodeFunctionData, erc20Abi, keccak256, parseTransaction } from 'viem';
import { POLYGON_POS_USDT, createViemWithdrawalSigner } from '../src/index.js';

// Throwaway test key (never used anywhere real).
const TEST_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001';

describe('createViemWithdrawalSigner', () => {
  it('signs a valid EIP-1559 USDT transfer with a matching tx hash', async () => {
    const signer = createViemWithdrawalSigner(TEST_PRIVATE_KEY, POLYGON_POS_USDT);
    const to = '0x4444444444444444444444444444444444444444';

    const { rawTx, txHash } = await signer.signTokenTransfer({
      tokenContract: POLYGON_POS_USDT.tokenContract,
      to,
      valueUnits: 99_000_000n,
      nonce: 7n,
      gas: { maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n },
    });

    expect(txHash).toBe(keccak256(rawTx as `0x${string}`));

    const parsed = parseTransaction(rawTx as `0x${string}`);
    expect(parsed.type).toBe('eip1559');
    expect(parsed.chainId).toBe(137);
    expect(parsed.to?.toLowerCase()).toBe(POLYGON_POS_USDT.tokenContract.toLowerCase());
    expect(parsed.nonce).toBe(7);
    expect(parsed.value ?? 0n).toBe(0n); // zero value is omitted in serialization

    const call = decodeFunctionData({ abi: erc20Abi, data: parsed.data! });
    expect(call.functionName).toBe('transfer');
    expect((call.args[0] as string).toLowerCase()).toBe(to.toLowerCase());
    expect(call.args[1]).toBe(99_000_000n);
  });

  it('signing is deterministic: same inputs, same raw tx, same hash', async () => {
    const signer = createViemWithdrawalSigner(TEST_PRIVATE_KEY, POLYGON_POS_USDT);
    const args = {
      tokenContract: POLYGON_POS_USDT.tokenContract,
      to: '0x4444444444444444444444444444444444444444',
      valueUnits: 1n,
      nonce: 0n,
      gas: { maxFeePerGas: 1n, maxPriorityFeePerGas: 1n },
    };
    const first = await signer.signTokenTransfer(args);
    const second = await signer.signTokenTransfer(args);
    expect(second).toEqual(first);
  });
});
