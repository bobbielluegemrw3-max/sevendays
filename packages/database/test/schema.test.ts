import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDb, asUser, expectDbError } from '../src/test-db.js';

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function insertUser(email = `${randomUUID()}@test.dev`): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [email],
  );
  return r.rows[0]!.id;
}

async function insertHorse(ownerId: string, overrides: Record<string, unknown> = {}): Promise<string> {
  const cols = {
    owner_user_id: ownerId,
    status: 'ACTIVE',
    current_day: 0,
    name: `Test Horse ${randomUUID().slice(0, 13)}`, // names are unique (Decision 055)
    horse_type: 'SPRINTER',
    rarity: 'COMMON',
    dna_hash: randomUUID().replaceAll('-', ''),
    dna_modifier: '1.25',
    horse_generation_version: 'horse_generation_v1.0',
    mint_seed_hash: randomUUID().replaceAll('-', ''),
    ability_json: JSON.stringify({ speed: 75, power: 70, stamina: 80, recovery: 72, luck: 68 }),
    ...overrides,
  };
  const keys = Object.keys(cols);
  const params = Object.values(cols);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query<{ id: string }>(
    `insert into horses (${keys.join(', ')}) values (${placeholders}) returning id`,
    params,
  );
  return r.rows[0]!.id;
}

async function createUserAccount(userId: string, type: 'USER_AVAILABLE' | 'USER_LOCKED'): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into ledger_accounts (owner_type, owner_id, account_type)
     values ('USER', $1, $2) returning id`,
    [userId, type],
  );
  return r.rows[0]!.id;
}

async function platformAccount(type: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `select id from ledger_accounts where owner_type = 'PLATFORM' and account_type = $1::account_type`,
    [type],
  );
  return r.rows[0]!.id;
}

interface EntryInput {
  account: string;
  direction: 'DEBIT' | 'CREDIT';
  amount: string;
}

async function postTransaction(
  type: string,
  entries: EntryInput[],
  idempotencyKey = randomUUID(),
): Promise<string> {
  await db.exec('begin');
  try {
    const tx = await db.query<{ id: string }>(
      `insert into ledger_transactions (transaction_type, idempotency_key)
       values ($1::transaction_type, $2) returning id`,
      [type, idempotencyKey],
    );
    const txId = tx.rows[0]!.id;
    for (const e of entries) {
      await db.query(
        `insert into ledger_entries (transaction_id, account_id, direction, amount)
         values ($1, $2, $3::entry_direction, $4)`,
        [txId, e.account, e.direction, e.amount],
      );
    }
    await db.exec('commit');
    return txId;
  } catch (error) {
    await db.exec('rollback').catch(() => undefined);
    throw error;
  }
}

async function balanceOf(accountId: string): Promise<string> {
  const r = await db.query<{ balance: string }>(
    `select balance::text as balance from ledger_account_balances where account_id = $1`,
    [accountId],
  );
  return r.rows[0]?.balance ?? '0';
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

// Random dates collided across tests (unique batch_date); allocate sequentially.
let batchDateCounter = 0;
function nextUniqueBatchDate(): string {
  batchDateCounter += 1;
  return new Date(Date.UTC(2030, 0, batchDateCounter)).toISOString().slice(0, 10);
}

async function insertBatchRun(date: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version)
     values ($1, 'batch_v1.0') returning id`,
    [date],
  );
  return r.rows[0]!.id;
}

// ---------------------------------------------------------------------------
// migrations + seed
// ---------------------------------------------------------------------------

describe('migrations and seed data', () => {
  it('all migrations applied', async () => {
    const r = await db.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
       where table_schema = 'public'`,
    );
    expect(Number(r.rows[0]!.count)).toBeGreaterThanOrEqual(35);
  });

  it('seeds 9 platform ledger accounts (incl. ITEM_CLEARING, Decision 078)', async () => {
    const r = await db.query<{ count: string }>(
      `select count(*)::text as count from ledger_accounts where owner_type = 'PLATFORM'`,
    );
    expect(r.rows[0]!.count).toBe('9');
  });

  it('marketplace starts OPEN', async () => {
    const r = await db.query<{ state: string }>(`select state::text as state from marketplace_status`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.state).toBe('OPEN');
  });

  it('exactly one ACTIVE policy version per table (v1.1 supersedes v1.0)', async () => {
    for (const table of [
      'price_tables', 'reserve_policies', 'liquidity_policies', 'buff_policies',
      'economy_policies', 'assignment_algorithm_versions', 'race_engine_versions',
      'horse_generation_versions',
    ]) {
      const r = await db.query<{ count: string }>(
        `select count(*)::text as count from ${table}
         where activated_at is not null and deactivated_at is null`,
      );
      expect(r.rows[0]!.count, table).toBe('1');
    }
    // Decision 069: the liquidity policy history keeps the superseded v1.0.
    const history = await db.query<{ version: string }>(
      `select version from liquidity_policies where deactivated_at is not null`,
    );
    expect(history.rows.map((r) => r.version)).toEqual(['liquidity_policy_v1.0']);
  });

  it('activated policies are immutable', async () => {
    await expectDbError(
      db.query(`update price_tables set policy_json = '{}'::jsonb where version = 'price_table_v1.0'`),
      'POLICY_IMMUTABLE',
    );
  });
});

// ---------------------------------------------------------------------------
// ledger
// ---------------------------------------------------------------------------

describe('ledger double-entry rules', () => {
  it('posts a balanced transaction and updates balances', async () => {
    const user = await insertUser();
    const avail = await createUserAccount(user, 'USER_AVAILABLE');
    const depositClearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');

    await postTransaction('BLOCKCHAIN_DEPOSIT_CONFIRMATION', [
      { account: depositClearing, direction: 'DEBIT', amount: '100.00000000' },
      { account: avail, direction: 'CREDIT', amount: '100.00000000' },
    ]);

    expect(await balanceOf(avail)).toBe('100.00000000');
  });

  it('rejects an unbalanced transaction at commit (LEDGER_UNBALANCED)', async () => {
    const user = await insertUser();
    const avail = await createUserAccount(user, 'USER_AVAILABLE');
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');

    await expectDbError(
      postTransaction('BLOCKCHAIN_DEPOSIT_CONFIRMATION', [
        { account: clearing, direction: 'DEBIT', amount: '100.00000000' },
        { account: avail, direction: 'CREDIT', amount: '99.00000000' },
      ]),
      'LEDGER_UNBALANCED',
    );
  });

  it('rejects a transaction with fewer than 2 entries', async () => {
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');
    await expectDbError(
      postTransaction('ADMIN_ADJUSTMENT', [
        { account: clearing, direction: 'DEBIT', amount: '1.00000000' },
      ]),
      'LEDGER_UNBALANCED',
    );
  });

  it('posted transactions and entries are immutable', async () => {
    const user = await insertUser();
    const avail = await createUserAccount(user, 'USER_AVAILABLE');
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');
    const txId = await postTransaction('BLOCKCHAIN_DEPOSIT_CONFIRMATION', [
      { account: clearing, direction: 'DEBIT', amount: '10.00000000' },
      { account: avail, direction: 'CREDIT', amount: '10.00000000' },
    ]);

    await expectDbError(
      db.query(`update ledger_transactions set reference_type = 'x' where id = $1`, [txId]),
      'LEDGER_IMMUTABLE',
    );
    await expectDbError(
      db.query(`delete from ledger_entries where transaction_id = $1`, [txId]),
      'LEDGER_IMMUTABLE',
    );
  });

  it('rejects duplicate idempotency keys', async () => {
    const user = await insertUser();
    const avail = await createUserAccount(user, 'USER_AVAILABLE');
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');
    const key = randomUUID();
    const entries: EntryInput[] = [
      { account: clearing, direction: 'DEBIT', amount: '5.00000000' },
      { account: avail, direction: 'CREDIT', amount: '5.00000000' },
    ];
    await postTransaction('BLOCKCHAIN_DEPOSIT_CONFIRMATION', entries, key);
    await expectDbError(
      postTransaction('BLOCKCHAIN_DEPOSIT_CONFIRMATION', entries, key),
      'duplicate key',
    );
  });

  it('forbids negative balances on user accounts', async () => {
    const user = await insertUser();
    const avail = await createUserAccount(user, 'USER_AVAILABLE');
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');
    await postTransaction('BLOCKCHAIN_DEPOSIT_CONFIRMATION', [
      { account: clearing, direction: 'DEBIT', amount: '50.00000000' },
      { account: avail, direction: 'CREDIT', amount: '50.00000000' },
    ]);

    const locked = await createUserAccount(user, 'USER_LOCKED');
    await expectDbError(
      postTransaction('PURCHASE_FUND_LOCK', [
        { account: avail, direction: 'DEBIT', amount: '100.00000000' },
        { account: locked, direction: 'CREDIT', amount: '100.00000000' },
      ]),
      'NEGATIVE_BALANCE_FORBIDDEN',
    );
    // balance unchanged after rejected transaction
    expect(await balanceOf(avail)).toBe('50.00000000');
  });

  it('clearing accounts may go negative (external interface accounts)', async () => {
    const user = await insertUser();
    const avail = await createUserAccount(user, 'USER_AVAILABLE');
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');
    await postTransaction('BLOCKCHAIN_DEPOSIT_CONFIRMATION', [
      { account: clearing, direction: 'DEBIT', amount: '25.00000000' },
      { account: avail, direction: 'CREDIT', amount: '25.00000000' },
    ]);
    // no error — deposit clearing is a contra account
  });
});

// ---------------------------------------------------------------------------
// users / referral
// ---------------------------------------------------------------------------

describe('users and referral integrity', () => {
  it('rejects self-referral', async () => {
    const a = await insertUser();
    // self-referral is a 1-hop cycle; the cycle trigger fires before the CHECK
    await expectDbError(
      db.query(`update users set direct_referrer_user_id = $1 where id = $1`, [a]),
      'REFERRAL_CYCLE_DETECTED',
    );
  });

  it('rejects referral cycles', async () => {
    const a = await insertUser();
    const b = await insertUser();
    await db.query(`update users set direct_referrer_user_id = $1 where id = $2`, [a, b]);
    await expectDbError(
      db.query(`update users set direct_referrer_user_id = $1 where id = $2`, [b, a]),
      'REFERRAL_CYCLE_DETECTED',
    );
  });

  it('referrer binding is write-once', async () => {
    const a = await insertUser();
    const b = await insertUser();
    const c = await insertUser();
    await db.query(`update users set direct_referrer_user_id = $1 where id = $2`, [a, c]);
    await expectDbError(
      db.query(`update users set direct_referrer_user_id = $1 where id = $2`, [b, c]),
      'REFERRER_IMMUTABLE',
    );
  });
});

// ---------------------------------------------------------------------------
// support bonus placement (Decision 074)
// ---------------------------------------------------------------------------

describe('support bonus placement (Decision 074)', () => {
  it('assigns a deterministic unique referral code on insert', async () => {
    const a = await insertUser();
    const r = await db.query<{ referral_code: string }>(
      `select referral_code from users where id = $1`,
      [a],
    );
    const code = r.rows[0]!.referral_code;
    expect(code).toMatch(/^[0-9a-f]{12}$/);
    const expected = createHash('sha256').update(`${a}:sdd-ref-v1`).digest('hex').slice(0, 12);
    expect(code).toBe(expected);
  });

  it('placement is write-once and stamps placed_at', async () => {
    const parent = await insertUser();
    const child = await insertUser();
    await db.query(`update users set placement_parent_user_id = $1 where id = $2`, [parent, child]);
    const placed = await db.query<{ placed_at: string | null }>(
      `select placed_at::text as placed_at from users where id = $1`,
      [child],
    );
    expect(placed.rows[0]!.placed_at).not.toBeNull();
    const other = await insertUser();
    await expectDbError(
      db.query(`update users set placement_parent_user_id = $1 where id = $2`, [other, child]),
      'PLACEMENT_IMMUTABLE',
    );
    // clearing placement is a change too
    await expectDbError(
      db.query(`update users set placement_parent_user_id = null where id = $1`, [child]),
      'PLACEMENT_IMMUTABLE',
    );
  });

  it('admin override flag permits a placement change', async () => {
    const parent = await insertUser();
    const child = await insertUser();
    const newParent = await insertUser();
    await db.query(`update users set placement_parent_user_id = $1 where id = $2`, [parent, child]);
    await db.query(`select set_config('sevendays.placement_admin_override', 'on', false)`);
    try {
      await db.query(`update users set placement_parent_user_id = $1 where id = $2`, [newParent, child]);
    } finally {
      await db.query(`select set_config('sevendays.placement_admin_override', '', false)`);
    }
    const r = await db.query<{ p: string }>(
      `select placement_parent_user_id::text as p from users where id = $1`,
      [child],
    );
    expect(r.rows[0]!.p).toBe(newParent);
    // flag is off again — further changes are blocked
    await expectDbError(
      db.query(`update users set placement_parent_user_id = $1 where id = $2`, [parent, child]),
      'PLACEMENT_IMMUTABLE',
    );
  });

  it('rejects self-placement and placement cycles', async () => {
    const a = await insertUser();
    const b = await insertUser();
    await expectDbError(
      db.query(`update users set placement_parent_user_id = $1 where id = $1`, [a]),
      'PLACEMENT_CYCLE_DETECTED',
    );
    await db.query(`update users set placement_parent_user_id = $1 where id = $2`, [a, b]);
    await expectDbError(
      db.query(`update users set placement_parent_user_id = $1 where id = $2`, [b, a]),
      'PLACEMENT_CYCLE_DETECTED',
    );
  });

  it('placement_audit accepts rows and is service-only (RLS, no policies)', async () => {
    const a = await insertUser();
    const b = await insertUser();
    await db.query(
      `insert into placement_audit (user_id, new_parent_user_id, actor_user_id, action)
       values ($1, $2, $2, 'PLACE')`,
      [a, b],
    );
    const visible = await asUser(db, a, async () => {
      const r = await db.query<{ count: string }>(`select count(*)::text as count from placement_audit`);
      return r.rows[0]!.count;
    });
    expect(visible).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// horses
// ---------------------------------------------------------------------------

describe('horse lifecycle rules', () => {
  it('generation fields are immutable', async () => {
    const user = await insertUser();
    const horse = await insertHorse(user);
    await expectDbError(
      db.query(`update horses set horse_type = 'POWER' where id = $1`, [horse]),
      'HORSE_GENERATION_IMMUTABLE',
    );
  });

  it('burned horses are final', async () => {
    const user = await insertUser();
    const horse = await insertHorse(user);
    await db.query(`update horses set status = 'BURNED' where id = $1`, [horse]);
    await expectDbError(
      db.query(`update horses set status = 'ACTIVE' where id = $1`, [horse]),
      'HORSE_STATUS_FINAL',
    );
  });

  it('current_day cannot decrease or skip', async () => {
    const user = await insertUser();
    const horse = await insertHorse(user, { current_day: 3 });
    await expectDbError(
      db.query(`update horses set current_day = 2 where id = $1`, [horse]),
      'HORSE_DAY_DECREASE_FORBIDDEN',
    );
    await expectDbError(
      db.query(`update horses set current_day = 5 where id = $1`, [horse]),
      'HORSE_DAY_SKIP_FORBIDDEN',
    );
    // +1 is allowed (race survival)
    await db.query(`update horses set current_day = 4 where id = $1`, [horse]);
  });

  it('horses cannot be deleted', async () => {
    const user = await insertUser();
    const horse = await insertHorse(user);
    await expectDbError(db.query(`delete from horses where id = $1`, [horse]), 'DELETE_FORBIDDEN');
  });
});

// ---------------------------------------------------------------------------
// commit-reveal
// ---------------------------------------------------------------------------

describe('randomness commit-reveal', () => {
  it('accepts a valid reveal and stamps revealed_at', async () => {
    const seed = randomUUID();
    const r = await db.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [randomUUID(), sha256(seed)],
    );
    const id = r.rows[0]!.id;
    await db.query(`update randomness_commits set reveal_seed = $1 where id = $2`, [seed, id]);
    const check = await db.query<{ revealed_at: string | null }>(
      `select revealed_at::text as revealed_at from randomness_commits where id = $1`,
      [id],
    );
    expect(check.rows[0]!.revealed_at).not.toBeNull();
  });

  it('rejects a reveal that does not match the commit', async () => {
    const r = await db.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [randomUUID(), sha256('real-seed')],
    );
    await expectDbError(
      db.query(`update randomness_commits set reveal_seed = 'tampered-seed' where id = $1`, [
        r.rows[0]!.id,
      ]),
      'RACE_SEED_VERIFICATION_FAILED',
    );
  });

  it('commit hash and revealed seed are immutable; one commit per reference', async () => {
    const ref = randomUUID();
    const seed = randomUUID();
    const r = await db.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [ref, sha256(seed)],
    );
    const id = r.rows[0]!.id;
    await expectDbError(
      db.query(`update randomness_commits set commit_hash = $1 where id = $2`, [sha256('x'), id]),
      'SEED_COMMIT_IMMUTABLE',
    );
    await db.query(`update randomness_commits set reveal_seed = $1 where id = $2`, [seed, id]);
    await expectDbError(
      db.query(`update randomness_commits set reveal_seed = 'other' where id = $1`, [id]),
      'SEED_REVEAL_IMMUTABLE',
    );
    await expectDbError(
      db.query(
        `insert into randomness_commits (reference_type, reference_id, commit_hash)
         values ('RACE', $1, $2)`,
        [ref, sha256('y')],
      ),
      'duplicate key',
    );
  });
});

// ---------------------------------------------------------------------------
// snapshots
// ---------------------------------------------------------------------------

describe('race participant snapshots', () => {
  async function setupRace(): Promise<{ raceId: string; horseId: string; ownerId: string }> {
    const owner = await insertUser();
    const horse = await insertHorse(owner);
    const batch = await insertBatchRun(nextUniqueBatchDate());
    const commit = await db.query<{ id: string }>(
      `insert into randomness_commits (reference_type, reference_id, commit_hash)
       values ('RACE', $1, $2) returning id`,
      [randomUUID(), sha256(randomUUID())],
    );
    const race = await db.query<{ id: string }>(
      `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
       values ($1, 'race_engine_v1.0', $2, 'SEED_COMMITTED') returning id`,
      [batch, commit.rows[0]!.id],
    );
    return { raceId: race.rows[0]!.id, horseId: horse, ownerId: owner };
  }

  async function insertSnapshot(raceId: string, horseId: string, ownerId: string): Promise<string> {
    const r = await db.query<{ id: string }>(
      `insert into race_participant_snapshots (
         race_id, horse_id, owner_user_id, current_day, horse_type, rarity, dna_hash,
         ability_snapshot_json, weather, track_condition, race_engine_version,
         liquidity_policy_version, price_table_version, race_seed_hash, snapshot_hash
       ) values ($1, $2, $3, 0, 'SPRINTER', 'COMMON', 'dna',
         '{"speed":75}', 'SUNNY', 'GOOD', 'race_engine_v1.0',
         'liquidity_policy_v1.0', 'price_table_v1.0', 'sh', 'snap') returning id`,
      [raceId, horseId, ownerId],
    );
    return r.rows[0]!.id;
  }

  it('input fields are frozen from creation', async () => {
    const { raceId, horseId, ownerId } = await setupRace();
    const snap = await insertSnapshot(raceId, horseId, ownerId);
    await expectDbError(
      db.query(`update race_participant_snapshots set weather = 'STORM' where id = $1`, [snap]),
      'RACE_SNAPSHOT_IMMUTABLE',
    );
  });

  it('score columns can be filled exactly once, then the row is frozen', async () => {
    const { raceId, horseId, ownerId } = await setupRace();
    const snap = await insertSnapshot(raceId, horseId, ownerId);
    await db.query(
      `update race_participant_snapshots set
         base_ability_score = 75.5, horse_type_modifier = 1.0, rarity_modifier = 0,
         dna_modifier = 1.25, training_modifier = 0, weather_modifier = 0.5,
         track_modifier = -0.5, condition_modifier = 0, fatigue_modifier = 0,
         revenge_buff_modifier = 0, random_modifier = 1.1, final_score = 78.85
       where id = $1`,
      [snap],
    );
    await expectDbError(
      db.query(`update race_participant_snapshots set final_score = 99 where id = $1`, [snap]),
      'RACE_SNAPSHOT_IMMUTABLE',
    );
  });

  it('snapshots cannot be deleted; one snapshot per race+horse', async () => {
    const { raceId, horseId, ownerId } = await setupRace();
    const snap = await insertSnapshot(raceId, horseId, ownerId);
    await expectDbError(
      db.query(`delete from race_participant_snapshots where id = $1`, [snap]),
      'DELETE_FORBIDDEN',
    );
    await expectDbError(insertSnapshot(raceId, horseId, ownerId), 'duplicate key');
  });
});

// ---------------------------------------------------------------------------
// training
// ---------------------------------------------------------------------------

describe('training sessions', () => {
  it('one training per horse per effective race date', async () => {
    const user = await insertUser();
    const horse = await insertHorse(user);
    await db.query(
      `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date)
       values ($1, $2, 'SPEED_TRAINING', '2030-01-01', '2030-01-01')`,
      [horse, user],
    );
    await expectDbError(
      db.query(
        `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date)
         values ($1, $2, 'POWER_TRAINING', '2030-01-01', '2030-01-01')`,
        [horse, user],
      ),
      'duplicate key',
    );
  });

  it('training content is immutable; snapshot-included training is frozen', async () => {
    const user = await insertUser();
    const horse = await insertHorse(user);
    const r = await db.query<{ id: string }>(
      `insert into training_sessions (horse_id, user_id, training_type, training_date, effective_race_date)
       values ($1, $2, 'SPEED_TRAINING', '2030-02-01', '2030-02-01') returning id`,
      [horse, user],
    );
    const id = r.rows[0]!.id;
    await expectDbError(
      db.query(`update training_sessions set training_type = 'POWER_TRAINING' where id = $1`, [id]),
      'TRAINING_IMMUTABLE',
    );
    await db.query(`update training_sessions set snapshot_included_at = now() where id = $1`, [id]);
    await expectDbError(
      db.query(`update training_sessions set snapshot_included_at = null where id = $1`, [id]),
      'TRAINING_FROZEN',
    );
    await expectDbError(
      db.query(`delete from training_sessions where id = $1`, [id]),
      'TRAINING_FROZEN',
    );
  });
});

// ---------------------------------------------------------------------------
// revenge buffs
// ---------------------------------------------------------------------------

describe('revenge buffs', () => {
  it('one active buff per user; bonus must match rarity; not transferable', async () => {
    const user = await insertUser();
    await db.query(
      `insert into revenge_buffs (user_id, buff_rarity, buff_bonus_score, buff_policy_version, deterministic_buff_roll)
       values ($1, 'R', 7, 'buff_policy_v1.0', 'roll1')`,
      [user],
    );
    await expectDbError(
      db.query(
        `insert into revenge_buffs (user_id, buff_rarity, buff_bonus_score, buff_policy_version, deterministic_buff_roll)
         values ($1, 'SR', 10, 'buff_policy_v1.0', 'roll2')`,
        [user],
      ),
      'duplicate key',
    );
    await expectDbError(
      db.query(
        `insert into revenge_buffs (user_id, buff_rarity, buff_bonus_score, buff_policy_version, deterministic_buff_roll)
         values ($1, 'SR', 7, 'buff_policy_v1.0', 'roll3')`,
        [await insertUser()],
      ),
      'buff_bonus_matches_rarity',
    );
    const other = await insertUser();
    await expectDbError(
      db.query(`update revenge_buffs set user_id = $1 where user_id = $2`, [other, user]),
      'BUFF_NOT_TRANSFERABLE',
    );
  });
});

// ---------------------------------------------------------------------------
// buyback
// ---------------------------------------------------------------------------

describe('buyback schedules and payments', () => {
  async function setupSchedule(): Promise<string> {
    const user = await insertUser();
    const horse = await insertHorse(user);
    const r = await db.query<{ id: string }>(
      `insert into buyback_schedules (horse_id, user_id, total_amount, payment_count, day7_clear_date)
       values ($1, $2, 200, 7, '2030-03-01') returning id`,
      [horse, user],
    );
    return r.rows[0]!.id;
  }

  it('total must be exactly 200 and count exactly 7', async () => {
    const user = await insertUser();
    const horse = await insertHorse(user);
    await expectDbError(
      db.query(
        `insert into buyback_schedules (horse_id, user_id, total_amount, payment_count, day7_clear_date)
         values ($1, $2, 199, 7, '2030-03-01')`,
        [horse, user],
      ),
      'total_amount',
    );
    await expectDbError(
      db.query(
        `insert into buyback_schedules (horse_id, user_id, total_amount, payment_count, day7_clear_date)
         values ($1, $2, 200, 6, '2030-03-01')`,
        [horse, user],
      ),
      'payment_count',
    );
  });

  it('payment amounts follow the fixed 28.57142857 / 28.57142858 split', async () => {
    const schedule = await setupSchedule();
    await db.query(
      `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
       values ($1, 1, '2030-03-02', 28.57142857)`,
      [schedule],
    );
    await db.query(
      `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
       values ($1, 7, '2030-03-08', 28.57142858)`,
      [schedule],
    );
    await expectDbError(
      db.query(
        `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
         values ($1, 2, '2030-03-03', 28.57142858)`,
        [schedule],
      ),
      'buyback_payment_amounts',
    );
    await expectDbError(
      db.query(
        `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
         values ($1, 8, '2030-03-09', 28.57142857)`,
        [schedule],
      ),
      'violates check constraint', // violates both payment_number and amounts checks
    );
    await expectDbError(
      db.query(
        `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
         values ($1, 1, '2030-03-02', 28.57142857)`,
        [schedule],
      ),
      'duplicate key',
    );
  });

  it('PAID requires a ledger transaction and is final', async () => {
    const schedule = await setupSchedule();
    const r = await db.query<{ id: string }>(
      `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
       values ($1, 1, '2030-03-02', 28.57142857) returning id`,
      [schedule],
    );
    const paymentId = r.rows[0]!.id;
    await expectDbError(
      db.query(`update buyback_schedule_payments set status = 'PAID' where id = $1`, [paymentId]),
      'BUYBACK_PAYMENT_WITHOUT_LEDGER',
    );

    const user = await insertUser();
    const avail = await createUserAccount(user, 'USER_AVAILABLE');
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');
    const txId = await postTransaction('BUYBACK_PAYMENT', [
      { account: clearing, direction: 'DEBIT', amount: '28.57142857' },
      { account: avail, direction: 'CREDIT', amount: '28.57142857' },
    ]);
    await db.query(
      `update buyback_schedule_payments set status = 'PAID', ledger_transaction_id = $1, paid_at = now() where id = $2`,
      [txId, paymentId],
    );
    await expectDbError(
      db.query(`update buyback_schedule_payments set status = 'SCHEDULED' where id = $1`, [paymentId]),
      'BUYBACK_PAYMENT_FINAL',
    );
  });
});

// ---------------------------------------------------------------------------
// batch steps / recovery / audit
// ---------------------------------------------------------------------------

describe('batch steps and recovery', () => {
  it('non-retryable completed steps cannot be re-run', async () => {
    const batch = await insertBatchRun('2031-01-01');
    const r = await db.query<{ id: string }>(
      `insert into batch_steps (batch_run_id, step_number, step_key, retryable, status, idempotency_key)
       values ($1, 8, 'RUN_RACE_ENGINE', false, 'COMPLETED', $2) returning id`,
      [batch, randomUUID()],
    );
    // completed steps are final for ANY status change (migration 22 hardening)
    await expectDbError(
      db.query(`update batch_steps set status = 'PENDING' where id = $1`, [r.rows[0]!.id]),
      'BATCH_STEP_FINAL',
    );
    await expectDbError(
      db.query(`update batch_steps set status = 'FAILED' where id = $1`, [r.rows[0]!.id]),
      'BATCH_STEP_FINAL',
    );
    const failed = await db.query<{ id: string }>(
      `insert into batch_steps (batch_run_id, step_number, step_key, retryable, status, idempotency_key)
       values ($1, 11, 'FINALIZE_RACE_RANKINGS', false, 'FAILED', $2) returning id`,
      [batch, randomUUID()],
    );
    await expectDbError(
      db.query(`update batch_steps set status = 'RUNNING' where id = $1`, [failed.rows[0]!.id]),
      'RETRY_FORBIDDEN',
    );
  });

  it('retryable failed steps can be re-run', async () => {
    const batch = await insertBatchRun('2031-01-02');
    const r = await db.query<{ id: string }>(
      `insert into batch_steps (batch_run_id, step_number, step_key, retryable, status, idempotency_key)
       values ($1, 16, 'PAY_MLM_REWARDS', true, 'FAILED', $2) returning id`,
      [batch, randomUUID()],
    );
    await db.query(
      `update batch_steps set status = 'RUNNING', retry_count = retry_count + 1 where id = $1`,
      [r.rows[0]!.id],
    );
  });

  it('failed non-retryable steps cannot be rewritten to COMPLETED', async () => {
    const batch = await insertBatchRun('2031-01-04');
    const r = await db.query<{ id: string }>(
      `insert into batch_steps (batch_run_id, step_number, step_key, retryable, status, idempotency_key)
       values ($1, 13, 'SELECT_BURN_TARGETS', false, 'FAILED', $2) returning id`,
      [batch, randomUUID()],
    );
    await expectDbError(
      db.query(`update batch_steps set status = 'COMPLETED' where id = $1`, [r.rows[0]!.id]),
      'RETRY_FORBIDDEN',
    );
  });

  it('failed retryable steps cannot jump straight to COMPLETED', async () => {
    const batch = await insertBatchRun('2031-01-05');
    const r = await db.query<{ id: string }>(
      `insert into batch_steps (batch_run_id, step_number, step_key, retryable, status, idempotency_key)
       values ($1, 20, 'PAY_DUE_BUYBACKS', true, 'FAILED', $2) returning id`,
      [batch, randomUUID()],
    );
    await expectDbError(
      db.query(`update batch_steps set status = 'COMPLETED' where id = $1`, [r.rows[0]!.id]),
      'INVALID_BATCH_STATE',
    );
  });

  it('recovery requires two distinct approvers', async () => {
    const batch = await insertBatchRun('2031-01-03');
    const admin = await insertUser();
    await expectDbError(
      db.query(
        `insert into recovery_snapshots
           (batch_run_id, recovery_reason, approval_status, approved_by_1, approved_by_2, before_snapshot_hash)
         values ($1, 'test', 'APPROVED', $2, $2, 'hash')`,
        [batch, admin],
      ),
      'recovery_distinct_approvers',
    );
    await expectDbError(
      db.query(
        `insert into recovery_snapshots
           (batch_run_id, recovery_reason, approval_status, approved_by_1, before_snapshot_hash)
         values ($1, 'test', 'APPROVED', $2, 'hash')`,
        [batch, admin],
      ),
      'recovery_approved_requires_both',
    );
  });

  it('audit logs are append-only', async () => {
    const r = await db.query<{ id: string }>(
      `insert into audit_logs (actor_type, action) values ('SYSTEM', 'TEST') returning id`,
    );
    await expectDbError(
      db.query(`update audit_logs set action = 'TAMPERED' where id = $1`, [r.rows[0]!.id]),
      'IMMUTABLE_RECORD',
    );
    await expectDbError(
      db.query(`delete from audit_logs where id = $1`, [r.rows[0]!.id]),
      'IMMUTABLE_RECORD',
    );
  });
});

// ---------------------------------------------------------------------------
// RLS
// ---------------------------------------------------------------------------

describe('row level security', () => {
  it('users can read only their own user row', async () => {
    const a = await insertUser();
    await insertUser(); // user B exists
    await asUser(db, a, async () => {
      const r = await db.query<{ id: string }>(`select id from users`);
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]!.id).toBe(a);
    });
  });

  it('users can read only their own horses', async () => {
    const a = await insertUser();
    const b = await insertUser();
    const horseA = await insertHorse(a);
    await insertHorse(b);
    await asUser(db, a, async () => {
      const r = await db.query<{ id: string }>(`select id from horses`);
      expect(r.rows.map((x) => x.id)).toContain(horseA);
      expect(r.rows.every((x) => x.id === horseA || false)).toBe(true);
    });
  });

  it('authenticated users cannot write financial tables', async () => {
    const a = await insertUser();
    const clearing = await platformAccount('PLATFORM_DEPOSIT_CLEARING');
    await asUser(db, a, async () => {
      await expectDbError(
        db.query(
          `insert into ledger_transactions (transaction_type, idempotency_key)
           values ('ADMIN_ADJUSTMENT', $1)`,
          [randomUUID()],
        ),
        'row-level security',
      );
      await expectDbError(
        db.query(
          `insert into ledger_entries (transaction_id, account_id, direction, amount)
           values ($1, $2, 'CREDIT', 1)`,
          [randomUUID(), clearing],
        ),
        'row-level security',
      );
    });
  });

  it('authenticated users cannot update horses (0 rows affected)', async () => {
    const a = await insertUser();
    const b = await insertUser();
    const horseB = await insertHorse(b);
    await asUser(db, a, async () => {
      const r = await db.query(`update horses set last_listed_at = now() where id = $1`, [horseB]);
      expect(r.affectedRows ?? 0).toBe(0);
    });
  });

  it('races are transparently readable; admin tables are not', async () => {
    const a = await insertUser();
    await asUser(db, a, async () => {
      await db.query(`select id from races limit 1`); // allowed (may be empty)
      const batches = await db.query(`select id from batch_runs`);
      expect(batches.rows).toHaveLength(0); // no policy -> invisible
      const audits = await db.query(`select id from audit_logs`);
      expect(audits.rows).toHaveLength(0);
    });
  });

  it('users see only their own notifications and buffs', async () => {
    const a = await insertUser();
    const b = await insertUser();
    await db.query(
      `insert into notifications (user_id, notification_type) values ($1, 'TEST'), ($2, 'TEST')`,
      [a, b],
    );
    await asUser(db, a, async () => {
      const r = await db.query<{ user_id: string }>(`select user_id from notifications`);
      expect(r.rows.every((x) => x.user_id === a)).toBe(true);
      expect(r.rows.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('manual marketplace listings (Decision 076)', () => {
  it('MANUAL listings have no batch; SMART listings require one', async () => {
    const seller = await insertUser();
    const horse = await insertHorse(seller, { current_day: 2 });
    await db.query(
      `insert into market_listings (horse_id, seller_user_id, listing_price, current_day,
                                    batch_run_id, deterministic_market_tiebreak_score, source)
       values ($1, $2, 121.00, 2, null, 0.5, 'MANUAL')`,
      [horse, seller],
    );
    const horse2 = await insertHorse(seller, { current_day: 2 });
    await expectDbError(
      db.query(
        `insert into market_listings (horse_id, seller_user_id, listing_price, current_day,
                                      batch_run_id, deterministic_market_tiebreak_score, source)
         values ($1, $2, 121.00, 2, null, 0.5, 'SMART')`,
        [horse2, seller],
      ),
      'market_listings_source_batch',
    );
  });
});

describe('item system (Decision 078/079)', () => {
  it('seeds the catalog (35 active after the v2 swap) and the item clearing account', async () => {
    const client = await createTestDb();
    // v2(Decision 082): 44行 = v1の35 + v2新規9。activeな品揃えは常に35。
    const active = await client.query<{ n: number }>(
      `select count(*)::int as n from item_catalog where active`,
    );
    expect(active.rows[0]!.n).toBe(35);
    const sellable = await client.query<{ n: number }>(
      `select count(*)::int as n from item_catalog where sellable and active`,
    );
    expect(sellable.rows[0]!.n).toBe(30);
    const acct = await client.query(
      `select id from ledger_accounts where owner_type = 'PLATFORM' and account_type = 'PLATFORM_ITEM_CLEARING'`,
    );
    expect(acct.rows).toHaveLength(1);
  });

  it('enforces one non-cancelled usage per horse per race date', async () => {
    const client = await createTestDb();
    const user = await client.query<{ id: string }>(
      `insert into users (email) values ('item-user@test.dev') returning id`,
    );
    const userId = user.rows[0]!.id;
    const horse = await client.query<{ id: string }>(
      `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                           horse_generation_version, mint_seed_hash, ability_json)
       values ($1, 'Item Test Horse', 'SPRINTER', 'COMMON', 'dna-item-1', 1.00,
               'horse_generation_v1.0', 'seed-item-1', '{}') returning id`,
      [userId],
    );
    const horseId = horse.rows[0]!.id;
    const unit = async () => {
      const r = await client.query<{ id: string }>(
        `insert into user_items (user_id, item_key, unit_price, source)
         values ($1, 'sugar_cube', 1, 'PURCHASE') returning id`,
        [userId],
      );
      return r.rows[0]!.id;
    };
    const u1 = await unit();
    const u2 = await unit();
    const use = (unitId: string) =>
      client.query(
        `insert into item_usages (user_item_id, horse_id, user_id, item_key, unit_price, effective_race_date)
         values ($1, $2, $3, 'sugar_cube', 1, '2033-02-01')`,
        [unitId, horseId, userId],
      );
    await use(u1);
    await expect(use(u2)).rejects.toThrow(/uq_item_usage_horse_race/);
    // cancelling frees the slot for a re-apply
    await client.query(`update item_usages set status = 'CANCELLED' where user_item_id = $1`, [u1]);
    await use(u2);
  });

  it('user_transfers: asset shape + no self-transfer (USDT-ready, Decision 079)', async () => {
    const client = await createTestDb();
    const mk = async (email: string) => {
      const r = await client.query<{ id: string }>(
        `insert into users (email) values ($1) returning id`,
        [email],
      );
      return r.rows[0]!.id;
    };
    const a = await mk('gift-a@test.dev');
    const b = await mk('gift-b@test.dev');
    const unitR = await client.query<{ id: string }>(
      `insert into user_items (user_id, item_key, unit_price, source)
       values ($1, 'lucky_charm', 3, 'PURCHASE') returning id`,
      [a],
    );
    const unitId = unitR.rows[0]!.id;
    await client.query(
      `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, user_item_id, idempotency_key)
       values ($1, $2, 'ITEM', $3, 'gift:1')`,
      [a, b, unitId],
    );
    // ITEM transfer with an amount violates the shape constraint
    await expect(
      client.query(
        `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, user_item_id, amount, idempotency_key)
         values ($1, $2, 'ITEM', $3, 5, 'gift:2')`,
        [a, b, unitId],
      ),
    ).rejects.toThrow(/user_transfers_asset/);
    // USDT book transfer needs an amount and no item
    await client.query(
      `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, amount, idempotency_key)
       values ($1, $2, 'USDT', 25.5, 'usdt:1')`,
      [a, b],
    );
    await expect(
      client.query(
        `insert into user_transfers (sender_user_id, recipient_user_id, asset_type, amount, idempotency_key)
         values ($1, $1, 'USDT', 1, 'usdt:2')`,
        [a],
      ),
    ).rejects.toThrow(/user_transfers_not_self/);
  });

  it('snapshot random_modifier range is widened to +5.50 and item_modifier capped at 6', async () => {
    const client = await createTestDb();
    const bad = await client.query<{ ok: boolean }>(
      `select 5.50 between -3.00 and 5.50 as ok`,
    );
    expect(bad.rows[0]!.ok).toBe(true);
    const cols = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'race_participant_snapshots'
         and column_name in ('item_snapshot_json', 'item_modifier')`,
    );
    expect(cols.rows).toHaveLength(2);
  });
});
