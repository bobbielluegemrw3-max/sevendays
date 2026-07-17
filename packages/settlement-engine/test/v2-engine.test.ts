import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import {
  computeScoreV2,
  deriveTrackCondition,
  deriveWeather,
  trackModifier,
  weatherModifier,
} from '@sevendays/race-engine';
import {
  createParticipantSnapshots,
  runRaceScores,
  verifyReplayInputs,
} from '../src/index.js';

/**
 * エンジンV2結線 (V2実装-1b, Decision 101/104):
 * snapshot(総合値の漸化+備え凍結) -> score(computeScoreV2) -> replay検証。
 * 調教ロールは確定時に解決済み(training_sessionsのV2列)で、snapshotは読むだけ。
 */

let client: SqlClient;
const VERSION = 'race_engine_v2.0';

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

async function newHorseV2(
  ownerId: string,
  horseType: string,
  totalValue: number | null,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, total_value)
     values ($1, $2, $3::horse_type, 'COMMON', $4, 1.00, 'horse_generation_v1.0', $5, '{}'::jsonb, $6)
     returning id`,
    [
      ownerId,
      `V2 Test ${randomUUID().slice(0, 13)}`,
      horseType,
      randomUUID().replaceAll('-', ''),
      randomUUID().replaceAll('-', ''),
      totalValue,
    ],
  );
  return r.rows[0]!.id;
}

async function addTrainingV2(
  horseId: string,
  userId: string,
  batchDate: string,
  menus: string[],
  delta: number,
  restsDecay: boolean,
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into training_sessions
       (horse_id, user_id, training_date, effective_race_date,
        menus_v2, per_menu_v2, synergy_v2, delta_v2, rests_decay_v2)
     values ($1, $2, $3, $3, $4, $5, 0, $6, $7)
     returning id`,
    [horseId, userId, batchDate, menus, JSON.stringify(menus.map((m) => ({ menu: m, roll: delta }))), delta, restsDecay],
  );
  return r.rows[0]!.id;
}

let raceDateCounter = 0;

async function buildRaceV2(): Promise<{ raceId: string; raceSeed: string; batchDate: string }> {
  await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
  raceDateCounter += 1;
  const batchDate = `2035-03-${String(raceDateCounter).padStart(2, '0')}`;
  const batch = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
    [batchDate],
  );
  const raceSeed = `v2-race-seed-${batchDate}`;
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
  return { raceId: race.rows[0]!.id, raceSeed, batchDate };
}

async function snapshotOf(raceId: string, horseId: string) {
  const r = await client.query<{
    total_value: string;
    condition_prep_modifier: string;
    luck_modifier: string | null;
    final_score: string | null;
    training_snapshot_json: Record<string, unknown> | null;
  }>(
    `select total_value::text as total_value,
            condition_prep_modifier::text as condition_prep_modifier,
            luck_modifier::text as luck_modifier, final_score::text as final_score,
            training_snapshot_json
     from race_participant_snapshots where race_id = $1 and horse_id = $2`,
    [raceId, horseId],
  );
  return r.rows[0]!;
}

describe('engine V2 wiring (Decision 101/104)', () => {
  it('freezes the total-value recurrence, preparation and roll; scores and replays', async () => {
    const setup = await buildRaceV2();
    const owner = await newUser();

    // A: 通常の上昇 — 50 +6 = 56 → 減衰2 → 54
    const horseA = await newHorseV2(owner, 'SPRINTER', 50);
    await addTrainingV2(horseA, owner, setup.batchDate, ['HILL', 'SPAR'], 6, false);
    // B: ソフトキャップ跨ぎ — 84 +4 → 85 + (3×0.5) = 86.5 → 減衰2 → 84.5
    const horseB = await newHorseV2(owner, 'POWER', 84);
    await addTrainingV2(horseB, owner, setup.batchDate, ['HILL', 'WOOD'], 4, false);
    // C: REST — 減衰1回無効・値は不変
    const horseC = await newHorseV2(owner, 'ENDURANCE', 70);
    await addTrainingV2(horseC, owner, setup.batchDate, ['REST'], 0, true);
    // D: 調教なし — 減衰のみ 60 → 58
    const horseD = await newHorseV2(owner, 'BALANCED', 60);
    // E: LUCK×調教済み — 運レンジが -2..+4 に広がる(Decision 052/101)
    const horseE = await newHorseV2(owner, 'LUCK', 55);
    await addTrainingV2(horseE, owner, setup.batchDate, ['POOL'], 2, false);

    const created = await createParticipantSnapshots(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: setup.batchDate,
    });
    expect(created).toBe(5);

    // 漸化の凍結値(ロール適用→ソフトキャップ→減衰、RESTは減衰無効)
    expect(Number((await snapshotOf(setup.raceId, horseA)).total_value)).toBe(54);
    expect(Number((await snapshotOf(setup.raceId, horseB)).total_value)).toBe(84.5);
    expect(Number((await snapshotOf(setup.raceId, horseC)).total_value)).toBe(70);
    expect(Number((await snapshotOf(setup.raceId, horseD)).total_value)).toBe(58);
    expect(Number((await snapshotOf(setup.raceId, horseE)).total_value)).toBe(55);

    // horses.total_value も同じ値に前進している
    const hv = await client.query<{ total_value: string }>(
      `select total_value::text as total_value from horses where id = $1`,
      [horseA],
    );
    expect(Number(hv.rows[0]!.total_value)).toBe(54);

    // 備え = 公開適性表(天候±2+馬場±2)の合成そのもの(発明された数字ではない)
    const weather = deriveWeather(setup.raceSeed, VERSION);
    const track = deriveTrackCondition(setup.raceSeed, VERSION);
    expect(Number((await snapshotOf(setup.raceId, horseA)).condition_prep_modifier)).toBe(
      weatherModifier(weather, 'SPRINTER') + trackModifier(track, 'SPRINTER'),
    );

    // ロールはスナップショットに帰属表示用として凍結される
    const frozenRoll = (await snapshotOf(setup.raceId, horseA)).training_snapshot_json;
    expect(frozenRoll).toMatchObject({ menus: ['HILL', 'SPAR'], delta: 6, rests_decay: false });
    const frozen = await client.query<{ n: number }>(
      `select count(*)::int as n from training_sessions
       where effective_race_date = $1 and snapshot_included_at is not null`,
      [setup.batchDate],
    );
    expect(frozen.rows[0]!.n).toBe(4);

    // 冪等: 再実行してもスナップショットは増えず、総合値も二重前進しない
    const again = await createParticipantSnapshots(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: setup.batchDate,
    });
    expect(again).toBe(0);
    const hv2 = await client.query<{ total_value: string }>(
      `select total_value::text as total_value from horses where id = $1`,
      [horseA],
    );
    expect(Number(hv2.rows[0]!.total_value)).toBe(54);

    // 採点: final = total_value + 備え + 運。運は computeScoreV2 の再計算と一致
    const scored = await runRaceScores(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
    });
    expect(scored).toBe(5);

    for (const [horseId, horseType, trained] of [
      [horseA, 'SPRINTER', true],
      [horseD, 'BALANCED', false],
      [horseE, 'LUCK', true],
    ] as const) {
      const snap = await snapshotOf(setup.raceId, horseId);
      const recomputed = computeScoreV2({
        horseUuid: horseId,
        horseType,
        totalValue: Number(snap.total_value),
        conditionPrepModifier: Number(snap.condition_prep_modifier),
        trained,
        raceSeed: setup.raceSeed,
        raceEngineVersion: VERSION,
      });
      expect(Number(snap.luck_modifier)).toBe(recomputed.luckModifier);
      expect(Number(snap.final_score)).toBe(recomputed.finalScore);
      // 運のレンジ: 通常 -3..+3 / LUCK×調教済み -2..+4
      const range = horseType === 'LUCK' && trained ? [-2, 4] : [-3, 3];
      expect(Number(snap.luck_modifier)).toBeGreaterThanOrEqual(range[0]!);
      expect(Number(snap.luck_modifier)).toBeLessThanOrEqual(range[1]!);
    }

    // リプレイ検証(Step 10 / /races/[id] 検証パネルと同じ経路)が通る
    await client.query(
      `update randomness_commits set reveal_seed = $2
       from races r where r.seed_commit_id = randomness_commits.id and r.id = $1`,
      [setup.raceId, setup.raceSeed],
    );
    await expect(verifyReplayInputs(client, setup.raceId, VERSION)).resolves.toBeUndefined();
  });

  it('rejects a V2 race containing a horse without total_value (corrupted season state)', async () => {
    const setup = await buildRaceV2();
    const owner = await newUser();
    await newHorseV2(owner, 'SPRINTER', null);
    await expect(
      createParticipantSnapshots(client, {
        raceId: setup.raceId,
        raceSeed: setup.raceSeed,
        raceEngineVersion: VERSION,
        liquidityPolicyVersion: 'liquidity_policy_v1.0',
        priceTableVersion: 'price_table_v1.0',
        batchDate: setup.batchDate,
      }),
    ).rejects.toThrow(/V2_TOTAL_VALUE_MISSING/);
  });

  it('keeps training rows immutable: V2 roll columns cannot be updated (delete+insert only)', async () => {
    const setup = await buildRaceV2();
    const owner = await newUser();
    const horse = await newHorseV2(owner, 'POWER', 50);
    const trainingId = await addTrainingV2(horse, owner, setup.batchDate, ['HILL'], 3, false);
    await expect(
      client.query(`update training_sessions set delta_v2 = 99 where id = $1`, [trainingId]),
    ).rejects.toThrow(/TRAINING_IMMUTABLE/);
  });

  it('registers race_engine_v2.0 as INACTIVE — v1.1 stays the locked production engine', async () => {
    const rows = await client.query<{ version: string; activated_at: string | null }>(
      `select version, activated_at::text as activated_at from race_engine_versions
       where version in ('race_engine_v1.1', 'race_engine_v2.0') order by version`,
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]!.version).toBe('race_engine_v1.1');
    expect(rows.rows[0]!.activated_at).not.toBeNull();
    expect(rows.rows[1]!.version).toBe('race_engine_v2.0');
    expect(rows.rows[1]!.activated_at).toBeNull();
  });
});
