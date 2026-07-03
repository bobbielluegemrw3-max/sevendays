import type { SqlClient } from '@sevendays/shared';
import type { ChainConfig } from './config.js';
import { deriveDepositAddress } from './hd.js';

/**
 * Deposit address provisioning (Decision 048): one HD-derived address per
 * (user, chain). Runs in the deposit worker — the API layer only READS
 * deposit_addresses (POST /wallet/deposit returns 'not yet provisioned'
 * until the worker has caught up).
 *
 * Concurrency safety comes from the DB constraints:
 *   uq_deposit_user_chain  — a user gets exactly one address per chain
 *   uq_deposit_derivation  — an index is used at most once per chain
 * A lost race on either constraint is retried / resolved by re-reading.
 */

export interface ProvisionedAddress {
  userId: string;
  address: string;
  derivationIndex: number;
}

/** Returns the user's deposit address, creating it if missing. */
export async function ensureDepositAddress(
  client: SqlClient,
  config: ChainConfig,
  accountXpub: string,
  userId: string,
): Promise<ProvisionedAddress> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await client.query<{ address: string; derivation_index: string }>(
      `select address, derivation_index::text as derivation_index
       from deposit_addresses where user_id = $1 and chain_id = $2`,
      [userId, config.chainId],
    );
    if (existing.rows[0]) {
      return {
        userId,
        address: existing.rows[0].address,
        derivationIndex: Number(existing.rows[0].derivation_index),
      };
    }

    const next = await client.query<{ next_index: string }>(
      `select coalesce(max(derivation_index) + 1, 0)::text as next_index
       from deposit_addresses where chain_id = $1`,
      [config.chainId],
    );
    const derivationIndex = Number(next.rows[0]!.next_index);
    const address = deriveDepositAddress(accountXpub, derivationIndex);

    try {
      await client.query(
        `insert into deposit_addresses (user_id, chain_id, address, derivation_index)
         values ($1, $2, $3, $4)`,
        [userId, config.chainId, address, derivationIndex],
      );
      return { userId, address, derivationIndex };
    } catch (error) {
      const message = (error as Error).message;
      // Another worker won the race: either this user now has an address
      // (uq_deposit_user_chain) or the index was taken (uq_deposit_derivation).
      // Both resolve by looping: re-read, or re-allocate a fresh index.
      if (!/uq_deposit_user_chain|uq_deposit_derivation|duplicate key/i.test(message)) throw error;
    }
  }
  throw new Error(`Deposit address provisioning kept losing races for user ${userId}`);
}

/** Provisions addresses for every user that does not have one yet. */
export async function provisionMissingDepositAddresses(
  client: SqlClient,
  config: ChainConfig,
  accountXpub: string,
): Promise<ProvisionedAddress[]> {
  const missing = await client.query<{ id: string }>(
    `select u.id from users u
     left join deposit_addresses d on d.user_id = u.id and d.chain_id = $1
     where d.id is null
     order by u.created_at`,
    [config.chainId],
  );
  const provisioned: ProvisionedAddress[] = [];
  for (const row of missing.rows) {
    provisioned.push(await ensureDepositAddress(client, config, accountXpub, row.id));
  }
  return provisioned;
}
