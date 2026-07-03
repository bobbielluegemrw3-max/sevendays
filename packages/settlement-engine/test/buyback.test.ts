import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money, addDays } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  depositConfirmation,
  purchaseFundLock,
  day0MintSettlement,
  reserveAllocation,
  ensureUserAccounts,
  getBalance,
  getPlatformAccountId,
  reconcile,
} from '@sevendays/ledger';
import {
  processSurvivorsAndDay7,
  processDueBuybackPayments,
  createMemorialNfts,
} from '../src/index.js';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
  // Fund the buyback reserve: 3 mint flows -> 3 x 93.60 = 280.80 USDT (> 200).
  for (let i = 0; i < 3; i += 1) {
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

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  return r.rows[0]!.id;
}

async function newHorse(ownerId: string, currentDay: number): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, current_day, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, $3, 'BALANCED', 'COMMON', $4, 0.50, 'horse_generation_v1.0', $5, $6)
     returning id`,
    [
      ownerId,
      currentDay,
      `Buyback Test ${randomUUID().slice(0, 13)}`,
      randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
      JSON.stringify({ speed: 75, power: 75, stamina: 75, recovery: 75, luck: 75 }),
    ],
  );
  return r.rows[0]!.id;
}

/**
 * Minimal finished race fixture: snapshot rows + result rows for the given
 * horses (with burn flags), without running the full engine.
 */
async function finishedRace(
  batchDate: string,
  horses: { id: string; owner: string; day: number; burned: boolean }[],
): Promise<string> {
  const batch = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
    [batchDate],
  );
  const seed = `bb-${batchDate}`;
  const commit = await client.query<{ id: string }>(
    `insert into randomness_commits (reference_type, reference_id, commit_hash)
     values ('RACE', $1, $2) returning id`,
    [randomUUID(), sha256(seed)],
  );
  const race = await client.query<{ id: string }>(
    `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
     values ($1, 'race_engine_v1.0', $2, 'FINALIZED') returning id`,
    [batch.rows[0]!.id, commit.rows[0]!.id],
  );
  const raceId = race.rows[0]!.id;

  let rank = 0;
  for (const h of horses) {
    rank += 1;
    await client.query(
      `insert into race_participant_snapshots (
         race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash,
         ability_snapshot_json, weather, track_condition, race_engine_version,
         liquidity_policy_version, price_table_version, race_seed_hash, snapshot_hash,
         base_ability_score, horse_type_modifier, rarity_modifier, dna_modifier,
         training_modifier, weather_modifier, track_modifier, condition_modifier,
         fatigue_modifier, revenge_buff_modifier, random_modifier, final_score
       ) values ($1, $2, $3, $4, 'BALANCED', 'COMMON', 'dna', '{}', 'SUNNY', 'GOOD',
                 'race_engine_v1.0', 'liquidity_policy_v1.0', 'price_table_v1.0', 'sh', $5,
                 75, 0, 0, 0.5, 0, 1, 1, 2, 0, 0, 1, 80.5)`,
      [raceId, h.id, h.owner, h.day, `hash-${h.id}`],
    );
    await client.query(
      `insert into race_results (race_id, horse_id, final_score, deterministic_tiebreak_score, final_rank, is_burned)
       values ($1, $2, $3, $4, $5, $6)`,
      [raceId, h.id, 80.5 - rank, 0.5, rank, h.burned],
    );
    if (h.burned) {
      await client.query(`update horses set status = 'BURNED' where id = $1`, [h.id]);
    }
  }
  return raceId;
}

describe('Day progression and Day7 clear (Steps 17-19)', () => {
  it('survivors advance exactly one day; burned horses never advance; re-run is a no-op', async () => {
    const owner = await newUser();
    const survivor = await newHorse(owner, 2);
    const victim = await newHorse(owner, 2);
    const raceId = await finishedRace('2034-01-01', [
      { id: survivor, owner, day: 2, burned: false },
      { id: victim, owner, day: 2, burned: true },
    ]);

    const first = await processSurvivorsAndDay7(client, { raceId, batchDate: '2034-01-01' });
    expect(first.survivorsAdvanced).toBe(1);

    const again = await processSurvivorsAndDay7(client, { raceId, batchDate: '2034-01-01' });
    expect(again.survivorsAdvanced).toBe(0); // idempotent

    const days = await client.query<{ id: string; current_day: number; status: string }>(
      `select id, current_day, status::text as status from horses where id in ($1, $2)`,
      [survivor, victim],
    );
    const byId = new Map(days.rows.map((r) => [r.id, r]));
    expect(byId.get(survivor)!.current_day).toBe(3);
    expect(byId.get(victim)!.current_day).toBe(2); // burned: frozen
    expect(byId.get(victim)!.status).toBe('BURNED');
  });

  it('Day6 survivor reaches Day7: DAY7_CLEARED + schedule with 7 daily payments D+1..D+7', async () => {
    const owner = await newUser();
    const horse = await newHorse(owner, 6);
    // late date so this schedule is never touched by the payment-run test below
    const clearDate = '2034-12-01';
    const raceId = await finishedRace(clearDate, [{ id: horse, owner, day: 6, burned: false }]);

    const result = await processSurvivorsAndDay7(client, { raceId, batchDate: clearDate });
    expect(result.day7ClearedHorseIds).toEqual([horse]);
    expect(result.schedulesCreated).toBe(1);

    const h = await client.query<{ status: string; current_day: number }>(
      `select status::text as status, current_day from horses where id = $1`,
      [horse],
    );
    expect(h.rows[0]!.status).toBe('DAY7_CLEARED');
    expect(h.rows[0]!.current_day).toBe(7);

    const payments = await client.query<{ payment_number: number; due_date: string; amount: string }>(
      `select p.payment_number, p.due_date::text as due_date, p.amount::text as amount
       from buyback_schedule_payments p
       join buyback_schedules s on s.id = p.buyback_schedule_id
       where s.horse_id = $1 order by p.payment_number`,
      [horse],
    );
    expect(payments.rows).toHaveLength(7);
    payments.rows.forEach((p, i) => {
      expect(p.due_date).toBe(addDays(clearDate, i + 1)); // daily, D+1..D+7
      expect(p.amount).toBe(i < 6 ? '28.57142857' : '28.57142858');
    });

    // retry safety: schedule not duplicated
    const rerun = await processSurvivorsAndDay7(client, { raceId, batchDate: clearDate });
    expect(rerun.schedulesCreated).toBe(0);
    const schedules = await client.query<{ count: string }>(
      `select count(*)::text as count from buyback_schedules where horse_id = $1`,
      [horse],
    );
    expect(schedules.rows[0]!.count).toBe('1');
  });
});

describe('Buyback payments and Memorial NFT (Steps 20, 30)', () => {
  it('pays exactly 200 over 7 daily payments, then creates the memorial', async () => {
    const owner = await newUser();
    const horse = await newHorse(owner, 6);
    const clearDate = '2034-03-01';
    const raceId = await finishedRace(clearDate, [{ id: horse, owner, day: 6, burned: false }]);
    await processSurvivorsAndDay7(client, { raceId, batchDate: clearDate });

    const ownerAccounts = await ensureUserAccounts(client, owner);

    // On the clear date itself: nothing is due (payment 1 starts D+1).
    const day0 = await processDueBuybackPayments(client, { batchDate: clearDate });
    expect(day0.paymentsMade).toBe(0);
    expect(await getBalance(client, ownerAccounts.available)).toBe('0');

    // D+3: payments 1-3 paid.
    const day3 = await processDueBuybackPayments(client, { batchDate: addDays(clearDate, 3) });
    expect(day3.paymentsMade).toBe(3);
    expect(await getBalance(client, ownerAccounts.available)).toBe('85.71428571');
    expect(day3.schedulesCompleted).toBe(0);
    // memorial NOT created while payments are outstanding
    expect(await createMemorialNfts(client)).toBe(0);

    // D+7: remaining payments 4-7; total is exactly 200.
    const day7 = await processDueBuybackPayments(client, { batchDate: addDays(clearDate, 7) });
    expect(day7.paymentsMade).toBe(4);
    expect(day7.schedulesCompleted).toBe(1);
    expect(await getBalance(client, ownerAccounts.available)).toBe('200.00000000');

    // replay safety: no double payments
    const replay = await processDueBuybackPayments(client, { batchDate: addDays(clearDate, 7) });
    expect(replay.paymentsMade).toBe(0);
    expect(await getBalance(client, ownerAccounts.available)).toBe('200.00000000');

    // memorial: exactly one, horse MEMORIALIZED, only after all 7 PAID
    expect(await createMemorialNfts(client)).toBe(1);
    expect(await createMemorialNfts(client)).toBe(0); // idempotent
    const memorial = await client.query<{ metadata_json: { achievement: string } }>(
      `select metadata_json from memorial_nfts where horse_id = $1`,
      [horse],
    );
    expect(memorial.rows).toHaveLength(1);
    expect(memorial.rows[0]!.metadata_json.achievement).toBe('DAY7_CLEAR');
    const h = await client.query<{ status: string }>(
      `select status::text as status from horses where id = $1`,
      [horse],
    );
    expect(h.rows[0]!.status).toBe('MEMORIALIZED');

    // ledger stays balanced throughout
    const report = await reconcile(client);
    expect(report.issues).toEqual([]);
  });

  it('payments never print money: reserve balance decreases by exactly 200', async () => {
    const reserve = await getPlatformAccountId(client, 'PLATFORM_BUYBACK_RESERVE');
    const before = await getBalance(client, reserve);
    // 3 mints funded 280.80 allocation + 3.00 mint-fee halves (Decision 069);
    // one full buyback consumed 200 -> 83.80 remains
    expect(Money.of(before).eq('83.80')).toBe(true);
  });
});
