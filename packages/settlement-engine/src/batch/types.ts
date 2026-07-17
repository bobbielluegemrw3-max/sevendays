import type { SqlClient } from '@sevendays/shared';
import type { BatchStatus, RaceSlotV2 } from '@sevendays/domain';
import type { PolicyTable } from '@sevendays/economy-engine';

/** Context passed to every step handler (05_SETTLEMENT_ENGINE.md, 08 Pub/Sub message fields). */
export interface StepContext {
  client: SqlClient;
  batchRunId: string;
  /** MYT calendar date (Decision 047). */
  batchDate: string;
  /** Race slot (Decision 102). V1 cadence runs NIGHT only. */
  slot: RaceSlotV2;
  stepNumber: number;
  stepKey: string;
  /** Stable per-step idempotency key — identical across retries. */
  idempotencyKey: string;
  traceId: string;
  /** Locked at Step 3; null only while steps 1-2 execute. */
  lockedPolicyVersions: Record<PolicyTable, string> | null;
}

export type StepHandler = (ctx: StepContext) => Promise<void>;

/** Domain-step handlers supplied by later phases (race, burn, assignment...). */
export type StepHandlers = Partial<Record<string, StepHandler>>;

export interface BatchResult {
  batchRunId: string;
  batchDate: string;
  slot: RaceSlotV2;
  status: BatchStatus;
  /** Set when the batch stopped on a failing step. */
  failedStepKey?: string;
  failedStepNumber?: number;
  errorMessage?: string;
}

export class BatchError extends Error {
  constructor(
    readonly code: 'INVALID_BATCH_STATE' | 'RECOVERY_REQUIRED',
    message: string,
  ) {
    super(message);
    this.name = 'BatchError';
  }
}
