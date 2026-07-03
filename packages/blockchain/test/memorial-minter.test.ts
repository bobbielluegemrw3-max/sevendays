import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import {
  POLYGON_POS_USDT,
  memorialTokenId,
  processMemorialMints,
  type MemorialMintRequest,
  type NftMinter,
} from '../src/index.js';

const CUSTODY = '0x5555555555555555555555555555555555555555';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

/** Contract-faithful fake: same tokenId can only ever mint once; a re-mint
 *  resolves to the ORIGINAL transaction (Decision 063 implementation note). */
class FakeMinter implements NftMinter {
  readonly contractAddress = '0x6666666666666666666666666666666666666666';
  readonly mintsByTokenId = new Map<string, { txHash: string; request: MemorialMintRequest }>();
  freshMints = 0;

  async mintMemorial(request: MemorialMintRequest): Promise<{ txHash: string }> {
    const existing = this.mintsByTokenId.get(request.tokenId);
    if (existing) return { txHash: existing.txHash };
    this.freshMints += 1;
    const txHash = `0x${this.freshMints.toString(16).padStart(64, '0')}`;
    this.mintsByTokenId.set(request.tokenId, { txHash, request });
    return { txHash };
  }
}

async function newMemorial(): Promise<string> {
  const userId = (
    await client.query<{ id: string }>(`insert into users (email) values ($1) returning id`, [
      `${randomUUID()}@test.dev`,
    ])
  ).rows[0]!.id;
  const horseId = (
    await client.query<{ id: string }>(
      `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json, status)
       values ($1, 7, $2, 'BALANCED', 'COMMON', $3, 0.50, 'horse_generation_v1.0', $4, $5, 'MEMORIALIZED')
       returning id`,
      [
        userId,
        `Memorial Test ${randomUUID().slice(0, 12)}`,
        randomUUID().replaceAll('-', ''),
        randomUUID().replaceAll('-', ''),
        JSON.stringify({ speed: 75, power: 75, stamina: 75, recovery: 75, luck: 75 }),
      ],
    )
  ).rows[0]!.id;
  const scheduleId = (
    await client.query<{ id: string }>(
      `insert into buyback_schedules (horse_id, user_id, status, total_amount, payment_count, day7_clear_date)
       values ($1, $2, 'COMPLETED', 200, 7, '2030-06-01') returning id`,
      [horseId, userId],
    )
  ).rows[0]!.id;
  return (
    await client.query<{ id: string }>(
      `insert into memorial_nfts (horse_id, user_id, buyback_schedule_id, metadata_json)
       values ($1, $2, $3, $4) returning id`,
      [
        horseId,
        userId,
        scheduleId,
        JSON.stringify({ version: 'memorial_v1.0', horse_uuid: horseId, achievement: 'DAY7_CLEAR' }),
      ],
    )
  ).rows[0]!.id;
}

describe('memorialTokenId', () => {
  it('derives a deterministic uint256 from the memorial UUID', () => {
    expect(memorialTokenId('00000000-0000-0000-0000-000000000001')).toBe('1');
    expect(memorialTokenId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(
      (2n ** 128n - 1n).toString(),
    );
    expect(() => memorialTokenId('not-a-uuid')).toThrow();
  });
});

describe('memorial mint pipeline', () => {
  it('mints pending memorials exactly once and freezes the mint record', async () => {
    const memorialId = await newMemorial();
    const minter = new FakeMinter();

    const first = await processMemorialMints(client, minter, POLYGON_POS_USDT, {
      custodyAddress: CUSTODY,
    });
    expect(first.minted).toBe(1);
    expect(minter.freshMints).toBe(1);
    expect(minter.mintsByTokenId.get(memorialTokenId(memorialId))!.request.to).toBe(CUSTODY);

    const row = await client.query<{
      chain_id: string;
      token_contract: string;
      token_id: string;
      mint_tx_hash: string;
    }>(
      `select chain_id, token_contract, token_id, mint_tx_hash from memorial_nfts where id = $1`,
      [memorialId],
    );
    expect(row.rows[0]).toMatchObject({
      chain_id: 'POLYGON_POS',
      token_contract: minter.contractAddress,
      token_id: memorialTokenId(memorialId),
    });

    // Idempotent: nothing left to mint.
    const second = await processMemorialMints(client, minter, POLYGON_POS_USDT, {
      custodyAddress: CUSTODY,
    });
    expect(second.minted).toBe(0);
    expect(minter.freshMints).toBe(1);

    // The mint record is frozen by the DB once written.
    await expect(
      client.query(`update memorial_nfts set mint_tx_hash = '0xdead' where id = $1`, [memorialId]),
    ).rejects.toThrow(/MEMORIAL_MINT_FINAL/);
  });

  it('crash between mint and DB update completes with the ORIGINAL transaction', async () => {
    const memorialId = await newMemorial();
    const minter = new FakeMinter();

    // Simulate the crash: the previous run minted on chain but died before
    // updating the row.
    const orphan = await minter.mintMemorial({
      memorialId,
      to: CUSTODY,
      tokenId: memorialTokenId(memorialId),
      metadata: {},
    });

    const run = await processMemorialMints(client, minter, POLYGON_POS_USDT, {
      custodyAddress: CUSTODY,
    });
    expect(run.minted).toBe(1);
    expect(minter.freshMints).toBe(1); // no second token

    const row = await client.query<{ mint_tx_hash: string }>(
      `select mint_tx_hash from memorial_nfts where id = $1`,
      [memorialId],
    );
    expect(row.rows[0]!.mint_tx_hash).toBe(orphan.txHash); // original tx recorded
  });
});
