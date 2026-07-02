import type { SqlClient } from '@sevendays/shared';

/**
 * Versioned policy loader (06_DATABASE.md policy tables).
 * Policies are immutable after activation (enforced by DB triggers);
 * change happens ONLY by creating and activating a new version.
 */

export const POLICY_TABLES = [
  'liquidity_policies',
  'reserve_policies',
  'buff_policies',
  'price_tables',
  'assignment_algorithm_versions',
  'race_engine_versions',
  'economy_policies',
  'horse_generation_versions',
] as const;
export type PolicyTable = (typeof POLICY_TABLES)[number];

export class PolicyError extends Error {
  constructor(
    readonly code: 'POLICY_NOT_FOUND' | 'POLICY_INVALID' | 'POLICY_TABLE_UNKNOWN',
    message: string,
  ) {
    super(message);
    this.name = 'PolicyError';
  }
}

function assertPolicyTable(table: string): asserts table is PolicyTable {
  if (!POLICY_TABLES.includes(table as PolicyTable)) {
    throw new PolicyError('POLICY_TABLE_UNKNOWN', `Unknown policy table: ${table}`);
  }
}

export interface PolicyRecord<T> {
  version: string;
  policy: T;
  activatedAt: string | null;
}

/** The single currently-active policy version of a table. */
export async function loadActivePolicy<T>(
  client: SqlClient,
  table: PolicyTable,
): Promise<PolicyRecord<T>> {
  assertPolicyTable(table);
  const r = await client.query<{ version: string; policy_json: T; activated_at: string }>(
    `select version, policy_json, activated_at::text as activated_at
     from ${table}
     where activated_at is not null and deactivated_at is null
     order by activated_at desc`,
  );
  if (r.rows.length === 0) {
    throw new PolicyError('POLICY_NOT_FOUND', `No active policy in ${table}`);
  }
  if (r.rows.length > 1) {
    throw new PolicyError(
      'POLICY_INVALID',
      `${table} has ${r.rows.length} active versions; exactly one expected`,
    );
  }
  const row = r.rows[0]!;
  return { version: row.version, policy: row.policy_json, activatedAt: row.activated_at };
}

/** A specific policy version (for replay and audit — any version, active or not). */
export async function loadPolicyByVersion<T>(
  client: SqlClient,
  table: PolicyTable,
  version: string,
): Promise<PolicyRecord<T>> {
  assertPolicyTable(table);
  const r = await client.query<{ version: string; policy_json: T; activated_at: string | null }>(
    `select version, policy_json, activated_at::text as activated_at
     from ${table} where version = $1`,
    [version],
  );
  const row = r.rows[0];
  if (!row) {
    throw new PolicyError('POLICY_NOT_FOUND', `${table} has no version ${version}`);
  }
  return { version: row.version, policy: row.policy_json, activatedAt: row.activated_at };
}

/** Create a new (inactive) policy version. */
export async function createPolicyVersion(
  client: SqlClient,
  table: PolicyTable,
  version: string,
  policy: unknown,
): Promise<void> {
  assertPolicyTable(table);
  await client.query(`insert into ${table} (version, policy_json) values ($1, $2)`, [
    version,
    JSON.stringify(policy),
  ]);
}

/**
 * Activate a policy version: the current active version (if any) is
 * deactivated and the new one activated, atomically.
 */
export async function activatePolicy(
  client: SqlClient,
  table: PolicyTable,
  version: string,
): Promise<void> {
  assertPolicyTable(table);
  await client.query('begin');
  try {
    await client.query(
      `update ${table} set deactivated_at = now()
       where activated_at is not null and deactivated_at is null and version <> $1`,
      [version],
    );
    const r = await client.query(
      `update ${table} set activated_at = now()
       where version = $1 and activated_at is null`,
      [version],
    );
    if ((r.affectedRows ?? 0) !== 1) {
      throw new PolicyError(
        'POLICY_NOT_FOUND',
        `${table} version ${version} does not exist or is already activated/retired`,
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

/**
 * Batch Step 3 — Lock Policy Versions: capture the exact active version of
 * every policy table for the batch run. Stored in
 * batch_runs.locked_policy_versions_json and referenced by all later steps.
 */
export async function lockPolicyVersions(
  client: SqlClient,
): Promise<Record<PolicyTable, string>> {
  const locked = {} as Record<PolicyTable, string>;
  for (const table of POLICY_TABLES) {
    const { version } = await loadActivePolicy(client, table);
    locked[table] = version;
  }
  return locked;
}
