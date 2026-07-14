import { AdminDashboardView } from '@/components/AdminDashboardView';
import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { AdminEconomyView } from '@/components/AdminEconomyView';
import { AdminItemsView } from '@/components/AdminItemsView';
import { AdminRacesView } from '@/components/AdminRacesView';
import { AdminBatchesView } from '@/components/AdminBatchesView';
import { AdminWithdrawalsView } from '@/components/AdminWithdrawalsView';
import { AdminRecoveryView } from '@/components/AdminRecoveryView';
import { AdminAuditLog } from '@/components/AdminAuditLog';
import { AdminNav } from '@/components/AdminNav';

/* 視覚QA専用(仮データ)。本番挙動は /admin(要admin権限)。 */

export default async function AdminPreviewPage() {
  await requireDevPreviewAccess();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      <AdminNav />
      {/* コックピット: 要対応あり(出金/CS/リカバリ+バッチ異常)の状態 */}
      <AdminDashboardView
        data={{
          dashboard: {
            latest_batch: { id: 'b1', batch_date: '2026-07-08', status: 'PARTIAL_FAILED' },
            economy_status: 'NORMAL',
            metrics: { burn_rate: 0.42, prize_pool_days: 12 },
          },
          derby: {
            next_derby_at: new Date(Date.now() + 2 * 3600_000 + 31 * 60_000).toISOString(),
            server_time: new Date().toISOString(),
            tonight_field: { entrants: 14, burn_slots_min: 1, burn_slots_max: 1 },
          },
          pending: {
            withdrawals: { count: 1, total: 1520 },
            cs: 3,
            recovery: 1,
          },
          last_race: {
            batch_date: '2026-07-08',
            status: 'SETTLED',
            participant_count: 12,
            burns: 2,
            item_usages: 6,
            weather: 'RAIN',
            track_condition: 'HEAVY',
            surface: 'DIRT',
          },
        }}
      />
      {/* コックピット: 全て正常(要対応ゼロ)の状態 */}
      <AdminDashboardView
        data={{
          dashboard: {
            latest_batch: { id: 'b2', batch_date: '2026-07-08', status: 'COMPLETED' },
            economy_status: 'NORMAL',
            metrics: { burn_rate: 0.42, prize_pool_days: 12 },
          },
          derby: {
            next_derby_at: new Date(Date.now() + 45 * 60_000).toISOString(),
            server_time: new Date().toISOString(),
            tonight_field: { entrants: 100, burn_slots_min: 8, burn_slots_max: 13 },
          },
          pending: { withdrawals: { count: 0, total: 0 }, cs: 0, recovery: 0 },
          last_race: {
            batch_date: '2026-07-08',
            status: 'SETTLED',
            participant_count: 12,
            burns: 2,
            item_usages: 6,
            weather: 'SUNNY',
            track_condition: 'GOOD',
            surface: 'TURF',
          },
        }}
      />
      <AdminEconomyView
        data={{
          platform_accounts: [
            { account_type: 'MLM_RESERVE', balance: '10234.55' },
            { account_type: 'OPERATING', balance: '20991.02' },
            { account_type: 'PRIZE_POOL', balance: '5410.00' },
            { account_type: 'PLATFORM_ITEM_CLEARING', balance: '0' },
          ],
          user_totals: [{ account_type: 'USER_AVAILABLE', holders: 132, total: '48211.90' }],
          users: { total: 140, active: 132 },
          horses: { total: 260, active: 118 },
          recent_transactions: [
            { transaction_type: 'ITEM_PURCHASE', count: 34, last_at: '2026-07-08T19:31:00' },
            { transaction_type: 'BURN_SETTLEMENT', count: 18, last_at: '2026-07-08T20:02:11' },
          ],
        }}
      />
      <AdminItemsView
        data={{
          catalog: [
            { key: 'sugar_cube', name_ja: '角砂糖', band: 'BASIC', price: '1', active: true, purchased: 120, revenue: '120', dropped: 0, gifted: 4, used: 88 },
            { key: 'golden_horseshoe', name_ja: '黄金の蹄鉄', band: 'PREMIUM', price: '30', active: true, purchased: 8, revenue: '240', dropped: 0, gifted: 1, used: 6 },
            { key: 'phoenix_feather', name_ja: '不死鳥の羽根', band: 'BURN_DROP', price: '0', active: true, purchased: 0, revenue: '0', dropped: 12, gifted: 2, used: 5 },
          ],
          condition_distribution: [
            { weather: 'SUNNY', track: 'GOOD', surface: 'TURF', count: 9 },
            { weather: 'RAIN', track: 'HEAVY', surface: 'DIRT', count: 2 },
          ],
        }}
      />
      <AdminRacesView
        data={{
          races: [
            { id: '3f6a1c2e-0000-0000-0000-000000000001', batch_date: '2026-07-08', status: 'SETTLED', participant_count: 18, weather: 'SUNNY', track_condition: 'GOOD', surface: 'TURF', burns: 3, item_usages: 11, completed_at: '2026-07-08T20:05:00' },
            { id: '3f6a1c2e-0000-0000-0000-000000000002', batch_date: '2026-07-07', status: 'SETTLED', participant_count: 12, weather: 'RAIN', track_condition: 'HEAVY', surface: 'DIRT', burns: 2, item_usages: 6, completed_at: '2026-07-07T20:05:00' },
          ],
          daily_derby_live: false,
        }}
      />
      <AdminBatchesView
        batches={[
          { id: 'b1', batch_date: '2026-07-08', status: 'COMPLETED', completed_at: '2026-07-08T20:05:00', failed_at: null, completed_steps: 37 },
          { id: 'b2', batch_date: '2026-07-07', status: 'PARTIAL_FAILED', completed_at: null, failed_at: '2026-07-07T20:06:12', completed_steps: 34 },
          { id: 'b3', batch_date: '2026-07-06', status: 'COMPLETED', completed_at: '2026-07-06T20:04:41', failed_at: null, completed_steps: 37 },
          { id: 'b4', batch_date: '2026-07-05', status: 'FAILED', completed_at: null, failed_at: '2026-07-05T20:03:09', completed_steps: 21 },
        ]}
      />
      <AdminWithdrawalsView
        withdrawals={[
          {
            id: 'w1', user_id: 'u1', chain_id: '137', to_address: '0x9a11bb22cc33dd44ee55ff66aa77bb88cc99dde1',
            requested_amount: '1520.00', status: 'REVIEW', requested_at: '2026-07-08T18:12:44',
            approvals: [{ admin_user_id: 'a1', role: 'FINANCE_ADMIN' }],
          },
        ]}
      />
      <AdminRecoveryView
        recoveries={[
          {
            id: 'r1', batch_date: '2026-07-05', batch_status: 'FAILED', recovery_reason: 'RUN_RACE_ENGINE step crashed (engine mismatch)',
            approval_status: 'PENDING_APPROVAL', approved_by_1: 'a1', approved_by_2: null,
            created_at: '2026-07-05T21:00:00', completed_at: null,
          },
        ]}
      />
      <AdminAuditLog
        audit={[
          { actor_type: 'SYSTEM', actor_id: null, action: 'BATCH_SETTLED', reference_type: 'batch', reference_id: '2026-07-08', created_at: '2026-07-08T20:05:02' },
          { actor_type: 'ADMIN', actor_id: 'fin-02', action: 'FUND_GRANT_APPROVED', reference_type: 'grant', reference_id: '8831', created_at: '2026-07-08T19:41:18' },
          { actor_type: 'ADMIN', actor_id: 'sup-01', action: 'USER_SUSPENDED', reference_type: 'user', reference_id: '3f6a9c', created_at: '2026-07-08T19:38:55' },
          { actor_type: 'SYSTEM', actor_id: null, action: 'DEPOSIT_DETECTED', reference_type: 'tx', reference_id: '0x9ae1', created_at: '2026-07-08T18:22:07' },
        ]}
      />
    </div>
  );
}
