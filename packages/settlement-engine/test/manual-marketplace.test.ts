import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import { createParticipantSnapshots, reopenMarketplace } from '../src/index.js';
import { manualMarketTiebreakScore } from '../src/assignment/tiebreak.js';

/**
 * Manual Marketplace (Decision 076): Market Lock excludes manually listed
 * horses from race snapshots; unlist requests are honored only after the
 * batch (reopenMarketplace cancels flagged listings).
 */

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  return r.rows[0]!.id;
}

async function newHorse(ownerId: string, day: number): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, $3, 'BALANCED', 'COMMON', $4, 0.5, 'horse_generation_v1.0', $5, $6)
     returning id`,
    [
      ownerId,
      day,
      `Lock Test ${randomUUID().slice(0, 14)}`,
      randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
      JSON.stringify({ speed: 75, power: 74, stamina: 73, recovery: 72, luck: 71 }),
    ],
  );
  return r.rows[0]!.id;
}

async function listManually(horseId: string, sellerId: string, day: number): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into market_listings (horse_id, seller_user_id, listing_price, current_day,
                                  batch_run_id, deterministic_market_tiebreak_score, source)
     values ($1, $2, 121.00, $3, null, $4, 'MANUAL') returning id`,
    [horseId, sellerId, day, manualMarketTiebreakScore(horseId, '2033-05-01T00:00:00Z')],
  );
  return r.rows[0]!.id;
}

describe('market lock and deferred unlist', () => {
  it('a manually listed horse is excluded from the snapshot; unlist lands after the batch', async () => {
    // isolate from other suites' leftovers
    await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);

    const owner = await newUser();
    const racing = await newHorse(owner, 2);
    const locked = await newHorse(owner, 2);
    const listingId = await listManually(locked, owner, 2);

    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version)
       values ('2033-05-01', 'batch_v1.0') returning id`,
    );
    const raceSeed = 'race-seed-manual-marketplace';
    const commit = await client.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [randomUUID(), sha256(raceSeed)],
    );
    const race = await client.query<{ id: string }>(
      `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
       values ($1, 'race_engine_v1.0', $2, 'SEED_COMMITTED') returning id`,
      [batch.rows[0]!.id, commit.rows[0]!.id],
    );

    const created = await createParticipantSnapshots(client, {
      raceId: race.rows[0]!.id,
      raceSeed,
      raceEngineVersion: 'race_engine_v1.0',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: '2033-05-01',
    });
    expect(created).toBe(1); // only the unlisted horse races

    const snapshots = await client.query<{ horse_id: string }>(
      `select horse_id from race_participant_snapshots where race_id = $1`,
      [race.rows[0]!.id],
    );
    expect(snapshots.rows.map((r) => r.horse_id)).toEqual([racing]);

    // Unlist request: still LISTED through the batch, cancelled at reopen.
    await client.query(`update market_listings set cancel_after_batch = true where id = $1`, [listingId]);
    await reopenMarketplace(client, batch.rows[0]!.id);
    const after = await client.query<{ status: string }>(
      `select status::text as status from market_listings where id = $1`,
      [listingId],
    );
    expect(after.rows[0]!.status).toBe('CANCELLED');

    // The horse itself never changed: still ACTIVE, day frozen at 2.
    const horse = await client.query<{ status: string; current_day: number }>(
      `select status::text as status, current_day from horses where id = $1`,
      [locked],
    );
    expect(horse.rows[0]!.status).toBe('ACTIVE');
    expect(horse.rows[0]!.current_day).toBe(2);
  });
});
