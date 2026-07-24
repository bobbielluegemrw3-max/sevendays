import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '@sevendays/database';
import type { SqlClient } from '@sevendays/shared';
import {
  POLICY_TABLES,
  PolicyError,
  loadActivePolicy,
  loadPolicyByVersion,
  createPolicyVersion,
  activatePolicy,
  lockPolicyVersions,
  validatePriceTable,
  getPrice,
  validateReservePolicy,
  type PriceTablePolicy,
  type ReservePolicy,
} from '../src/index.js';

let client: SqlClient;

beforeAll(async () => {
  client = await createTestDb();
});

describe('policy loader', () => {
  it('loads the seeded active policy of every table', async () => {
    for (const table of POLICY_TABLES) {
      const record = await loadActivePolicy(client, table);
      // liquidity policy was superseded by v1.1 (Decision 069);
      // race engine by v1.1 (ADR-012 burn-rate jitter, 2026-07-10).
      const expected =
        table === 'liquidity_policies' || table === 'race_engine_versions' ? /v1\.1$/ : /v1\.0$/;
      expect(record.version, table).toMatch(expected);
      expect(record.activatedAt).not.toBeNull();
    }
  });

  it('loads a specific version for replay', async () => {
    const record = await loadPolicyByVersion<PriceTablePolicy>(
      client,
      'price_tables',
      'price_table_v1.0',
    );
    expect(record.policy.prices['0']).toBe('100.00');
  });

  it('rejects unknown policy tables (no SQL injection surface)', async () => {
    await expect(
      // @ts-expect-error runtime table validation
      loadActivePolicy(client, 'users; drop table users;'),
    ).rejects.toThrow(PolicyError);
  });

  it('activates a new version and retires the old one atomically', async () => {
    await createPolicyVersion(client, 'liquidity_policies', 'liquidity_policy_v1.1-test', {
      note: 'test version',
    });
    // not active yet
    const stillV11 = await loadActivePolicy(client, 'liquidity_policies');
    expect(stillV11.version).toBe('liquidity_policy_v1.1');

    await activatePolicy(client, 'liquidity_policies', 'liquidity_policy_v1.1-test');
    const nowV11 = await loadActivePolicy(client, 'liquidity_policies');
    expect(nowV11.version).toBe('liquidity_policy_v1.1-test');

    // old version is retired but still loadable by version (replay/audit)
    const old = await loadPolicyByVersion(client, 'liquidity_policies', 'liquidity_policy_v1.0');
    expect(old.version).toBe('liquidity_policy_v1.0');
  });

  it('cannot re-activate a retired version (DB immutability)', async () => {
    await expect(
      activatePolicy(client, 'liquidity_policies', 'liquidity_policy_v1.0'),
    ).rejects.toThrow();
  });

  it('locks all active policy versions for a batch (Step 3)', async () => {
    const locked = await lockPolicyVersions(client);
    expect(Object.keys(locked)).toHaveLength(POLICY_TABLES.length);
    expect(locked.price_tables).toBe('price_table_v1.0');
    expect(locked.reserve_policies).toBe('reserve_policy_v1.0');
    expect(locked.liquidity_policies).toBe('liquidity_policy_v1.1-test');
  });
});

describe('price table policy', () => {
  it('v1.0 seeded table is valid and getPrice matches the spec', async () => {
    const { policy } = await loadActivePolicy<PriceTablePolicy>(client, 'price_tables');
    validatePriceTable(policy);
    expect(getPrice(policy, 0).toFixed8()).toBe('100.00000000');
    expect(getPrice(policy, 3).toFixed8()).toBe('133.10000000');
    expect(getPrice(policy, 6).toFixed8()).toBe('177.16000000');
    // total_value 未指定=従来の階段(後方互換)
    expect(getPrice(policy, 3, null).toFixed8()).toBe('133.10000000');
  });

  it('variable price band (FUN_V3 §4): floor=ladder, cap≤177.16, matches plan table', async () => {
    const { policy } = await loadActivePolicy<PriceTablePolicy>(client, 'price_tables');
    // tv=FLOOR(40) → プレミアム0 = 従来の階段価格。
    expect(getPrice(policy, 1, 40).toFixed8()).toBe('110.00000000');
    expect(getPrice(policy, 3, 40).toFixed8()).toBe('133.10000000');
    // tv=CAP(85) → バンド最大(plan §4 表と一致・全日 ≤177.16<買戻し200)。
    expect(getPrice(policy, 1, 85).toFixed8()).toBe('137.50000000'); // 110×1.25
    expect(getPrice(policy, 2, 85).toFixed8()).toBe('145.20000000'); // 121×1.20
    expect(getPrice(policy, 3, 85).toFixed8()).toBe('153.06000000'); // 133.10×1.15 floor
    expect(getPrice(policy, 4, 85).toFixed8()).toBe('161.05000000'); // 146.41×1.10 floor
    expect(getPrice(policy, 5, 85).toFixed8()).toBe('169.10000000'); // 161.05×1.05 floor
    expect(getPrice(policy, 6, 85).toFixed8()).toBe('177.16000000'); // Day6 固定(+0%)
    // tv > CAP はクランプ(バンド最大)・tv < FLOOR はクランプ(階段)。
    expect(getPrice(policy, 3, 100).toFixed8()).toBe('153.06000000');
    expect(getPrice(policy, 3, 10).toFixed8()).toBe('133.10000000');
    // 中間 tv=62.5 (相対位置0.5) → Day3 は 133.10×(1+0.15×0.5)=143.08(floor)。
    expect(getPrice(policy, 3, 62.5).toFixed8()).toBe('143.08000000');
  });

  it('rejects day 7 (buyback, not a P2P price) and invalid tables', () => {
    const policy: PriceTablePolicy = {
      prices: { 0: '100.00', 1: '110.00', 2: '121.00', 3: '133.10', 4: '146.41', 5: '161.05', 6: '177.16' },
      buyback_total: '200.00',
      purchase_lock_amount: '177.16',
    };
    expect(() => getPrice(policy, 7)).toThrow(PolicyError);

    const badLock = { ...policy, purchase_lock_amount: '100.00' };
    expect(() => validatePriceTable(badLock)).toThrow(PolicyError);

    const badBuyback = { ...policy, buyback_total: '150.00' };
    expect(() => validatePriceTable(badBuyback)).toThrow(PolicyError);
  });
});

describe('reserve policy', () => {
  it('v1.0 seeded allocation sums to the mint price', async () => {
    const { policy } = await loadActivePolicy<ReservePolicy>(client, 'reserve_policies');
    validateReservePolicy(policy);
    expect(policy.allocation.PLATFORM_BUYBACK_RESERVE).toBe('93.60');
  });

  it('rejects allocations that do not sum to the mint price', () => {
    const bad: ReservePolicy = {
      mint_price: '100.00',
      allocation: {
        PLATFORM_BUYBACK_RESERVE: '93.60',
        PLATFORM_MLM_RESERVE: '5.40',
        PLATFORM_OPERATING_RESERVE: '0.70',
        PLATFORM_EMERGENCY_RESERVE: '0.40', // 100.10 total
      },
    };
    expect(() => validateReservePolicy(bad)).toThrow(PolicyError);
  });

  it('rejects allocations missing a required reserve', () => {
    const bad = {
      mint_price: '100.00',
      allocation: { PLATFORM_BUYBACK_RESERVE: '100.00' },
    } as ReservePolicy;
    expect(() => validateReservePolicy(bad)).toThrow(PolicyError);
  });
});
