import { HDKey } from '@scure/bip32';
import { secp256k1 } from '@noble/curves/secp256k1';
import { getAddress, keccak256 } from 'viem';

/**
 * HD wallet derivation for per-user deposit addresses (Decision 048).
 *
 * Layout: BIP-44 `m/44'/60'/0'/0/{derivation_index}`.
 *
 * The master seed lives ONLY in Google Secret Manager and is loaded by the
 * Cloud Run deposit worker. Address provisioning needs no private keys at
 * all — it derives from the ACCOUNT XPUB (m/44'/60'/0'), so the seed touches
 * memory only where signing/sweeping actually happens. Nothing in this
 * module logs, stringifies, or otherwise persists key material.
 */

const ACCOUNT_PATH = "m/44'/60'/0'";

export class HdDerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HdDerivationError';
  }
}

/** Hex master seed (from Secret Manager) -> bytes. Accepts 32-64 bytes. */
export function parseMasterSeedHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]+$/.test(clean) || clean.length % 2 !== 0) {
    throw new HdDerivationError('Master seed must be a hex string');
  }
  const bytes = Uint8Array.from(clean.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  if (bytes.length < 32 || bytes.length > 64) {
    throw new HdDerivationError(`Master seed must be 32-64 bytes, got ${bytes.length}`);
  }
  return bytes;
}

/** Account-level extended PUBLIC key (m/44'/60'/0') for address provisioning. */
export function deriveAccountXpub(masterSeed: Uint8Array): string {
  const account = HDKey.fromMasterSeed(masterSeed).derive(ACCOUNT_PATH);
  return account.publicExtendedKey;
}

function publicKeyToEvmAddress(compressedPublicKey: Uint8Array): string {
  const uncompressed = secp256k1.ProjectivePoint.fromHex(compressedPublicKey).toRawBytes(false);
  // keccak256 of the 64-byte public key (uncompressed minus the 0x04 prefix)
  const hash = keccak256(uncompressed.slice(1));
  return getAddress(`0x${hash.slice(-40)}`);
}

/** Deposit address for `derivationIndex`, derived from the account xpub only. */
export function deriveDepositAddress(accountXpub: string, derivationIndex: number): string {
  if (!Number.isInteger(derivationIndex) || derivationIndex < 0 || derivationIndex >= 2 ** 31) {
    throw new HdDerivationError(`Invalid derivation index: ${derivationIndex}`);
  }
  const key = HDKey.fromExtendedKey(accountXpub).deriveChild(0).deriveChild(derivationIndex);
  if (!key.publicKey) throw new HdDerivationError('Derivation produced no public key');
  return publicKeyToEvmAddress(key.publicKey);
}

/**
 * Private key for a deposit address (future sweep operations; Cloud Run
 * only). Callers MUST zero the returned bytes after use and never log them.
 */
export function deriveDepositPrivateKey(masterSeed: Uint8Array, derivationIndex: number): Uint8Array {
  if (!Number.isInteger(derivationIndex) || derivationIndex < 0 || derivationIndex >= 2 ** 31) {
    throw new HdDerivationError(`Invalid derivation index: ${derivationIndex}`);
  }
  const key = HDKey.fromMasterSeed(masterSeed).derive(`${ACCOUNT_PATH}/0/${derivationIndex}`);
  if (!key.privateKey) throw new HdDerivationError('Derivation produced no private key');
  return key.privateKey;
}
