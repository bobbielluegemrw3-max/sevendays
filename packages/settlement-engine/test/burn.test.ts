import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  purchaseFundLock,
  day0MintSettlement,
  reserveAllocation,
  ensureUserAccounts,
  getBalance,
} from '@sevendays/ledger';
import { rollBuffRarity } from '@sevendays/race-engine';
import {
  createParticipantSnapshots,
  runRaceScores,
  finalizeAndBurn,
} from '../src/index.js';

let client: SqlClient;

const VERSION = 'race_engine_v1.0';

beforeAll(async () => {
  client = await createTestDb();
  // Fund the MLM reserve: 4 full Day0 mint flows -> 4 x 5.40 = 21.60 USDT.
  for (let i = 0; i < 4; i += 1) {
    const buyer = await newUser();
    await depositConfirmation(client, {
      userId: buyer,
      amount: Money.of('102'), // Decision 069: mint charge = 100 + 2 fee
      idempotencyKey: randomUUID(),
    });
    await purchaseFundLock(client, {
      userId: buyer,
      amount: Money.of('102'),
      idempotencyKey: randomUUID(),
    });
    await day0MintSettlement(client, { buyerUserId: buyer, idempotencyKey: randomUUID() });
    await reserveAllocation(client, { idempotencyKey: randomUUID() });
  }
});

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

async function newUser(referrerId?: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email, direct_referrer_user_id) values ($1, $2) returning id`,
    [`${randomUUID()}@test.dev`, referrerId ?? null],
  );
  return r.rows[0]!.id;
}

async function newHorse(ownerId: string, typeIndex: number): Promise<string> {
  const types = ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'];
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, $3::horse_type, 'COMMON', $4, 1.00, 'horse_generation_v1.0', $5, $6)
     returning id`,
    [
      ownerId,
      `Burn Test ${randomUUID().slice(0, 13)}`,
      types[typeIndex % types.length],
      randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
      JSON.stringify({ speed: 70 + (typeIndex % 20), power: 72, stamina: 75, recovery: 74, luck: 68 }),
    ],
  );
  return r.rows[0]!.id;
}

interface RaceSetup {
  raceId: string;
  raceSeed: string;
  batchDate: string;
  horses: string[];
  owners: string[];
}

let raceDateCounter = 0;

/**
 * Build a race: n horses (fresh owners), commit the seed, snapshot, score.
 * createParticipantSnapshots covers ALL currently-ACTIVE horses (Decision
 * 038), so we retire leftovers from earlier tests first to keep each
 * cohort isolated and burn counts predictable.
 */
async function buildScoredRace(n: number, referrerFor: (i: number) => string | undefined): Promise<RaceSetup> {
  await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
  raceDateCounter += 1;
  const batchDate = `2033-01-${String(raceDateCounter).padStart(2, '0')}`;
  const batch = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
    [batchDate],
  );
  const raceSeed = `race-seed-${batchDate}`;
  const commit = await client.query<{ id: string }>(
    `insert into randomness_commits (reference_type, reference_id, commit_hash)
     values ('RACE', $1, $2) returning id`,
    [randomUUID(), sha256(raceSeed)],
  );
  const race = await client.query<{ id: string }>(
    `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
     values ($1, $2, $3, 'SEED_COMMITTED') returning id`,
    [batch.rows[0]!.id, VERSION, commit.rows[0]!.id],
  );
  const raceId = race.rows[0]!.id;

  const owners: string[] = [];
  const horses: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const owner = await newUser(referrerFor(i));
    owners.push(owner);
    horses.push(await newHorse(owner, i));
  }

  await createParticipantSnapshots(client, {
    raceId,
    raceSeed,
    raceEngineVersion: VERSION,
    liquidityPolicyVersion: 'liquidity_policy_v1.0',
    priceTableVersion: 'price_table_v1.0',
    batchDate,
  });
  await runRaceScores(client, { raceId, raceSeed, raceEngineVersion: VERSION });
  return { raceId, raceSeed, batchDate, horses, owners };
}

describe('snapshot -> score -> finalize -> burn pipeline', () => {
  it('runs the full deterministic pipeline with WATCH burn rate (25 horses -> 2 burns)', async () => {
    const refA = await newUser(); // ACTIVE referrer for every owner
    const setup = await buildScoredRace(25, () => refA);

    const result = await finalizeAndBurn(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      economyStatus: 'WATCH', // 10.4% -> floor(25 * 0.104) = 2
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      buffPolicyVersion: 'buff_policy_v1.0',
    });

    expect(result.participantCount).toBe(25);
    expect(result.burnTargetCount).toBe(2);
    expect(result.burnedHorseIds).toHaveLength(2);

    // results: 25 rows, unique ranks, burned flags on the bottom 2 ranks
    const results = await client.query<{ horse_id: string; final_rank: number; is_burned: boolean }>(
      `select horse_id, final_rank, is_burned from race_results where race_id = $1 order by final_rank`,
      [setup.raceId],
    );
    expect(results.rows).toHaveLength(25);
    expect(results.rows.filter((r) => r.is_burned).map((r) => r.final_rank)).toEqual([24, 25]);

    // burned horses: status BURNED, current_day unchanged (0)
    for (const horseId of result.burnedHorseIds) {
      const h = await client.query<{ status: string; current_day: number }>(
        `select status::text as status, current_day from horses where id = $1`,
        [horseId],
      );
      expect(h.rows[0]!.status).toBe('BURNED');
      expect(h.rows[0]!.current_day).toBe(0);
    }

    // buffs: one ACTIVE buff per burned owner; rarity matches the deterministic roll
    for (const horseId of result.burnedHorseIds) {
      const burn = await client.query<{ owner: string; burn_event_id: string }>(
        `select owner_user_id_at_snapshot as owner, burn_event_id from horse_burns where horse_id = $1`,
        [horseId],
      );
      const { owner, burn_event_id } = burn.rows[0]!;
      const expected = rollBuffRarity({
        raceSeed: setup.raceSeed,
        horseUuid: horseId,
        ownerUserIdAtSnapshot: owner,
        burnEventId: burn_event_id,
        buffPolicyVersion: 'buff_policy_v1.0',
      });
      const buff = await client.query<{ buff_rarity: string; buff_bonus_score: string }>(
        `select buff_rarity::text as buff_rarity, buff_bonus_score::text as buff_bonus_score
         from revenge_buffs where user_id = $1 and status = 'ACTIVE'`,
        [owner],
      );
      expect(buff.rows).toHaveLength(1);
      expect(buff.rows[0]!.buff_rarity).toBe(expected.rarity);
      expect(Number(buff.rows[0]!.buff_bonus_score)).toBe(expected.bonusScore);
    }

    // MLM: every burned owner has ACTIVE referrer refA -> 2 payments of 10
    expect(result.mlmPaymentsMade).toBe(2);
    const refAccounts = await ensureUserAccounts(client, refA);
    expect(await getBalance(client, refAccounts.available)).toBe('20.00000000');

    // idempotency: re-running changes nothing financially
    const rerun = await finalizeAndBurn(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      economyStatus: 'WATCH',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      buffPolicyVersion: 'buff_policy_v1.0',
    });
    expect(rerun.burnedHorseIds.sort()).toEqual(result.burnedHorseIds.sort());
    expect(rerun.mlmPaymentsMade).toBe(0); // ledger idempotency absorbed the replay
    expect(await getBalance(client, refAccounts.available)).toBe('20.00000000');
    const buffCount = await client.query<{ count: string }>(
      `select count(*)::text as count from revenge_buffs`,
    );
    // no duplicates: still one buff per burned owner (2) — plus none extra
    expect(Number(buffCount.rows[0]!.count)).toBe(2);
  });

  it('no MLM for BANNED referrers; existing buff is refreshed, not duplicated', async () => {
    const refB = await newUser();
    const setup = await buildScoredRace(10, () => refB); // NORMAL: floor(10*0.1)=1 burn
    await client.query(`update users set status = 'BANNED' where id = $1`, [refB]);

    // pre-seed an ACTIVE buff for every owner so the burn refreshes instead of creating
    for (const owner of setup.owners) {
      await client.query(
        `insert into revenge_buffs (user_id, buff_rarity, buff_bonus_score, buff_policy_version, deterministic_buff_roll)
         values ($1, 'N', 4, 'buff_policy_v1.0', 'seed-roll')`,
        [owner],
      );
    }

    const refBAccounts = await ensureUserAccounts(client, refB);
    const before = await getBalance(client, refBAccounts.available);

    const result = await finalizeAndBurn(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      buffPolicyVersion: 'buff_policy_v1.0',
    });

    expect(result.burnTargetCount).toBe(1);
    expect(result.mlmPaymentsMade).toBe(0); // BANNED referrer receives nothing
    expect(await getBalance(client, refBAccounts.available)).toBe(before);
    expect(result.buffsGenerated).toBe(0);
    expect(result.buffsRefreshed).toBe(1); // refreshed the pre-existing buff

    const burnedOwner = await client.query<{ owner: string }>(
      `select owner_user_id_at_snapshot as owner from horse_burns where race_id = $1`,
      [setup.raceId],
    );
    const buffs = await client.query<{ refreshed_at: string | null }>(
      `select refreshed_at::text as refreshed_at from revenge_buffs where user_id = $1 and status = 'ACTIVE'`,
      [burnedOwner.rows[0]!.owner],
    );
    expect(buffs.rows).toHaveLength(1);
    expect(buffs.rows[0]!.refreshed_at).not.toBeNull();
  });

  it('APPLIED buff boosts exactly one race, then is CONSUMED (Decision 057)', async () => {
    await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
    const owner = await newUser();
    const horse = await newHorse(owner, 1); // POWER
    // buff bound to this horse by a (simulated) successful assignment
    await client.query(
      `insert into revenge_buffs (user_id, buff_rarity, buff_bonus_score, buff_policy_version,
                                  deterministic_buff_roll, status, applied_horse_id, applied_at)
       values ($1, 'SR', 10, 'buff_policy_v1.0', 'roll', 'APPLIED', $2, now())`,
      [owner, horse],
    );

    raceDateCounter += 1;
    const batchDate = `2033-03-${String(raceDateCounter).padStart(2, '0')}`;
    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
      [batchDate],
    );
    const raceSeed = `buff-race-${batchDate}`;
    const commit = await client.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [randomUUID(), sha256(raceSeed)],
    );
    const race = await client.query<{ id: string }>(
      `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
       values ($1, $2, $3, 'SEED_COMMITTED') returning id`,
      [batch.rows[0]!.id, VERSION, commit.rows[0]!.id],
    );
    const raceId = race.rows[0]!.id;

    await createParticipantSnapshots(client, {
      raceId,
      raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate,
    });

    // buff frozen into the snapshot and consumed immediately
    const snap = await client.query<{ buff: { buff_rarity: string } | null }>(
      `select revenge_buff_snapshot_json as buff from race_participant_snapshots
       where race_id = $1 and horse_id = $2`,
      [raceId, horse],
    );
    expect(snap.rows[0]!.buff?.buff_rarity).toBe('SR');
    const buffState = await client.query<{ status: string }>(
      `select status::text as status from revenge_buffs where user_id = $1`,
      [owner],
    );
    expect(buffState.rows[0]!.status).toBe('CONSUMED');

    // the score includes exactly +10 for this race
    await runRaceScores(client, { raceId, raceSeed, raceEngineVersion: VERSION });
    const scored = await client.query<{ revenge_buff_modifier: string }>(
      `select revenge_buff_modifier::text as revenge_buff_modifier
       from race_participant_snapshots where race_id = $1 and horse_id = $2`,
      [raceId, horse],
    );
    expect(Number(scored.rows[0]!.revenge_buff_modifier)).toBe(10);

    // next race: no buff in the snapshot (one race only)
    raceDateCounter += 1;
    const batchDate2 = `2033-03-${String(raceDateCounter).padStart(2, '0')}`;
    const batch2 = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
      [batchDate2],
    );
    const raceSeed2 = `buff-race-${batchDate2}`;
    const commit2 = await client.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [randomUUID(), sha256(raceSeed2)],
    );
    const race2 = await client.query<{ id: string }>(
      `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
       values ($1, $2, $3, 'SEED_COMMITTED') returning id`,
      [batch2.rows[0]!.id, VERSION, commit2.rows[0]!.id],
    );
    await createParticipantSnapshots(client, {
      raceId: race2.rows[0]!.id,
      raceSeed: raceSeed2,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: batchDate2,
    });
    const snap2 = await client.query<{ buff: unknown }>(
      `select revenge_buff_snapshot_json as buff from race_participant_snapshots
       where race_id = $1 and horse_id = $2`,
      [race2.rows[0]!.id, horse],
    );
    expect(snap2.rows[0]!.buff).toBeNull();
  });

  it('training is frozen into the snapshot and daily state advances exactly once', async () => {
    const owner = await newUser();
    const horse = await newHorse(owner, 0); // SPRINTER
    raceDateCounter += 1;
    const batchDate = `2033-02-${String(raceDateCounter).padStart(2, '0')}`;
    await client.query(
      `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date)
       values ($1, $2, 'SPEED_TRAINING', $3, $3)`,
      [horse, owner, batchDate],
    );
    const batch = await client.query<{ id: string }>(
      `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
      [batchDate],
    );
    const raceSeed = `race-${batchDate}`;
    const commit = await client.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [randomUUID(), sha256(raceSeed)],
    );
    const race = await client.query<{ id: string }>(
      `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
       values ($1, $2, $3, 'SEED_COMMITTED') returning id`,
      [batch.rows[0]!.id, VERSION, commit.rows[0]!.id],
    );
    const raceId = race.rows[0]!.id;

    const created = await createParticipantSnapshots(client, {
      raceId,
      raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate,
    });
    expect(created).toBeGreaterThanOrEqual(1);

    // Day 1 with SPEED training + race: fatigue 0+8+5-5=8, condition 80+1-8=73
    const h = await client.query<{ condition: string; fatigue: string }>(
      `select condition::text as condition, fatigue::text as fatigue from horses where id = $1`,
      [horse],
    );
    expect(Number(h.rows[0]!.condition)).toBe(73);
    expect(Number(h.rows[0]!.fatigue)).toBe(8);

    // training locked into the snapshot
    const training = await client.query<{ snapshot_included_at: string | null }>(
      `select snapshot_included_at::text as snapshot_included_at from training_sessions where horse_id = $1`,
      [horse],
    );
    expect(training.rows[0]!.snapshot_included_at).not.toBeNull();
    const snap = await client.query<{ training_snapshot_json: { training_type: string } | null }>(
      `select training_snapshot_json from race_participant_snapshots where race_id = $1 and horse_id = $2`,
      [raceId, horse],
    );
    expect(snap.rows[0]!.training_snapshot_json?.training_type).toBe('SPEED_TRAINING');

    // idempotency: re-run does not advance state again
    const again = await createParticipantSnapshots(client, {
      raceId,
      raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate,
    });
    expect(again).toBe(0);
    const h2 = await client.query<{ condition: string; fatigue: string }>(
      `select condition::text as condition, fatigue::text as fatigue from horses where id = $1`,
      [horse],
    );
    expect(Number(h2.rows[0]!.condition)).toBe(73);
    expect(Number(h2.rows[0]!.fatigue)).toBe(8);
  });
});
