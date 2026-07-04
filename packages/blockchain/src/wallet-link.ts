import { isAddress, verifyMessage } from 'viem';

/**
 * Wallet linking verification (Decision 072). The client asks MetaMask to
 * personal_sign a message binding the wallet to the LOGGED-IN game user
 * with a freshness timestamp; the server accepts only a well-formed,
 * fresh message whose signature recovers to the claimed address.
 */

export const WALLET_LINK_STATEMENT = 'Seven Days Derby wallet link';
export const WALLET_LINK_MAX_AGE_MS = 10 * 60_000;

export function buildWalletLinkMessage(userId: string, issuedAtIso: string): string {
  return `${WALLET_LINK_STATEMENT}\nuser:${userId}\nissued:${issuedAtIso}`;
}

export type WalletLinkFailure =
  | 'MALFORMED_MESSAGE'
  | 'WRONG_USER'
  | 'EXPIRED'
  | 'BAD_ADDRESS'
  | 'BAD_SIGNATURE';

export async function verifyWalletLink(args: {
  userId: string;
  address: string;
  message: string;
  signature: string;
  now?: Date;
}): Promise<{ ok: true; address: string } | { ok: false; reason: WalletLinkFailure }> {
  if (!isAddress(args.address)) return { ok: false, reason: 'BAD_ADDRESS' };

  const match = new RegExp(
    `^${WALLET_LINK_STATEMENT}\\nuser:([0-9a-f-]{36})\\nissued:(.+)$`,
  ).exec(args.message);
  if (!match) return { ok: false, reason: 'MALFORMED_MESSAGE' };
  if (match[1] !== args.userId) return { ok: false, reason: 'WRONG_USER' };

  const issuedAt = Date.parse(match[2]!);
  const now = (args.now ?? new Date()).getTime();
  if (!Number.isFinite(issuedAt) || Math.abs(now - issuedAt) > WALLET_LINK_MAX_AGE_MS) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const valid = await verifyMessage({
    address: args.address,
    message: args.message,
    signature: args.signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) return { ok: false, reason: 'BAD_SIGNATURE' };

  return { ok: true, address: args.address.toLowerCase() };
}
