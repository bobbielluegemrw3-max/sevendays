import { notFound } from 'next/navigation';
import { SupportView } from '@/components/SupportView';

/**
 * Dev-only visual preview of /support with fixture data (tier progress,
 * pool with placement dialog, a 3-tier network, bonus history). The
 * placement flow runs locally (no API). 404 in production.
 */
export default function SupportPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  const iso = (d: number) => new Date(Date.UTC(2026, 6, d, 12)).toISOString();
  return (
    <SupportView
      preview
      selfUserId="00000000-0000-4000-8000-000000000000"
      data={{
        summary: {
          referral_code: 'a1b2c3d4e5f6',
          has_sponsor: true,
          is_placed: true,
          unlocked_tiers: 3,
          volume: '6820.00',
          max_tiers: 7,
          tier_amounts: ['3.00', '2.00', '1.00', '1.00', '1.00', '1.00', '1.00'],
          tier_thresholds: ['0', '3001', '5001', '10001', '30001', '50001', '70001'],
          pool_count: 2,
          bonuses_received_total: '23.00',
          bonuses_received_count: 9,
        },
        pool: [
          { user_id: '11111111-1111-4111-8111-111111111111', display: 'ta***@gmail.com', joined_at: iso(4) },
          { user_id: '22222222-2222-4222-8222-222222222222', display: 'ke***@proton.me', joined_at: iso(6) },
        ],
        network: [
          { user_id: 'n1', parent_user_id: null, tier: 1, display: 'yu***@gmail.com', placed_at: iso(1) },
          { user_id: 'n2', parent_user_id: null, tier: 1, display: 'mi***@yahoo.co.jp', placed_at: iso(2) },
          { user_id: 'n3', parent_user_id: 'n1', tier: 2, display: 'sa***@gmail.com', placed_at: iso(3) },
          { user_id: 'n4', parent_user_id: 'n3', tier: 3, display: 'jo***@outlook.com', placed_at: iso(5) },
        ],
        bonuses: [
          { amount: '3.00', tier: 1, burn_event_id: 'be-1', created_at: iso(6) },
          { amount: '2.00', tier: 2, burn_event_id: 'be-2', created_at: iso(5) },
          { amount: '3.00', tier: 1, burn_event_id: 'be-3', created_at: iso(5) },
          { amount: '1.00', tier: 3, burn_event_id: 'be-4', created_at: iso(4) },
        ],
      }}
    />
  );
}
