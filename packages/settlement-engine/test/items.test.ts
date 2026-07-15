import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  getBalance,
  getPlatformAccountId,
  itemPurchase,
} from '@sevendays/ledger';
import { deriveSurface, deriveTrackCondition, deriveWeather, resolveItemEffect } from '@sevendays/race-engine';
import {
  createParticipantSnapshots,
  finalizeAndBurn,
  runRaceScores,
  verifyReplayInputs,
} from '../src/index.js';

/**
 * Item System e2e (Decision 078): apply -> snapshot freeze -> score ->
 * settlement (burn -> support reserve / survive -> operating) + burn drops.
 */

let client: SqlClient;
const VERSION = 'race_engine_v1.1';

beforeAll(async () => {
  client = await createTestDb();
});

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
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
      `Item Test ${randomUUID().slice(0, 13)}`,
      types[typeIndex % types.length],
      randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
      JSON.stringify({ speed: 70 + (typeIndex % 20), power: 72, stamina: 75, recovery: 74, luck: 68 }),
    ],
  );
  return r.rows[0]!.id;
}

let raceDateCounter = 0;

async function buildRace(n: number): Promise<{
  raceId: string;
  raceSeed: string;
  batchDate: string;
  horses: string[];
  owners: string[];
}> {
  await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
  raceDateCounter += 1;
  const batchDate = `2034-02-${String(raceDateCounter).padStart(2, '0')}`;
  const batch = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
    [batchDate],
  );
  const raceSeed = `item-race-seed-${batchDate}`;
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
  const owners: string[] = [];
  const horses: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const owner = await newUser();
    owners.push(owner);
    horses.push(await newHorse(owner, i));
  }
  return { raceId: race.rows[0]!.id, raceSeed, batchDate, horses, owners };
}

async function buyAndApply(
  userId: string,
  horseId: string,
  itemKey: string,
  price: string,
  batchDate: string,
): Promise<string> {
  await depositConfirmation(client, {
    userId,
    amount: Money.of('50'),
    idempotencyKey: randomUUID(),
  });
  await itemPurchase(client, {
    userId,
    amount: Money.of(price),
    idempotencyKey: `test-item-buy:${randomUUID()}`,
    referenceType: 'item',
    referenceId: horseId,
  });
  const unit = await client.query<{ id: string }>(
    `insert into user_items (user_id, item_key, unit_price, source)
     values ($1, $2, $3, 'PURCHASE') returning id`,
    [userId, itemKey, price],
  );
  const unitId = unit.rows[0]!.id;
  await client.query(
    `insert into item_usages (user_item_id, horse_id, user_id, item_key, unit_price, effective_race_date)
     values ($1, $2, $3, $4, $5, $6)`,
    [unitId, horseId, userId, itemKey, price, batchDate],
  );
  await client.query(`update user_items set status = 'APPLIED' where id = $1`, [unitId]);
  return unitId;
}

describe('item system through the batch (Decision 078)', () => {
  it('freezes the item into the snapshot, scores it, settles by outcome, drops on burn', async () => {
    const setup = await buildRace(10); // NORMAL: 1 burn
    // rain_hood: unconditional +0.75 raw — works with no training (v2 condition gear).
    for (const [i, horseId] of setup.horses.entries()) {
      await buyAndApply(setup.owners[i]!, horseId, 'rain_hood', '1', setup.batchDate);
    }

    const clearing = await getPlatformAccountId(client, 'PLATFORM_ITEM_CLEARING');
    expect(Number(await getBalance(client, clearing))).toBe(10);

    const created = await createParticipantSnapshots(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: setup.batchDate,
    });
    expect(created).toBe(10);

    // conditions revealed on the race row; frozen JSON matches the pure rule
    const race = await client.query<{ surface: string }>(
      `select surface::text as surface from races where id = $1`,
      [setup.raceId],
    );
    const conditions = {
      weather: deriveWeather(setup.raceSeed, VERSION),
      track: deriveTrackCondition(setup.raceSeed, VERSION),
      surface: deriveSurface(setup.raceSeed, VERSION),
    } as const;
    expect(race.rows[0]!.surface).toBe(conditions.surface);

    const snap = await client.query<{ item_snapshot_json: Record<string, unknown> }>(
      `select item_snapshot_json from race_participant_snapshots
       where race_id = $1 and horse_id = $2`,
      [setup.raceId, setup.horses[0]],
    );
    const frozen = snap.rows[0]!.item_snapshot_json;
    const expected = resolveItemEffect(
      'rain_hood',
      {
        horseType: 'SPRINTER',
        currentDay: 0,
        training: null,
        prevCondition: 50,
        prevFatigue: 0,
        weather: conditions.weather,
      },
      conditions,
    );
    expect(frozen).toMatchObject({
      item_key: 'rain_hood',
      conditions: { ...conditions },
      item_points: expected.itemPoints,
    });

    // usages committed to the race
    const snapshotted = await client.query<{ n: number }>(
      `select count(*)::int as n from item_usages where race_id = $1 and status = 'SNAPSHOTTED'`,
      [setup.raceId],
    );
    expect(snapshotted.rows[0]!.n).toBe(10);

    await runRaceScores(client, { raceId: setup.raceId, raceSeed: setup.raceSeed, raceEngineVersion: VERSION });
    const scored = await client.query<{ item_modifier: string; final_score: string }>(
      `select item_modifier::text as item_modifier, final_score::text as final_score
       from race_participant_snapshots where race_id = $1 and horse_id = $2`,
      [setup.raceId, setup.horses[0]],
    );
    expect(Number(scored.rows[0]!.item_modifier)).toBe(expected.itemPoints);

    // 回帰(2026-07-15 本番インシデント): item を使った夜も replay 検証が通ること。
    // verifyReplayInputs が snapshot の itemPoints/itemRandomShift を再構築せず 0 で
    // 再計算していたため、score が item 分だけズレて RACE_SNAPSHOT_VERIFICATION_FAILED に
    // なり、バッチが FAILED_SAFE_MODE で停止していた。
    // (verifyReplayInputs は reveal 済みシードを要求する — commit_hash=sha256(raceSeed) なので
    //  reveal_seed=raceSeed をセットすれば commit-reveal 照合も通る。)
    await client.query(
      `update randomness_commits set reveal_seed = $2
       from races r where r.seed_commit_id = randomness_commits.id and r.id = $1`,
      [setup.raceId, setup.raceSeed],
    );
    await expect(verifyReplayInputs(client, setup.raceId, VERSION)).resolves.toBeUndefined();

    const mlmBefore = Number(
      await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE')),
    );
    const opBefore = Number(
      await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE')),
    );

    const result = await finalizeAndBurn(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      economyStatus: 'NORMAL', // 1 burn
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      buffPolicyVersion: 'buff_policy_v1.0',
    });

    expect(result.burnTargetCount).toBe(1);
    expect(result.itemSettlements).toBe(10);
    expect(result.itemDrops).toBe(1);

    // money: 1 burned -> +1 to support reserve; 9 survived -> +9 operating
    const mlmAfter = Number(
      await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE')),
    );
    const opAfter = Number(
      await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE')),
    );
    expect(mlmAfter - mlmBefore).toBeCloseTo(1, 8);
    expect(opAfter - opBefore).toBeCloseTo(9, 8);
    expect(Number(await getBalance(client, clearing))).toBe(0);

    // burn drop granted to the burned owner, deterministic and non-sellable
    const burnedHorse = result.burnedHorseIds[0]!;
    const burnedOwnerIdx = setup.horses.indexOf(burnedHorse);
    const drop = await client.query<{ item_key: string; unit_price: string; source: string }>(
      `select item_key, unit_price::text as unit_price, source from user_items
       where user_id = $1 and source = 'BURN_DROP'`,
      [setup.owners[burnedOwnerIdx]],
    );
    expect(drop.rows).toHaveLength(1);
    expect(Number(drop.rows[0]!.unit_price)).toBe(0);

    // usages settled with the outcome recorded
    const settled = await client.query<{ outcome: string; n: number }>(
      `select settled_outcome as outcome, count(*)::int as n from item_usages
       where race_id = $1 group by settled_outcome order by settled_outcome`,
      [setup.raceId],
    );
    expect(settled.rows).toEqual([
      { outcome: 'BURNED', n: 1 },
      { outcome: 'SURVIVED', n: 9 },
    ]);

    // replay: finalize again converges (no double settlement, no double drop)
    const replay = await finalizeAndBurn(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      buffPolicyVersion: 'buff_policy_v1.0',
    });
    expect(replay.itemDrops).toBe(0);
    expect(replay.itemSettlements).toBe(0);
    expect(Number(await getBalance(client, clearing))).toBe(0);
    expect(
      Number(await getBalance(client, await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE'))),
    ).toBe(mlmAfter);
  });

  it('races without items stay item-neutral (item_modifier 0, no settlements)', async () => {
    const setup = await buildRace(10);
    await createParticipantSnapshots(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: setup.batchDate,
    });
    await runRaceScores(client, { raceId: setup.raceId, raceSeed: setup.raceSeed, raceEngineVersion: VERSION });
    const mods = await client.query<{ item_modifier: string }>(
      `select distinct item_modifier::text as item_modifier from race_participant_snapshots where race_id = $1`,
      [setup.raceId],
    );
    expect(mods.rows.map((r) => Number(r.item_modifier))).toEqual([0]);
    const result = await finalizeAndBurn(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      buffPolicyVersion: 'buff_policy_v1.0',
    });
    expect(result.itemSettlements).toBe(0);
    expect(result.itemDrops).toBe(1); // drops are unconditional on burns
  });
});
