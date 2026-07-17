import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '@sevendays/database';
import { Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { getBalance, getPlatformAccountId, postTransaction } from '@sevendays/ledger';
import {
  buildProductionHandlers,
  createBatchRun,
  processDueBuybackPayments,
  runBatch,
} from '../src/index.js';
import type { StepContext } from '../src/index.js';

/**
 * バッチ2回制 (V2実装-2, Decision 102):
 * (batch_date, slot) キー・予報の時系列チェーン・買戻し準備金バックストップ(102-8)。
 */

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

async function newUser(): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into users (email) values ($1) returning id`,
    [`${randomUUID()}@test.dev`],
  );
  return r.rows[0]!.id;
}

async function newHorse(ownerId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `insert into horses (owner_user_id, name, horse_type, rarity, dna_hash, dna_modifier,
                         horse_generation_version, mint_seed_hash, ability_json)
     values ($1, $2, 'BALANCED', 'COMMON', $3, 0.50, 'horse_generation_v1.0', $4, '{}'::jsonb)
     returning id`,
    [ownerId, `Slot Test ${randomUUID().slice(0, 13)}`, randomUUID().replaceAll('-', ''), randomUUID().replaceAll('-', '')],
  );
  return r.rows[0]!.id;
}

function ctxFor(
  batchRunId: string,
  batchDate: string,
  slot: 'MORNING' | 'NIGHT',
  raceEngineVersion: string,
): StepContext {
  return {
    client,
    batchRunId,
    batchDate,
    slot,
    stepNumber: 5,
    stepKey: 'CREATE_RACES',
    idempotencyKey: `test:${batchDate}:${slot}:05:CREATE_RACES`,
    traceId: randomUUID(),
    lockedPolicyVersions: {
      liquidity_policies: 'liquidity_policy_v1.0',
      reserve_policies: 'reserve_policy_v1.0',
      buff_policies: 'buff_policy_v1.0',
      price_tables: 'price_table_v1.0',
      assignment_algorithm_versions: 'assignment_v1.0',
      race_engine_versions: raceEngineVersion,
      economy_policies: 'economy_policy_v1.0',
      horse_generation_versions: 'horse_generation_v1.0',
    },
  };
}

describe('two races a day (Decision 102)', () => {
  it('creates independent MORNING and NIGHT batch runs for the same date, idempotently', async () => {
    const date = '2036-01-10';
    const morning = await createBatchRun(client, date, 'MORNING');
    const night = await createBatchRun(client, date, 'NIGHT');
    expect(morning).not.toBe(night);
    expect(await createBatchRun(client, date, 'MORNING')).toBe(morning);

    const steps = await client.query<{ n: string; sample: string }>(
      `select count(*)::text as n, min(idempotency_key) as sample
       from batch_steps where batch_run_id = $1`,
      [morning],
    );
    expect(steps.rows[0]!.n).toBe('37');
    // スロット修飾キー: 同日2レースでも冪等キーが衝突しない
    expect(steps.rows[0]!.sample).toContain(`batch:${date}:MORNING:`);
  });

  it('runs a full skeleton batch for both slots of the same date to completion', async () => {
    const date = '2036-01-11';
    const morning = await runBatch(client, { batchDate: date, slot: 'MORNING' });
    expect(morning.status).toBe('COMPLETED');
    expect(morning.slot).toBe('MORNING');
    const night = await runBatch(client, { batchDate: date, slot: 'NIGHT' });
    expect(night.status).toBe('COMPLETED');
    expect(night.slot).toBe('NIGHT');
    expect(morning.batchRunId).not.toBe(night.batchRunId);
  });

  it('V2 forecast chain is chronological: MORNING commits same-date NIGHT; NIGHT commits next-date MORNING', async () => {
    const date = '2036-02-01';
    const handlers = buildProductionHandlers();

    const morningRun = await createBatchRun(client, date, 'MORNING');
    await handlers.CREATE_RACES!(ctxFor(morningRun, date, 'MORNING', 'race_engine_v2.0'));
    const afterMorning = await client.query<{ forecast_date: string; slot: string }>(
      `select forecast_date::text as forecast_date, slot::text as slot from night_forecasts
       where forecast_date >= $1::date order by forecast_date, slot`,
      [date],
    );
    expect(afterMorning.rows).toEqual([{ forecast_date: date, slot: 'NIGHT' }]);

    const nightRun = await createBatchRun(client, date, 'NIGHT');
    await handlers.CREATE_RACES!(ctxFor(nightRun, date, 'NIGHT', 'race_engine_v2.0'));
    const afterNight = await client.query<{ forecast_date: string; slot: string }>(
      `select forecast_date::text as forecast_date, slot::text as slot from night_forecasts
       where forecast_date >= $1::date order by forecast_date, slot`,
      [date],
    );
    expect(afterNight.rows).toEqual([
      { forecast_date: date, slot: 'NIGHT' },
      { forecast_date: '2036-02-02', slot: 'MORNING' },
    ]);
  });

  it('V1 forecast chain is unchanged: NIGHT batch commits next-date NIGHT', async () => {
    const date = '2036-03-01';
    const handlers = buildProductionHandlers();
    const nightRun = await createBatchRun(client, date, 'NIGHT');
    await handlers.CREATE_RACES!(ctxFor(nightRun, date, 'NIGHT', 'race_engine_v1.1'));
    const rows = await client.query<{ forecast_date: string; slot: string }>(
      `select forecast_date::text as forecast_date, slot::text as slot from night_forecasts
       where forecast_date >= $1::date order by forecast_date`,
      [date],
    );
    expect(rows.rows).toEqual([{ forecast_date: '2036-03-02', slot: 'NIGHT' }]);
  });
});

describe('buyback-reserve backstop (Decision 102-8)', () => {
  it('tops up the reserve from operating before paying, so due payments never go unpaid', async () => {
    // 運営準備金に原資を用意(テストネットのfund-grantと同じ経路:
    // 入金クリアリング→運営準備金のADMIN_ADJUSTMENT)
    const operating = await getPlatformAccountId(client, 'PLATFORM_OPERATING_RESERVE');
    const clearing = await getPlatformAccountId(client, 'PLATFORM_DEPOSIT_CLEARING');
    await postTransaction(client, {
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey: `test-fund-operating:${randomUUID()}`,
      entries: [
        { accountId: clearing, direction: 'DEBIT', amount: Money.of('100') },
        { accountId: operating, direction: 'CREDIT', amount: Money.of('100') },
      ],
    });

    const user = await newUser();
    const horse = await newHorse(user);
    const schedule = await client.query<{ id: string }>(
      `insert into buyback_schedules (horse_id, user_id, total_amount, payment_count, day7_clear_date)
       values ($1, $2, 200, 7, '2036-04-01') returning id`,
      [horse, user],
    );
    await client.query(
      `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
       values ($1, 1, '2036-04-02', 28.57142857)`,
      [schedule.rows[0]!.id],
    );

    const reserve = await getPlatformAccountId(client, 'PLATFORM_BUYBACK_RESERVE');
    const reserveBefore = Money.of(await getBalance(client, reserve));
    const operatingBefore = Money.of(await getBalance(client, operating));
    const due = Money.of('28.57142857');
    expect(due.gt(reserveBefore)).toBe(true); // ジッター枯渇シナリオ(§5.5.2実測)の再現

    const batchRunId = await createBatchRun(client, '2036-04-02', 'NIGHT');
    const result = await processDueBuybackPayments(client, {
      batchDate: '2036-04-02',
      backstop: { batchRunId },
    });

    // 不足分ちょうどが運営準備金から補填され、支払いは完了する
    const expectedTopUp = due.sub(reserveBefore);
    expect(Money.of(result.backstopAmount).eq(expectedTopUp)).toBe(true);
    expect(result.paymentsMade).toBe(1);
    const paid = await client.query<{ status: string }>(
      `select status::text as status from buyback_schedule_payments
       where buyback_schedule_id = $1 and payment_number = 1`,
      [schedule.rows[0]!.id],
    );
    expect(paid.rows[0]!.status).toBe('PAID');
    // 準備金は0(全額支払いに消えた)・運営は不足分だけ減った
    expect(Money.of(await getBalance(client, reserve)).isZero()).toBe(true);
    expect(
      Money.of(await getBalance(client, operating)).eq(operatingBefore.sub(expectedTopUp)),
    ).toBe(true);

    // 再実行(リトライ)は冪等: バックストップキーは吸収され、二重補填しない
    const again = await processDueBuybackPayments(client, {
      batchDate: '2036-04-02',
      backstop: { batchRunId },
    });
    expect(again.paymentsMade).toBe(0);
    expect(Money.of(again.backstopAmount).isZero()).toBe(true);
    expect(
      Money.of(await getBalance(client, operating)).eq(operatingBefore.sub(expectedTopUp)),
    ).toBe(true);
  });

  it('does nothing when the reserve already covers the due total', async () => {
    const reserve = await getPlatformAccountId(client, 'PLATFORM_BUYBACK_RESERVE');
    const clearing = await getPlatformAccountId(client, 'PLATFORM_DEPOSIT_CLEARING');
    await postTransaction(client, {
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey: `test-fund-reserve:${randomUUID()}`,
      entries: [
        { accountId: clearing, direction: 'DEBIT', amount: Money.of('50') },
        { accountId: reserve, direction: 'CREDIT', amount: Money.of('50') },
      ],
    });
    const user = await newUser();
    const horse = await newHorse(user);
    const schedule = await client.query<{ id: string }>(
      `insert into buyback_schedules (horse_id, user_id, total_amount, payment_count, day7_clear_date)
       values ($1, $2, 200, 7, '2036-05-01') returning id`,
      [horse, user],
    );
    await client.query(
      `insert into buyback_schedule_payments (buyback_schedule_id, payment_number, due_date, amount)
       values ($1, 1, '2036-05-02', 28.57142857)`,
      [schedule.rows[0]!.id],
    );
    const batchRunId = await createBatchRun(client, '2036-05-02', 'NIGHT');
    const result = await processDueBuybackPayments(client, {
      batchDate: '2036-05-02',
      backstop: { batchRunId },
    });
    expect(Money.of(result.backstopAmount).isZero()).toBe(true);
    expect(result.paymentsMade).toBe(1);
  });
});
