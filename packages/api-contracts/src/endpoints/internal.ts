import { z } from 'zod';
import {
  runBatch,
  buildProductionHandlers,
  executeRecovery,
  checkRecoveryTimeouts,
  processDueBuybackPayments,
  createLiquidityReport,
  buildStressBaseInputs,
  saveStressResults,
} from '@sevendays/settlement-engine';
import { computeEconomyMetrics, runAllStressScenarios } from '@sevendays/economy-engine';
import { batchDateFor } from '@sevendays/shared';
import { ApiError } from '../errors.js';
import type { ApiRegistry } from '../router.js';
import { buildWebPushTransport } from '../push/webpush.js';
import { hasBroadcast, raceReminderMessage, raceStartMessage, sendNightlyBroadcast } from '../push/broadcast.js';
import { runMarketPostBatch } from '../market/post-batch.js';

/**
 * Internal APIs (07_API.md) — Cloud Run service authentication ONLY.
 * External access is rejected at the auth gate. The daily batch is the
 * primary entry point; the step endpoints exist for targeted worker
 * invocation and all route through the same idempotent functions.
 */

const dateInput = z.object({
  batch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'batch_date must be YYYY-MM-DD'),
});

// Cloud Scheduler cannot compute dates: omitted batch_date means "today in
// MYT" (Decision 047 — the batch day is the MYT calendar day).
const schedulableDateInput = z.object({
  batch_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'batch_date must be YYYY-MM-DD')
    .optional(),
});

export function registerInternalEndpoints(registry: ApiRegistry): void {
  registry.register({
    method: 'POST',
    path: '/internal/batch/start',
    auth: 'internal',
    input: schedulableDateInput,
    handler: async (ctx, input) => {
      const batchDate = input.batch_date ?? batchDateFor(new Date());
      // 「レース開始」プッシュ(Decision 084)— 主経路は5分前リマインド
      // (/internal/push/race-reminder)。ここはワーカーが窓を逃した夜のフォールバック。
      // broadcast_keyで冪等(再実行でも1晩1回)、VAPID未設定ではスキップ、
      // いかなる失敗もバッチを止めない。
      const transport = buildWebPushTransport();
      if (transport) {
        try {
          if (!(await hasBroadcast(ctx.client, `race-soon:${batchDate}`))) {
            await sendNightlyBroadcast(ctx.client, {
              broadcastKey: `race-start:${batchDate}`,
              message: raceStartMessage(),
              transport,
            });
          }
        } catch {
          // 通知はベストエフォート — 精算バッチの成否に関与させない
        }
      }
      const result = await runBatch(ctx.client, {
        batchDate,
        handlers: buildProductionHandlers(),
      });
      return result;
    },
  });

  // 発走5分前リマインド(Decision 084)。ワーカーのスケジューラーが
  // 19:55 MYT の窓で叩く。ブロードキャストの一意クレームが冪等性を担保。
  registry.register({
    method: 'POST',
    path: '/internal/push/race-reminder',
    auth: 'internal',
    input: schedulableDateInput,
    handler: async (ctx, input) => {
      const batchDate = input.batch_date ?? batchDateFor(new Date());
      const transport = buildWebPushTransport();
      if (!transport) return { skipped: true, reason: 'VAPID not configured' };
      return sendNightlyBroadcast(ctx.client, {
        broadcastKey: `race-soon:${batchDate}`,
        message: raceReminderMessage(),
        transport,
      });
    },
  });

  // バッチ後スイープ(Decision 086): 自動購入予約+売却メール。ワーカーが当日バッチ
  // COMPLETED後に叩く。全処理冪等(再実行・多重呼び出しは収束する)。
  registry.register({
    method: 'POST',
    path: '/internal/market/post-batch',
    auth: 'internal',
    input: schedulableDateInput,
    handler: async (ctx, input) => {
      const batchDate = input.batch_date ?? batchDateFor(new Date());
      return runMarketPostBatch(ctx.client, batchDate);
    },
  });

  // Targeted step invocations — same functions the batch uses (idempotent).
  const stepAliases: Record<string, string[]> = {
    '/internal/race/run': ['CREATE_RACES', 'COMMIT_RACE_SEEDS', 'CREATE_PARTICIPANT_SNAPSHOTS', 'RUN_RACE_ENGINE', 'REVEAL_RACE_SEEDS', 'VERIFY_RACE_REPLAY_INPUTS'],
    '/internal/burn/run': ['FINALIZE_RACE_RANKINGS', 'CALCULATE_BURN_TARGET_COUNT', 'SELECT_BURN_TARGETS', 'EXECUTE_BURNS', 'GENERATE_REVENGE_BUFFS'],
    '/internal/mlm/pay': ['PAY_MLM_REWARDS'],
    '/internal/assignment/run': ['RUN_PROFIT_TAKING_SELECTION', 'CREATE_MARKET_LISTINGS', 'BUILD_HORSE_QUEUE', 'BUILD_BUYER_QUEUE', 'EXECUTE_ASSIGNMENT', 'EXECUTE_RESERVE_ALLOCATION', 'REFUND_UNASSIGNED_SESSIONS'],
  };
  for (const [path, stepKeys] of Object.entries(stepAliases)) {
    registry.register({
      method: 'POST',
      path,
      auth: 'internal',
      input: dateInput.extend({ batch_run_id: z.string().uuid() }),
      handler: async (ctx, input) => {
        const handlers = buildProductionHandlers();
        const locked = await ctx.client.query<{ locked: Record<string, string> | null }>(
          `select locked_policy_versions_json as locked from batch_runs where id = $1`,
          [input.batch_run_id],
        );
        if (!locked.rows[0]) throw new ApiError('NOT_FOUND', 'Batch not found');
        for (const key of stepKeys) {
          const handler = handlers[key];
          if (!handler) continue;
          await handler({
            client: ctx.client,
            batchRunId: input.batch_run_id,
            batchDate: input.batch_date,
            stepNumber: 0,
            stepKey: key,
            idempotencyKey: `manual:${input.batch_run_id}:${key}`,
            traceId: `internal:${path}`,
            lockedPolicyVersions: locked.rows[0].locked,
          });
        }
        return { executed: stepKeys };
      },
    });
  }

  registry.register({
    method: 'POST',
    path: '/internal/buyback/pay',
    auth: 'internal',
    input: dateInput,
    handler: async (ctx, input) => {
      const result = await processDueBuybackPayments(ctx.client, { batchDate: input.batch_date });
      return result;
    },
  });

  registry.register({
    method: 'POST',
    path: '/internal/recovery/run',
    auth: 'internal',
    input: z.object({ recovery_id: z.string().uuid(), executed_by: z.string().uuid() }),
    handler: async (ctx, input) => {
      const result = await executeRecovery(ctx.client, {
        recoveryId: input.recovery_id,
        executedBy: input.executed_by,
        handlers: buildProductionHandlers(),
      });
      return result;
    },
  });

  registry.register({
    method: 'POST',
    path: '/internal/recovery/check-timeouts',
    auth: 'internal',
    input: schedulableDateInput,
    handler: async (ctx, input) => {
      const timedOut = await checkRecoveryTimeouts(ctx.client, input.batch_date ?? batchDateFor(new Date()));
      return { timed_out: timedOut };
    },
  });

  registry.register({
    method: 'POST',
    path: '/internal/stress/run',
    auth: 'internal',
    input: dateInput.extend({ batch_run_id: z.string().uuid() }),
    handler: async (ctx, input) => {
      const inputs = await buildStressBaseInputs(ctx.client, input.batch_date);
      const results = runAllStressScenarios(inputs);
      await saveStressResults(ctx.client, input.batch_run_id, results);
      return { results };
    },
  });

  registry.register({
    method: 'POST',
    path: '/internal/liquidity/report',
    auth: 'internal',
    input: dateInput.extend({ batch_run_id: z.string().uuid() }),
    handler: async (ctx, input) => {
      const metrics = await computeEconomyMetrics(ctx.client, {
        asOfDate: input.batch_date,
        batchRunId: input.batch_run_id,
      });
      await createLiquidityReport(ctx.client, {
        batchRunId: input.batch_run_id,
        reportDate: input.batch_date,
        metrics,
      });
      return { metrics };
    },
  });
}
