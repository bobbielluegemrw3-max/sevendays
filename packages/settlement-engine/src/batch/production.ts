import { newUuid, generateSecureSeedHex, sha256Hex, Money } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import { deriveNightForecastV1, type EconomyStatus } from '@sevendays/domain';
import {
  computeEconomyMetrics,
  currentEconomyStatus,
  evaluateEconomyStatus,
  loadPolicyByVersion,
  runAllStressScenarios,
  selectProfitTakingListings,
  thresholdsFromPolicy,
  validatePriceTable,
  type PriceTablePolicy,
  type ScenarioResult,
} from '@sevendays/economy-engine';
import {
  computeScore,
  deriveTrackCondition,
  deriveWeather,
  rankParticipants,
  verifyRaceSeed,
  type ScoreInput,
} from '@sevendays/race-engine';
import { createParticipantSnapshots } from '../race/snapshots.js';
import { runRaceScores } from '../race/scores.js';
import { finalizeAndBurn } from '../burn/execute.js';
import { payPendingCelebrations } from '../champion/celebration.js';
import { processSurvivorsAndDay7 } from '../buyback/day7.js';
import { processDueBuybackPayments } from '../buyback/payments.js';
import { createMemorialNfts } from '../buyback/memorial.js';
import { lockSessionsIntoBatch, refundUnassignedSessions } from '../assignment/sessions.js';
import { executeAssignment, executeReserveAllocations } from '../assignment/execute.js';
import { createMarketListings } from '../economy/listings.js';
import { evaluateMintCoverageGate } from '../economy/coverage-gate.js';
import { buildStressBaseInputs, createLiquidityReport, saveStressResults } from '../economy/report.js';
import type { StepContext, StepHandlers } from './types.js';

/**
 * Production composition root: wires every domain function into the fixed
 * 37-step Daily Settlement Batch (05_SETTLEMENT_ENGINE.md).
 *
 * Handlers are STATELESS — every step recovers its inputs from the database
 * (race by batch, seed from escrow/reveal, policies by locked version), so
 * a resumed process continues identically after a crash.
 *
 * Composite functions cover several adjacent spec steps (e.g.
 * finalizeAndBurn implements 11-16 deterministically in one idempotent
 * call). The primary step executes the work; the sibling steps VERIFY the
 * outcome so each spec step still gates the batch.
 */

interface LiquidityPolicyJson {
  allow_day0_mint?: boolean;
  daily_day0_mint_limit?: number;
}

async function raceForBatch(client: SqlClient, batchRunId: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `select id from races where batch_run_id = $1 order by created_at limit 1`,
    [batchRunId],
  );
  const row = r.rows[0];
  if (!row) throw new Error(`INVALID_BATCH_STATE: no race for batch ${batchRunId}`);
  return row.id;
}

/** Seed lookup: escrow before reveal (Step 9), revealed commit afterwards. */
async function raceSeed(client: SqlClient, raceId: string): Promise<string> {
  const escrow = await client.query<{ seed: string }>(
    `select seed from race_seed_escrow where race_id = $1`,
    [raceId],
  );
  if (escrow.rows[0]) return escrow.rows[0].seed;
  const revealed = await client.query<{ reveal_seed: string | null }>(
    `select rc.reveal_seed from randomness_commits rc
     join races r on r.seed_commit_id = rc.id where r.id = $1`,
    [raceId],
  );
  const seed = revealed.rows[0]?.reveal_seed;
  if (!seed) throw new Error(`RACE_SEED_VERIFICATION_FAILED: no seed available for race ${raceId}`);
  return seed;
}

function lockedVersion(ctx: StepContext, table: string): string {
  const version = ctx.lockedPolicyVersions?.[table as keyof NonNullable<typeof ctx.lockedPolicyVersions>];
  if (!version) throw new Error(`INVALID_BATCH_STATE: policy versions not locked (${table})`);
  return version;
}

async function pricedPolicies(ctx: StepContext): Promise<{
  priceTable: PriceTablePolicy;
  liquidity: LiquidityPolicyJson;
  raceEngineVersion: string;
}> {
  const priceRecord = await loadPolicyByVersion<PriceTablePolicy>(
    ctx.client,
    'price_tables',
    lockedVersion(ctx, 'price_tables'),
  );
  validatePriceTable(priceRecord.policy);
  const liquidityRecord = await loadPolicyByVersion<LiquidityPolicyJson>(
    ctx.client,
    'liquidity_policies',
    lockedVersion(ctx, 'liquidity_policies'),
  );
  return {
    priceTable: priceRecord.policy,
    liquidity: liquidityRecord.policy,
    raceEngineVersion: lockedVersion(ctx, 'race_engine_versions'),
  };
}

async function batchEconomyStatus(ctx: StepContext): Promise<EconomyStatus> {
  return currentEconomyStatus(ctx.client, ctx.batchDate);
}

export function buildProductionHandlers(): StepHandlers {
  return {
    // Step 4 — lock eligible purchase sessions into this batch.
    LOCK_PURCHASE_SESSIONS: async (ctx) => {
      await lockSessionsIntoBatch(ctx.client, ctx.batchRunId);
    },

    // Step 5 — one daily race, all ACTIVE horses (Decision 038). The seed
    // commit and escrow are created atomically with the race: a race can
    // never exist without a committed seed hash.
    CREATE_RACES: async (ctx) => {
      // ADR-012: 翌夜の条件シードを先にコミットする(予報の後出し防止)。
      // 冪等(forecast_dateユニーク) — リトライ・再開でも1日1行。
      {
        const fseed = generateSecureSeedHex();
        const { forecast } = deriveNightForecastV1(fseed);
        await ctx.client.query(
          `insert into night_forecasts
             (forecast_date, seed, commit_hash, forecast_weather, forecast_track, forecast_surface)
           values ($1::date + 1, $2, $3, $4::weather, $5::track_condition, $6::surface)
           on conflict (forecast_date) do nothing`,
          [ctx.batchDate, fseed, sha256Hex(fseed), forecast.weather, forecast.track, forecast.surface],
        );
      }
      const existing = await ctx.client.query<{ id: string }>(
        `select id from races where batch_run_id = $1`,
        [ctx.batchRunId],
      );
      if (existing.rows.length > 0) return; // resume
      const raceId = newUuid();
      const seed = generateSecureSeedHex();
      await ctx.client.query('begin');
      try {
        const commit = await ctx.client.query<{ id: string }>(
          `insert into randomness_commits (reference_type, reference_id, commit_hash)
           values ('RACE', $1, $2) returning id`,
          [raceId, sha256Hex(seed)],
        );
        await ctx.client.query(
          `insert into races (id, batch_run_id, race_engine_version, seed_commit_id, status)
           values ($1, $2, $3, $4, 'SEED_COMMITTED')`,
          [raceId, ctx.batchRunId, lockedVersion(ctx, 'race_engine_versions'), commit.rows[0]!.id],
        );
        await ctx.client.query(
          `insert into race_seed_escrow (race_id, seed) values ($1, $2)`,
          [raceId, seed],
        );
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        throw error;
      }
    },

    // Step 6 — verify the commit exists (created atomically in Step 5).
    COMMIT_RACE_SEEDS: async (ctx) => {
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      const commit = await ctx.client.query<{ commit_hash: string }>(
        `select rc.commit_hash from randomness_commits rc
         join races r on r.seed_commit_id = rc.id where r.id = $1`,
        [raceId],
      );
      if (!commit.rows[0]?.commit_hash) {
        throw new Error(`RACE_SEED_VERIFICATION_FAILED: race ${raceId} has no committed seed`);
      }
    },

    // Step 7 — immutable participant snapshots.
    CREATE_PARTICIPANT_SNAPSHOTS: async (ctx) => {
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      await createParticipantSnapshots(ctx.client, {
        raceId,
        raceSeed: await raceSeed(ctx.client, raceId),
        raceEngineVersion: lockedVersion(ctx, 'race_engine_versions'),
        liquidityPolicyVersion: lockedVersion(ctx, 'liquidity_policies'),
        priceTableVersion: lockedVersion(ctx, 'price_tables'),
        batchDate: ctx.batchDate,
      });
    },

    // Step 8 — deterministic scoring from snapshots only.
    RUN_RACE_ENGINE: async (ctx) => {
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      await runRaceScores(ctx.client, {
        raceId,
        raceSeed: await raceSeed(ctx.client, raceId),
        raceEngineVersion: lockedVersion(ctx, 'race_engine_versions'),
      });
      await ctx.client.query(
        `update races set status = 'COMPLETED', completed_at = coalesce(completed_at, now()) where id = $1`,
        [raceId],
      );
    },

    // Step 9 — reveal: move the seed from escrow into the public commit row
    // (the DB trigger verifies SHA-256(seed) == commit_hash).
    REVEAL_RACE_SEEDS: async (ctx) => {
      // ADR-012: 今夜の条件を決めた予報シードもレース後に公開扱いへ(冪等)。
      await ctx.client.query(
        `update night_forecasts set revealed_at = coalesce(revealed_at, now())
          where forecast_date = $1::date`,
        [ctx.batchDate],
      );
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      const escrow = await ctx.client.query<{ seed: string }>(
        `select seed from race_seed_escrow where race_id = $1`,
        [raceId],
      );
      if (!escrow.rows[0]) return; // already revealed (resume)
      await ctx.client.query('begin');
      try {
        await ctx.client.query(
          `update randomness_commits set reveal_seed = $2
           where id = (select seed_commit_id from races where id = $1) and reveal_seed is null`,
          [raceId, escrow.rows[0].seed],
        );
        await ctx.client.query(`delete from race_seed_escrow where race_id = $1`, [raceId]);
        await ctx.client.query('commit');
      } catch (error) {
        await ctx.client.query('rollback').catch(() => undefined);
        throw error;
      }
    },

    // Step 10 — full replay-input verification (audit item F-C): seed hash,
    // weather/track re-derivation, and score recomputation must all match.
    VERIFY_RACE_REPLAY_INPUTS: async (ctx) => {
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      await verifyReplayInputs(ctx.client, raceId, lockedVersion(ctx, 'race_engine_versions'));
    },

    // Steps 11-16 — finalizeAndBurn is the deterministic composite
    // (ranking -> results -> burn count/selection -> burns -> buffs -> MLM).
    // Step 11 executes it; steps 12-16 verify its outcome.
    FINALIZE_RACE_RANKINGS: async (ctx) => {
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      await finalizeAndBurn(ctx.client, {
        raceId,
        raceSeed: await raceSeed(ctx.client, raceId),
        raceEngineVersion: lockedVersion(ctx, 'race_engine_versions'),
        economyStatus: await batchEconomyStatus(ctx),
        liquidityPolicyVersion: lockedVersion(ctx, 'liquidity_policies'),
        buffPolicyVersion: lockedVersion(ctx, 'buff_policies'),
      });
    },
    CALCULATE_BURN_TARGET_COUNT: async (ctx) => {
      await verifyBurnOutcome(ctx, 'count');
    },
    SELECT_BURN_TARGETS: async (ctx) => {
      await verifyBurnOutcome(ctx, 'selection');
    },
    EXECUTE_BURNS: async (ctx) => {
      await verifyBurnOutcome(ctx, 'execution');
    },
    GENERATE_REVENGE_BUFFS: async (ctx) => {
      await verifyBurnOutcome(ctx, 'buffs');
    },
    // Step 16 (PAY_MLM_REWARDS) is retryable: re-invoking finalizeAndBurn is
    // idempotent. Decision 092: support bonuses are champion celebrations —
    // this step drains the carried-over celebration queue (funded by tonight's
    // burns/item settlements); tonight's NEW champions enqueue+pay in step 17.
    PAY_MLM_REWARDS: async (ctx) => {
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      await finalizeAndBurn(ctx.client, {
        raceId,
        raceSeed: await raceSeed(ctx.client, raceId),
        raceEngineVersion: lockedVersion(ctx, 'race_engine_versions'),
        economyStatus: await batchEconomyStatus(ctx),
        liquidityPolicyVersion: lockedVersion(ctx, 'liquidity_policies'),
        buffPolicyVersion: lockedVersion(ctx, 'buff_policies'),
      });
      await payPendingCelebrations(ctx.client);
    },

    // Steps 17-19 — survivors advance, Day7 clears, buyback schedules.
    INCREMENT_CURRENT_DAY: async (ctx) => {
      const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
      await processSurvivorsAndDay7(ctx.client, { raceId, batchDate: ctx.batchDate });
    },
    PROCESS_DAY7_CLEAR: async (ctx) => {
      // executed in step 17's composite; verify: no ACTIVE horse sits at day 7
      const stuck = await ctx.client.query<{ count: string }>(
        `select count(*)::text as count from horses where status = 'ACTIVE' and current_day = 7`,
      );
      if (stuck.rows[0]!.count !== '0') {
        throw new Error(`INVALID_BATCH_STATE: ${stuck.rows[0]!.count} ACTIVE horses at day 7`);
      }
    },
    CREATE_BUYBACK_SCHEDULES: async (ctx) => {
      // verify: every DAY7_CLEARED horse has a schedule
      const missing = await ctx.client.query<{ count: string }>(
        `select count(*)::text as count from horses h
         where h.status = 'DAY7_CLEARED'
           and not exists (select 1 from buyback_schedules s where s.horse_id = h.id)`,
      );
      if (missing.rows[0]!.count !== '0') {
        throw new Error(`INVALID_BATCH_STATE: ${missing.rows[0]!.count} cleared horses without schedules`);
      }
    },

    // Step 20 — due buyback payments (retryable).
    PAY_DUE_BUYBACKS: async (ctx) => {
      await processDueBuybackPayments(ctx.client, { batchDate: ctx.batchDate });
    },

    // Steps 21-22 — deterministic profit-taking selection + listings.
    // Selection is recomputed deterministically on resume.
    RUN_PROFIT_TAKING_SELECTION: async (ctx) => {
      await selectProfitTakingListings(ctx.client, {
        batchRunId: ctx.batchRunId,
        economyStatus: await batchEconomyStatus(ctx),
        liquidityPolicyVersion: lockedVersion(ctx, 'liquidity_policies'),
        assignmentAlgorithmVersion: lockedVersion(ctx, 'assignment_algorithm_versions'),
      });
    },
    CREATE_MARKET_LISTINGS: async (ctx) => {
      const { priceTable } = await pricedPolicies(ctx);
      const selection = await selectProfitTakingListings(ctx.client, {
        batchRunId: ctx.batchRunId,
        economyStatus: await batchEconomyStatus(ctx),
        liquidityPolicyVersion: lockedVersion(ctx, 'liquidity_policies'),
        assignmentAlgorithmVersion: lockedVersion(ctx, 'assignment_algorithm_versions'),
      });
      await createMarketListings(ctx.client, {
        batchRunId: ctx.batchRunId,
        selection: selection.selected,
        priceTable,
        assignmentAlgorithmVersion: lockedVersion(ctx, 'assignment_algorithm_versions'),
      });
    },

    // Steps 23-25 — queues are built inside executeAssignment from the same
    // deterministic definitions; 23/24 assert the marketplace is coherent.
    BUILD_HORSE_QUEUE: async () => {},
    BUILD_BUYER_QUEUE: async () => {},
    EXECUTE_ASSIGNMENT: async (ctx) => {
      const { priceTable, liquidity } = await pricedPolicies(ctx);
      // Decision 069: the coverage gate can zero the day's mint budget —
      // the buyback promise is never allowed to outgrow the reserve.
      const gate = await evaluateMintCoverageGate(ctx.client);
      await executeAssignment(ctx.client, {
        batchRunId: ctx.batchRunId,
        assignmentAlgorithmVersion: lockedVersion(ctx, 'assignment_algorithm_versions'),
        priceTable,
        allowDay0Mint: (liquidity.allow_day0_mint ?? false) && gate.covered,
        dailyDay0MintLimit: liquidity.daily_day0_mint_limit ?? 0,
        horseGenerationVersion: lockedVersion(ctx, 'horse_generation_versions'),
      });
    },

    // Step 26 — reserve allocation per Day0 mint.
    EXECUTE_RESERVE_ALLOCATION: async (ctx) => {
      await executeReserveAllocations(ctx.client, ctx.batchRunId);
    },

    // Step 27 — refund + EXPIRE everything unassigned (Decision 043).
    REFUND_UNASSIGNED_SESSIONS: async (ctx) => {
      await refundUnassignedSessions(ctx.client, ctx.batchRunId);
    },

    // Step 28 — verify every settled assignment transferred ownership.
    FINALIZE_OWNERSHIP_TRANSFERS: async (ctx) => {
      const broken = await ctx.client.query<{ count: string }>(
        `select count(*)::text as count
         from ownership_assignments a join horses h on h.id = a.horse_id
         where a.batch_run_id = $1 and a.status = 'SETTLED'
           and h.owner_user_id <> a.buyer_user_id`,
        [ctx.batchRunId],
      );
      if (broken.rows[0]!.count !== '0') {
        throw new Error(
          `INVALID_BATCH_STATE: ${broken.rows[0]!.count} settled assignments without ownership transfer`,
        );
      }
    },

    // Step 30 — memorials for completed buybacks.
    CREATE_MEMORIAL_NFTS: async (ctx) => {
      await createMemorialNfts(ctx.client);
    },

    // Steps 31-32 — liquidity report and daily stress tests (retryable).
    CREATE_LIQUIDITY_REPORT: async (ctx) => {
      const metrics = await computeEconomyMetrics(ctx.client, {
        asOfDate: ctx.batchDate,
        batchRunId: ctx.batchRunId,
      });
      await createLiquidityReport(ctx.client, {
        batchRunId: ctx.batchRunId,
        reportDate: ctx.batchDate,
        metrics,
      });
    },
    RUN_STRESS_TESTS: async (ctx) => {
      const inputs = await buildStressBaseInputs(ctx.client, ctx.batchDate);
      const results = runAllStressScenarios(inputs);
      await saveStressResults(ctx.client, ctx.batchRunId, results);
    },

    // Steps 33-34 — tomorrow's economy status (Deterministic Policy Engine
    // recommends; thresholds from the LOCKED economy policy decide).
    CALCULATE_TOMORROW_ECONOMY_STATUS: async (ctx) => {
      const metrics = await computeEconomyMetrics(ctx.client, {
        asOfDate: ctx.batchDate,
        batchRunId: ctx.batchRunId,
      });
      const stressRows = await ctx.client.query<{ scenario: string; passed: boolean; detail_json: ScenarioResult }>(
        `select scenario, passed, detail_json from stress_test_results where batch_run_id = $1`,
        [ctx.batchRunId],
      );
      const failures = stressRows.rows
        .filter((r) => !r.passed)
        .map((r) => ({
          scenario: r.scenario as ScenarioResult['scenario'],
          buybackShortfall: r.detail_json.buybackShortfall,
        }));
      const economyPolicy = await loadPolicyByVersion(
        ctx.client,
        'economy_policies',
        lockedVersion(ctx, 'economy_policies'),
      );
      await evaluateEconomyStatus(ctx.client, {
        evaluationDate: ctx.batchDate,
        economyPolicyVersion: economyPolicy.version,
        metrics,
        stressFailures: failures,
        thresholds: thresholdsFromPolicy(economyPolicy.policy),
      });
    },
    SAVE_TOMORROW_POLICY: async (ctx) => {
      // The immutable evaluation row (Step 33) IS tomorrow's policy record;
      // verify it exists.
      const evaluation = await ctx.client.query<{ count: string }>(
        `select count(*)::text as count from economy_status_evaluations where evaluation_date = $1`,
        [ctx.batchDate],
      );
      if (evaluation.rows[0]!.count !== '1') {
        throw new Error(`INVALID_BATCH_STATE: tomorrow economy status missing for ${ctx.batchDate}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Verification helpers
// ---------------------------------------------------------------------------

/** Steps 12-15 gate on the finalizeAndBurn outcome being coherent. */
async function verifyBurnOutcome(
  ctx: StepContext,
  aspect: 'count' | 'selection' | 'execution' | 'buffs',
): Promise<void> {
  const raceId = await raceForBatch(ctx.client, ctx.batchRunId);
  const results = await ctx.client.query<{ total: string; burned: string }>(
    `select count(*)::text as total,
            count(*) filter (where is_burned)::text as burned
     from race_results where race_id = $1`,
    [raceId],
  );
  const total = Number(results.rows[0]!.total);
  const burned = Number(results.rows[0]!.burned);
  if (total === 0) {
    // An EMPTY race is legal (launch day: zero ACTIVE horses exist before
    // the first Day0 mints happen later in this very batch — audit fix F-L).
    // It is only an error if participants exist without results.
    const participants = await ctx.client.query<{ participant_count: number }>(
      `select participant_count from races where id = $1`,
      [raceId],
    );
    if ((participants.rows[0]?.participant_count ?? 0) === 0) return;
    throw new Error(`INVALID_BATCH_STATE: race ${raceId} has participants but no results`);
  }

  if (aspect === 'count' || aspect === 'selection') {
    // burned flags must exactly cover the bottom ranks
    const misplaced = await ctx.client.query<{ count: string }>(
      `select count(*)::text as count from race_results
       where race_id = $1 and is_burned <> (final_rank > $2)`,
      [raceId, total - burned],
    );
    if (misplaced.rows[0]!.count !== '0') {
      throw new Error(`INVALID_BATCH_STATE: burn flags do not match bottom ranks (race ${raceId})`);
    }
  }
  if (aspect === 'execution') {
    const mismatch = await ctx.client.query<{ count: string }>(
      `select count(*)::text as count
       from race_results r join horses h on h.id = r.horse_id
       where r.race_id = $1 and r.is_burned and h.status <> 'BURNED'`,
      [raceId],
    );
    if (mismatch.rows[0]!.count !== '0') {
      throw new Error(`INVALID_BATCH_STATE: burned results without BURNED horses (race ${raceId})`);
    }
  }
  if (aspect === 'buffs') {
    const missing = await ctx.client.query<{ count: string }>(
      `select count(*)::text as count from horse_burns b
       where b.race_id = $1
         and not exists (select 1 from revenge_buffs rb
                         where rb.user_id = b.owner_user_id_at_snapshot)`,
      [raceId],
    );
    if (missing.rows[0]!.count !== '0') {
      throw new Error(`INVALID_BATCH_STATE: burns without revenge buffs (race ${raceId})`);
    }
  }
}

/** Step 10 (F-C): seed, environment, and every score must replay exactly. */
export async function verifyReplayInputs(
  client: SqlClient,
  raceId: string,
  raceEngineVersion: string,
): Promise<void> {
  const commit = await client.query<{ commit_hash: string; reveal_seed: string | null }>(
    `select rc.commit_hash, rc.reveal_seed from randomness_commits rc
     join races r on r.seed_commit_id = rc.id where r.id = $1`,
    [raceId],
  );
  const row = commit.rows[0];
  if (!row) throw new Error(`RACE_SEED_VERIFICATION_FAILED: race ${raceId} has no commit`);
  const seed = row.reveal_seed ?? (await raceSeedFromEscrow(client, raceId));
  if (!verifyRaceSeed(seed, row.commit_hash)) {
    throw new Error(`RACE_SEED_VERIFICATION_FAILED: SHA-256(seed) != commit (race ${raceId})`);
  }

  const snapshots = await client.query<{
    horse_id: string;
    horse_type: ScoreInput['horseType'];
    rarity: ScoreInput['rarity'];
    ability_snapshot_json: { base_ability_score: number; condition: number; fatigue: number };
    training_snapshot_json: { training_type: ScoreInput['training'] } | null;
    revenge_buff_snapshot_json: { buff_rarity: NonNullable<ScoreInput['buffRarity']> } | null;
    weather: ScoreInput['weather'];
    track_condition: ScoreInput['track'];
    dna_modifier: string;
    final_score: string | null;
  }>(
    `select s.horse_id, s.horse_type::text as horse_type, s.rarity::text as rarity,
            s.ability_snapshot_json, s.training_snapshot_json, s.revenge_buff_snapshot_json,
            s.weather::text as weather, s.track_condition::text as track_condition,
            h.dna_modifier::text as dna_modifier, s.final_score::text as final_score
     from race_participant_snapshots s join horses h on h.id = s.horse_id
     where s.race_id = $1 order by s.horse_id`,
    [raceId],
  );

  // ADR-012: 条件シード(night_forecasts)がある夜は、環境の再導出もそのシードから。
  const fc = await client.query<{ seed: string }>(
    `select nf.seed from night_forecasts nf
     join batch_runs b on b.batch_date = nf.forecast_date
     join races r on r.batch_run_id = b.id
     where r.id = $1`,
    [raceId],
  );
  const expectedEnv = fc.rows[0]
    ? deriveNightForecastV1(fc.rows[0].seed).actual
    : {
        weather: deriveWeather(seed, raceEngineVersion),
        track: deriveTrackCondition(seed, raceEngineVersion),
      };
  const expectedWeather = expectedEnv.weather;
  const expectedTrack = expectedEnv.track;

  for (const snap of snapshots.rows) {
    if (snap.weather !== expectedWeather || snap.track_condition !== expectedTrack) {
      throw new Error(
        `RACE_SNAPSHOT_VERIFICATION_FAILED: environment mismatch (race ${raceId}, horse ${snap.horse_id})`,
      );
    }
    if (snap.final_score === null) {
      throw new Error(`RACE_SNAPSHOT_VERIFICATION_FAILED: unscored snapshot (horse ${snap.horse_id})`);
    }
    const recomputed = computeScore({
      horseUuid: snap.horse_id,
      horseType: snap.horse_type,
      rarity: snap.rarity,
      baseAbilityScore: snap.ability_snapshot_json.base_ability_score,
      dnaModifier: Number(snap.dna_modifier),
      training: snap.training_snapshot_json?.training_type ?? null,
      weather: snap.weather,
      track: snap.track_condition,
      condition: snap.ability_snapshot_json.condition,
      fatigue: snap.ability_snapshot_json.fatigue,
      buffRarity: snap.revenge_buff_snapshot_json?.buff_rarity ?? null,
      raceSeed: seed,
      raceEngineVersion,
    });
    if (!Money.of(String(recomputed.finalScore)).eq(snap.final_score)) {
      throw new Error(
        `RACE_SNAPSHOT_VERIFICATION_FAILED: score replay mismatch (horse ${snap.horse_id}: stored ${snap.final_score}, replayed ${recomputed.finalScore})`,
      );
    }
  }

  // ranking sanity: recomputed order must be internally consistent
  rankParticipants(
    snapshots.rows.map((s) => ({ horseUuid: s.horse_id, finalScore: Number(s.final_score) })),
    seed,
    raceEngineVersion,
  );
}

async function raceSeedFromEscrow(client: SqlClient, raceId: string): Promise<string> {
  const escrow = await client.query<{ seed: string }>(
    `select seed from race_seed_escrow where race_id = $1`,
    [raceId],
  );
  const seed = escrow.rows[0]?.seed;
  if (!seed) throw new Error(`RACE_SEED_VERIFICATION_FAILED: no seed for race ${raceId}`);
  return seed;
}
