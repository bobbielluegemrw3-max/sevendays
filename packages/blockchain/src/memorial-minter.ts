import type { SqlClient } from '@sevendays/shared';
import type { ChainConfig } from './config.js';

/**
 * Memorial NFT on-chain mint pipeline (Decision 063: Polygon PoS, ERC-721,
 * mint only after all seven buyback payments — the settlement engine's
 * createMemorialNfts records that; this worker mints whatever is recorded
 * but not yet on chain).
 *
 * Idempotency: the ERC-721 token id is derived deterministically from the
 * memorial UUID, and the contract MUST reject minting an existing id. A
 * crash between the mint transaction and the DB update therefore cannot
 * create a second token — the re-run's mintMemorial() resolves to the
 * original mint (the NftMinter implementation looks up the existing token)
 * and the row is completed with the original transaction. Once mint fields
 * are set they are frozen by the DB (MEMORIAL_MINT_FINAL trigger).
 *
 * Transferability (Decision 063): the token is a standard transferable
 * ERC-721; nothing in the game ever reads transfers back — it is purely
 * commemorative.
 */

export interface MemorialMintRequest {
  memorialId: string;
  /** Custody wallet that receives the mint (user withdrawal of the NFT is an ops flow). */
  to: string;
  /** Deterministic ERC-721 token id (decimal string) — see memorialTokenId. */
  tokenId: string;
  metadata: Record<string, unknown>;
}

export interface NftMinter {
  readonly contractAddress: string;
  /**
   * Mint `tokenId` to `to`. MUST be idempotent for an already-minted id:
   * resolve and return the ORIGINAL mint transaction instead of reverting.
   */
  mintMemorial(request: MemorialMintRequest): Promise<{ txHash: string }>;
}

/** uint256 token id = the memorial UUID's 128 bits (deterministic, unique). */
export function memorialTokenId(memorialId: string): string {
  const hex = memorialId.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`Invalid memorial UUID: ${memorialId}`);
  return BigInt(`0x${hex}`).toString();
}

export interface MemorialMintRunResult {
  minted: number;
}

/** One mint pass: mint every memorial not yet on chain. */
export async function processMemorialMints(
  client: SqlClient,
  minter: NftMinter,
  config: ChainConfig,
  options: { custodyAddress: string; maxPerRun?: number },
): Promise<MemorialMintRunResult> {
  const pending = await client.query<{ id: string; metadata_json: Record<string, unknown> }>(
    `select id, metadata_json from memorial_nfts
     where mint_tx_hash is null
     order by created_at, id
     limit $1`,
    [options.maxPerRun ?? 20],
  );

  let minted = 0;
  for (const row of pending.rows) {
    const tokenId = memorialTokenId(row.id);
    const result = await minter.mintMemorial({
      memorialId: row.id,
      to: options.custodyAddress,
      tokenId,
      metadata: row.metadata_json,
    });
    await client.query(
      `update memorial_nfts
       set chain_id = $2, token_contract = $3, token_id = $4, mint_tx_hash = $5, minted_at = now()
       where id = $1 and mint_tx_hash is null`,
      [row.id, config.chainId, minter.contractAddress, tokenId, result.txHash],
    );
    minted += 1;
  }
  return { minted };
}
