import { AdminDashboardView } from '@/components/AdminDashboardView';
import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { AdminEconomyView } from '@/components/AdminEconomyView';
import { AdminItemsView } from '@/components/AdminItemsView';
import { AdminRacesView } from '@/components/AdminRacesView';

/* 視覚QA専用(仮データ)。本番挙動は /admin(要admin権限)。 */

export default async function AdminPreviewPage() {
  await requireDevPreviewAccess();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      <AdminDashboardView
        data={{
          latest_batch: { id: 'b1', batch_date: '2026-07-08', status: 'COMPLETED' },
          economy_status: 'NORMAL',
          metrics: { burn_rate: 0.42, prize_pool_days: 12 },
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
    </div>
  );
}
