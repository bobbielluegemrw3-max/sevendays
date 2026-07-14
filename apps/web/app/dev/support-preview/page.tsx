import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { SupportDashboardView } from '@/components/SupportDashboardView';

/**
 * Dev-only visual preview of the Support Bonus DASHBOARD (design
 * submission). 組織の閲覧/配置は /dev/support-map-preview 側。
 * 404 in production.
 */
export default async function SupportPreview() {
  await requireDevPreviewAccess();
  const iso = (d: number, h = 12) => new Date(Date.UTC(2026, 6, d, h)).toISOString();
  return (
    <SupportDashboardView
      data={{
        summary: {
          referral_code: 'a1b2c3d4e5f6',
          has_sponsor: true,
          is_placed: true,
          unlocked_tiers: 3,
          org_volume: '26820.00',
          direct_volume: '6820.00',
          starter_rate: '5.59', // 150000/26820(Decision 099)
          max_tiers: 7,
          tier_amounts: ['3.00', '2.00', '1.00', '1.00', '1.00', '1.00', '1.00'],
          org_thresholds: ['0', '10000', '20000', '50000', '250000', '400000', '600000'],
          direct_thresholds: ['0', '3001', '5001', '10001', '30001', '50001', '70001'],
          direct_required_from_tier: 5,
          pool_count: 3,
          bonuses_received_total: '23.00',
          bonuses_received_count: 9,
        },
        networkCount: 22,
        bonuses: [
          { amount: '3.00', tier: 1, burn_event_id: 'be-1', created_at: iso(6, 12) },
          { amount: '2.00', tier: 2, burn_event_id: 'be-2', created_at: iso(5, 12) },
          { amount: '3.00', tier: 1, burn_event_id: 'be-3', created_at: iso(5, 11) },
          { amount: '1.00', tier: 3, burn_event_id: 'be-4', created_at: iso(4, 12) },
          { amount: '3.00', tier: 1, burn_event_id: 'be-5', created_at: iso(3, 12) },
          { amount: '2.00', tier: 2, burn_event_id: 'be-6', created_at: iso(2, 12) },
        ],
      }}
    />
  );
}
