import { describe, expect, it } from 'vitest';
import {
  deriveAccountXpub,
  deriveDepositAddress,
  deriveDepositPrivateKey,
  parseMasterSeedHex,
} from '../src/index.js';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * BIP-39 seed of the standard test mnemonic
 * "abandon abandon abandon abandon abandon abandon abandon abandon abandon
 *  abandon abandon about" (empty passphrase). The expected addresses for
 * m/44'/60'/0'/0/{i} are the widely published Ethereum test vectors.
 */
const TEST_SEED_HEX =
  '5eb00bbddcf069084889a8ab9155568165f5c453ccb85e70811aaed6f6da5fc19a5ac40b389cd370d086206dec8aa6c43daea6690f20ad3d8d48b2d2ce9e38e4';

const EXPECTED_ADDRESS_0 = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
const EXPECTED_ADDRESS_1 = '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0';

describe('parseMasterSeedHex', () => {
  it('parses 64-byte hex seeds with or without 0x', () => {
    expect(parseMasterSeedHex(TEST_SEED_HEX)).toHaveLength(64);
    expect(parseMasterSeedHex(`0x${TEST_SEED_HEX}`)).toHaveLength(64);
  });

  it('rejects invalid material', () => {
    expect(() => parseMasterSeedHex('zz')).toThrow();
    expect(() => parseMasterSeedHex('abcd')).toThrow(); // too short
  });
});

describe('deriveDepositAddress', () => {
  const seed = parseMasterSeedHex(TEST_SEED_HEX);
  const xpub = deriveAccountXpub(seed);

  it('matches the standard BIP-44 Ethereum test vectors', () => {
    expect(deriveDepositAddress(xpub, 0)).toBe(EXPECTED_ADDRESS_0);
    expect(deriveDepositAddress(xpub, 1)).toBe(EXPECTED_ADDRESS_1);
  });

  it('xpub-only derivation agrees with private-key derivation for many indices', () => {
    for (const index of [0, 1, 2, 7, 100, 2 ** 20]) {
      const priv = deriveDepositPrivateKey(seed, index);
      const hex = `0x${Buffer.from(priv).toString('hex')}` as const;
      expect(deriveDepositAddress(xpub, index)).toBe(privateKeyToAccount(hex).address);
    }
  });

  it('rejects invalid indices', () => {
    expect(() => deriveDepositAddress(xpub, -1)).toThrow();
    expect(() => deriveDepositAddress(xpub, 1.5)).toThrow();
    expect(() => deriveDepositAddress(xpub, 2 ** 31)).toThrow();
  });
});
