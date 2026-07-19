import { beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  BURN_DROP_KEYS_V3,
  applyRacePrepItemV3,
} from '@sevendays/domain';
import { trackModifier, weatherModifier } from '@sevendays/race-engine';
import {
  depositConfirmation,
  getBalance,
  getPlatformAccountId,
  itemPurchase,
} from '@sevendays/ledger';
import {
  createParticipantSnapshots,
  finalizeAndBurn,
  runRaceScores,
  verifyReplayInputs,
} from '../src/index.js';

/**
 * カタログV2(item_policy_v3.0・Decision 109)のエンジン結線:
 * RACE系=備え置換のスナップショット凍結+リプレイ再計算 /
 * TRAINING系=確定ロールボーナスの総合値合流 / 減衰シールド /
 * V2のBurnドロップ=V3セット+Revenge Buff廃止 / Step16精算レール。
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

async function newHorseV2(ownerId: string, horseType: string, totalValue: number): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json, total_value)
     values ($1, $2, $3::horse_type, 'COMMON', $4, 1.00, 'horse_generation_v1.0', $5, '{}'::jsonb, $6)
     returning id`,
    [ownerId, `V3 Item ${randomUUID().slice(0, 12)}`, horseType, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', ''), totalValue],
  );
  return r.rows[0]!.id;
}

let raceDateCounter = 0;

async function buildRaceV2(): Promise<{ raceId: string; raceSeed: string; batchDate: string }> {
  await client.query(`update horses set status = 'BURNED' where status = 'ACTIVE'`);
  raceDateCounter += 1;
  const batchDate = `2035-06-${String(raceDateCounter).padStart(2, '0')}`;
  const batch = await client.query<{ id: string }>(
    `insert into batch_runs (batch_date, batch_algorithm_version) values ($1, 'batch_v1.0') returning id`,
    [batchDate],
  );
  const raceSeed = `v3-item-seed-${batchDate}`;
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

/** 購入→在庫→使用行(kind/params付き)。unit_price はクリアリングへ。 */
async function buyAndApplyV3(
  userId: string,
  horseId: string,
  itemKey: string,
  price: string,
  batchDate: string,
  kind: 'RACE' | 'TRAINING',
  params: Record<string, unknown> | null = null,
): Promise<string> {
  if (Number(price) > 0) {
    await depositConfirmation(client, { userId, amount: Money.of('50'), idempotencyKey: randomUUID() });
    await itemPurchase(client, {
      userId,
      amount: Money.of(price),
      idempotencyKey: `test-v3-buy:${randomUUID()}`,
      referenceType: 'item',
      referenceId: horseId,
    });
  }
  const unit = await client.query<{ id: string }>(
    `insert into user_items (user_id, item_key, unit_price, source)
     values ($1, $2, $3, 'PURCHASE') returning id`,
    [userId, itemKey, price],
  );
  const unitId = unit.rows[0]!.id;
  await client.query(
    `insert into item_usages
       (user_item_id, horse_id, user_id, item_key, unit_price, effective_race_date, usage_kind, params_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [unitId, horseId, userId, itemKey, price, batchDate, kind, params ? JSON.stringify(params) : null],
  );
  await client.query(`update user_items set status = 'APPLIED' where id = $1`, [unitId]);
  return unitId;
}

describe('catalog V3 engine wiring (Decision 109)', () => {
  it('freezes race prep override, training item bonus and decay shield; replay passes', async () => {
    const setup = await buildRaceV2();
    const owner = await newUser();

    // A: RACE系(嵐の完全装具)— 備えは置換法則で凍結される
    const horseA = await newHorseV2(owner, 'SPRINTER', 50);
    await buyAndApplyV3(owner, horseA, 'storm_armor', '5', setup.batchDate, 'RACE');

    // B: TRAINING系 — 確定時ロール済みボーナス(+4.0)が総合値ゲインに合流
    const horseB = await newHorseV2(owner, 'POWER', 60);
    const unitB = await buyAndApplyV3(owner, horseB, 'royal_banquet', '8', setup.batchDate, 'TRAINING');
    await client.query(
      `insert into training_sessions
         (horse_id, user_id, training_date, effective_race_date,
          menus_v2, per_menu_v2, synergy_v2, delta_v2, rests_decay_v2,
          item_key_v3, item_bonus_v3, item_user_item_id)
       values ($1, $2, $3, $3, $4, $5, 0, 3.0, false, 'royal_banquet', 4.0, $6)`,
      [horseB, owner, setup.batchDate, ['HILL'], JSON.stringify([{ menu: 'HILL', roll: 3 }]), unitB],
    );
    // Decision 112: ロール+アイテム上乗せは確定と同時に総合値へ反映(60 +7 = 67)
    await client.query(`update horses set total_value = 67 where id = $1`, [horseB]);

    // C: 減衰シールド(星霜の砂適用済み=残2)— RESTなしでも減衰しない
    const horseC = await newHorseV2(owner, 'BALANCED', 70);
    await client.query(`update horses set decay_shield_v2 = 2 where id = $1`, [horseC]);

    const created = await createParticipantSnapshots(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: setup.batchDate,
    });
    expect(created).toBe(3);

    const race = await client.query<{ weather: string; track_condition: string }>(
      `select weather::text as weather, track_condition::text as track_condition from races where id = $1`,
      [setup.raceId],
    );
    const weather = race.rows[0]!.weather as never;
    const track = race.rows[0]!.track_condition as never;

    // A: prep は置換法則の再計算と一致し、使用行は SNAPSHOTTED
    const snapA = await client.query<{ condition_prep_modifier: string; item_snapshot_json: { race_item: { item_key: string } } }>(
      `select condition_prep_modifier::text as condition_prep_modifier, item_snapshot_json
       from race_participant_snapshots where race_id = $1 and horse_id = $2`,
      [setup.raceId, horseA],
    );
    const expectedPrep = applyRacePrepItemV3({
      itemKey: 'storm_armor',
      params: null,
      naturalWeatherMod: weatherModifier(weather, 'SPRINTER'),
      naturalTrackMod: trackModifier(track, 'SPRINTER'),
      actualWeather: weather,
      actualTrack: track,
    });
    expect(Number(snapA.rows[0]!.condition_prep_modifier)).toBe(
      Math.round((expectedPrep.weatherMod + expectedPrep.trackMod) * 100) / 100,
    );
    expect(snapA.rows[0]!.item_snapshot_json.race_item.item_key).toBe('storm_armor');

    // B: 総合値 = 60 + (3.0 + 4.0) = 67 → 減衰2 → 65
    const snapB = await client.query<{ total_value: string; item_snapshot_json: { training_item: { bonus: number } } }>(
      `select total_value::text as total_value, item_snapshot_json
       from race_participant_snapshots where race_id = $1 and horse_id = $2`,
      [setup.raceId, horseB],
    );
    expect(Number(snapB.rows[0]!.total_value)).toBe(65);
    expect(snapB.rows[0]!.item_snapshot_json.training_item.bonus).toBe(4);

    // C: シールドが減衰を無効化し、残回数が1に減る
    const snapC = await client.query<{ total_value: string; item_snapshot_json: { decay_shield_used: boolean } }>(
      `select total_value::text as total_value, item_snapshot_json
       from race_participant_snapshots where race_id = $1 and horse_id = $2`,
      [setup.raceId, horseC],
    );
    expect(Number(snapC.rows[0]!.total_value)).toBe(70);
    expect(snapC.rows[0]!.item_snapshot_json.decay_shield_used).toBe(true);
    const shield = await client.query<{ decay_shield_v2: number }>(
      `select decay_shield_v2 from horses where id = $1`,
      [horseC],
    );
    expect(shield.rows[0]!.decay_shield_v2).toBe(1);

    const snapshotted = await client.query<{ n: number }>(
      `select count(*)::int as n from item_usages where race_id = $1 and status = 'SNAPSHOTTED'`,
      [setup.raceId],
    );
    expect(snapshotted.rows[0]!.n).toBe(2);

    // スコア → reveal → リプレイ検証(備えの再計算チェック込み)が通る
    await runRaceScores(client, { raceId: setup.raceId, raceSeed: setup.raceSeed, raceEngineVersion: VERSION });
    await client.query(
      `update randomness_commits set reveal_seed = $2
       from races r where r.seed_commit_id = randomness_commits.id and r.id = $1`,
      [setup.raceId, setup.raceSeed],
    );
    await expect(verifyReplayInputs(client, setup.raceId, VERSION)).resolves.toBeUndefined();

    // 検証の実効性: 凍結された備えを改竄するとリプレイが落ちる…は行凍結ガードが
    // 既に防ぐ(スコア済みスナップショットは不変)— ここでは通過のみ確認
  });

  it('V2 burns drop from the V3 memorial set, generate NO revenge buffs, and settle both classes', async () => {
    const setup = await buildRaceV2();
    const owners: string[] = [];
    const horses: string[] = [];
    // 20頭: ジッター下限8%でも floor(20×0.08)=1 で必ず1頭以上BURNされる
    for (let i = 0; i < 20; i++) {
      const owner = await newUser();
      const horse = await newHorseV2(owner, 'BALANCED', 50 + i);
      owners.push(owner);
      horses.push(horse);
      await buyAndApplyV3(owner, horse, 'rain_cape', '2', setup.batchDate, 'RACE');
    }

    await createParticipantSnapshots(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      priceTableVersion: 'price_table_v1.0',
      batchDate: setup.batchDate,
    });
    await runRaceScores(client, { raceId: setup.raceId, raceSeed: setup.raceSeed, raceEngineVersion: VERSION });

    const mlm = await getPlatformAccountId(client, 'PLATFORM_MLM_RESERVE');
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');
    const mlmBefore = Money.of(await getBalance(client, mlm));
    const operatingBefore = Money.of(await getBalance(client, operating));

    const result = await finalizeAndBurn(client, {
      raceId: setup.raceId,
      raceSeed: setup.raceSeed,
      raceEngineVersion: VERSION,
      economyStatus: 'NORMAL',
      liquidityPolicyVersion: 'liquidity_policy_v1.0',
      buffPolicyVersion: 'buff_policy_v1.0',
    });
    const burned = result.burnedHorseIds;
    expect(burned.length).toBeGreaterThanOrEqual(1);

    // Revenge Buff は V2 で廃止(Decision 109)
    expect(result.buffsGenerated).toBe(0);
    expect(result.buffsRefreshed).toBe(0);
    const buffRows = await client.query<{ n: number }>(
      `select count(*)::int as n from revenge_buffs where user_id = any($1)`,
      [owners],
    );
    expect(buffRows.rows[0]!.n).toBe(0);
    const buffNotifs = await client.query<{ n: number }>(
      `select count(*)::int as n from notifications
       where notification_type = 'REVENGE_BUFF_GENERATED' and user_id = any($1)`,
      [owners],
    );
    expect(buffNotifs.rows[0]!.n).toBe(0);

    // ドロップは V3 の非売5種から(旧5種は出ない)
    expect(result.itemDrops).toBe(burned.length);
    const drops = await client.query<{ item_key: string }>(
      `select item_key from user_items where source = 'BURN_DROP' and user_id = any($1)`,
      [owners],
    );
    expect(drops.rows).toHaveLength(burned.length);
    for (const d of drops.rows) {
      expect(BURN_DROP_KEYS_V3).toContain(d.item_key);
    }

    // 精算: Burn→サポート財源 / 生存→運営収入(単価2×20個)
    const burnedCount = burned.length;
    expect(mlmBefore.add(Money.of(String(2 * burnedCount))).toFixed8()).toBe(
      Money.of(await getBalance(client, mlm)).toFixed8(),
    );
    expect(operatingBefore.add(Money.of(String(2 * (20 - burnedCount)))).toFixed8()).toBe(
      Money.of(await getBalance(client, operating)).toFixed8(),
    );
    const settled = await client.query<{ n: number }>(
      `select count(*)::int as n from item_usages where race_id = $1 and status = 'SETTLED'`,
      [setup.raceId],
    );
    expect(settled.rows[0]!.n).toBe(20);
  });
});
