import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import {
  CONDITION_PREP_RANGE_V3,
  RACE_ENGINE_V3_VERSION,
  composeConditionPrepV3,
  deriveAptitudeV3,
  type RaceConditionsV3,
  type TrainingMenuV3,
} from '@sevendays/domain';
import {
  computeScoreV2,
  deriveSurface,
  deriveTrackCondition,
  deriveWeather,
  round2,
} from '@sevendays/race-engine';
import { createParticipantSnapshots, runRaceScores } from '../src/index.js';

/**
 * エンジン V3 結線(調教・適性再設計 — TRAINING_APTITUDE_REDESIGN.md 実装③):
 * snapshot が condition_prep を「個体適性(dna) + 調教の備え(メニュー↔条件) + レースアイテム」
 * で作り(コースも1軸として効く)、必ず ±4 にクランプする。採点式は V2 と同一。
 * ★レースアイテムのDB結線は item_catalog シード(④)後。ここは適性+調教経路を検証。
 */

let client: SqlClient;
const V3 = RACE_ENGINE_V3_VERSION;

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

async function newHorseV3(ownerId: string, horseType: string, totalValue: number | null, dnaHash: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, total_value)
     values ($1, $2, $3::horse_type, 'COMMON', $4, 1.00, 'horse_generation_v1.0', $5, '{}'::jsonb, $6)
     returning id`,
    [ownerId, `V3 ${randomUUID().slice(0, 10)}`, horseType, dnaHash, randomUUID().replaceAll('-', ''), totalValue],
  );
  return r.rows[0]!.id;
}

async function addTrainingV3(horseId: string, userId: string, batchDate: string, menus: TrainingMenuV3[]): Promise<void> {
  await client.query(
    `insert into training_sessions
       (horse_id, user_id, training_date, effective_race_date, slot,
        menus_v2, per_menu_v2, synergy_v2, delta_v2, rests_decay_v2)
     values ($1, $2, $3, $3, 'NIGHT', $4, $5, 0, 0, $6)`,
    [horseId, userId, batchDate, menus, JSON.stringify(menus.map((m) => ({ menu: m, roll: 0 }))), menus.includes('REST')],
  );
}

let raceDateCounter = 0;
async function buildRaceV3(): Promise<{ raceId: string; raceSeed: string; batchDate: string; conds: RaceConditionsV3 }> {
  await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
  raceDateCounter += 1;
  const batchDate = `2036-04-${String(raceDateCounter).padStart(2, '0')}`;
  const batch = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
    [batchDate],
  );
  const raceSeed = `v3-race-seed-${batchDate}`;
  const commit = await client.query<{ id: string }>(
    `insert into randomness_commits (reference_type, reference_id, commit_hash) values ('RACE', $1, $2) returning id`,
    [randomUUID(), sha256(raceSeed)],
  );
  const race = await client.query<{ id: string }>(
    `insert into races (batch_run_id, race_engine_version, seed_commit_id, status)
     values ($1, $2, $3, 'SEED_COMMITTED') returning id`,
    [batch.rows[0]!.id, V3, commit.rows[0]!.id],
  );
  // 条件はシード由来(night_forecast 無し時と同じ導出) — 期待 prep の計算に使う
  const conds: RaceConditionsV3 = {
    weather: deriveWeather(raceSeed, V3),
    track: deriveTrackCondition(raceSeed, V3),
    surface: deriveSurface(raceSeed, V3),
  };
  return { raceId: race.rows[0]!.id, raceSeed, batchDate, conds };
}

async function snapshotOf(raceId: string, horseId: string) {
  const r = await client.query<{
    total_value: string; condition_prep_modifier: string; luck_modifier: string | null;
    final_score: string | null; training_snapshot_json: Record<string, unknown> | null;
    surface: string;
  }>(
    `select s.total_value::text as total_value, s.condition_prep_modifier::text as condition_prep_modifier,
            s.luck_modifier::text as luck_modifier, s.final_score::text as final_score,
            s.training_snapshot_json, r.surface::text as surface
     from race_participant_snapshots s join races r on r.id = s.race_id
     where s.race_id = $1 and s.horse_id = $2`,
    [raceId, horseId],
  );
  return r.rows[0]!;
}

const snapshotInput = (s: { raceId: string; raceSeed: string; batchDate: string }) => ({
  raceId: s.raceId, raceSeed: s.raceSeed, raceEngineVersion: V3,
  liquidityPolicyVersion: 'liquidity_policy_v1.0', priceTableVersion: 'price_table_v1.0', batchDate: s.batchDate,
});

describe('engine V3 wiring — 適性+調教でcondition_prepを作る', () => {
  it('freezes prep = clamp(個体適性 + 調教の備え), applies decay, scores and is idempotent', async () => {
    const setup = await buildRaceV3();
    const owner = await newUser();

    // 既知の dna → 決定論の適性。メニューは 坂路(道悪)+水泳(雨)。
    const dnaA = 'aaaa0000bbbb1111';
    const menusA: TrainingMenuV3[] = ['HILL', 'POOL'];
    const horseA = await newHorseV3(owner, 'SPRINTER', 60, dnaA);
    await addTrainingV3(horseA, owner, setup.batchDate, menusA);

    // 調教なし → prep は適性だけ / 減衰のみ
    const horseB = await newHorseV3(owner, 'BALANCED', 50, 'cccc2222dddd3333');

    // REST → 減衰無効(tv 不変) / prep は適性 + 調整〔晴〕の備え
    const horseC = await newHorseV3(owner, 'ENDURANCE', 70, 'eeee4444ffff5555');
    await addTrainingV3(horseC, owner, setup.batchDate, ['REST']);

    const created = await createParticipantSnapshots(client, snapshotInput(setup));
    expect(created).toBe(3);

    // ★ prep はドメインの合成(適性+調教+アイテム0)と完全一致 = コース(surface)も効いている
    const expectedPrepA = round2(
      composeConditionPrepV3({ apt: deriveAptitudeV3(dnaA), menus: menusA, itemEdge: 0, conditions: setup.conds }),
    );
    const snapA = await snapshotOf(setup.raceId, horseA);
    expect(Number(snapA.condition_prep_modifier)).toBe(expectedPrepA);

    const expectedPrepB = round2(
      composeConditionPrepV3({ apt: deriveAptitudeV3('cccc2222dddd3333'), menus: [], itemEdge: 0, conditions: setup.conds }),
    );
    expect(Number((await snapshotOf(setup.raceId, horseB)).condition_prep_modifier)).toBe(expectedPrepB);

    // prep は必ず ±4 の器の内側
    for (const h of [horseA, horseB, horseC]) {
      const prep = Number((await snapshotOf(setup.raceId, h)).condition_prep_modifier);
      expect(prep).toBeGreaterThanOrEqual(CONDITION_PREP_RANGE_V3.min);
      expect(prep).toBeLessThanOrEqual(CONDITION_PREP_RANGE_V3.max);
    }

    // total_value: A/B は減衰 60→58 / 50→48、C は REST で不変 70
    expect(Number(snapA.total_value)).toBe(58);
    expect(Number((await snapshotOf(setup.raceId, horseB)).total_value)).toBe(48);
    expect(Number((await snapshotOf(setup.raceId, horseC)).total_value)).toBe(70);

    // 採点: final = total_value + prep + luck(computeScoreV2 と一致・式は V2 と同一)
    const scored = await runRaceScores(client, { raceId: setup.raceId, raceSeed: setup.raceSeed, raceEngineVersion: V3 });
    expect(scored).toBe(3);
    const snapAfter = await snapshotOf(setup.raceId, horseA);
    const recomputed = computeScoreV2({
      horseUuid: horseA, horseType: 'SPRINTER', totalValue: Number(snapAfter.total_value),
      conditionPrepModifier: Number(snapAfter.condition_prep_modifier), trained: true,
      raceSeed: setup.raceSeed, raceEngineVersion: V3,
    });
    expect(Number(snapAfter.luck_modifier)).toBe(recomputed.luckModifier);
    expect(Number(snapAfter.final_score)).toBe(recomputed.finalScore);

    // 冪等: 再実行で増えず、総合値も二重前進しない
    expect(await createParticipantSnapshots(client, snapshotInput(setup))).toBe(0);
    expect(Number((await snapshotOf(setup.raceId, horseA)).total_value)).toBe(58);
  });

  it('rejects a V3 race containing a horse without total_value', async () => {
    const setup = await buildRaceV3();
    const owner = await newUser();
    await newHorseV3(owner, 'SPRINTER', null, 'no-tv-dna');
    await expect(createParticipantSnapshots(client, snapshotInput(setup))).rejects.toThrow(/V3_TOTAL_VALUE_MISSING/);
  });

  it('gives different individual horses different prep on the same night (適性は個体別)', async () => {
    const setup = await buildRaceV3();
    const owner = await newUser();
    // 同タイプ・同メニュー・同total_valueでも dna が違えば prep が違う(タイプ固定でない)
    const h1 = await newHorseV3(owner, 'POWER', 55, '1111ababab2222');
    const h2 = await newHorseV3(owner, 'POWER', 55, '9999cdcdcd8888');
    await addTrainingV3(h1, owner, setup.batchDate, ['HILL', 'WOOD']);
    await addTrainingV3(h2, owner, setup.batchDate, ['HILL', 'WOOD']);
    await createParticipantSnapshots(client, snapshotInput(setup));
    const p1 = Number((await snapshotOf(setup.raceId, h1)).condition_prep_modifier);
    const p2 = Number((await snapshotOf(setup.raceId, h2)).condition_prep_modifier);
    expect(p1).not.toBe(p2);
  });
});
