import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { MarketPlaceView } from '@/components/MarketPlaceView';
import { PurchaseView } from '@/components/PurchaseView';
import { ReservePanel } from '@/components/ReservePanel';
import { TradeAutoTile, TradeModeModal } from '@/components/TradeAutoControls';

/**
 * Dev-only visual preview of /market (Decision 076 + 085 funnel) with
 * fixture data: demand count, a 6-horse shelf (one MINE), SOLD cards from
 * recent matches (incl. a mint), the reserve panel (balance-driven max-N),
 * reservations, and my listings incl. a cancel-pending one. 404 in production.
 * URL flags: ?empty=1 (no funds), ?full=1 (session cap reached),
 * ?choose=1 (mandatory listing-mode modal, Decision 086).
 */
export default async function MarketPreview({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string; full?: string; choose?: string }>;
}) {
  await requireDevPreviewAccess();
  const flags = await searchParams;
  const iso = (d: number, h = 10) => new Date(Date.UTC(2026, 6, d, h)).toISOString();
  const dna = (seed: string) => `0x${seed.repeat(32).slice(0, 64)}`;
  const shelf = [
    { listing_id: 'l1', horse_id: 'h1', price: '121.00', current_day: 2, listed_at: iso(5), name: 'Azure Comet', dna_hash: dna('1a'), rarity: 'COMMON' },
    { listing_id: 'l2', horse_id: 'h2', price: '146.41', current_day: 4, listed_at: iso(5, 12), name: 'Neon Mirage', dna_hash: dna('2b'), rarity: 'UNCOMMON' },
    { listing_id: 'l3', horse_id: 'mine1', price: '133.10', current_day: 3, listed_at: iso(6), name: 'Crimson Tiger', dna_hash: dna('3c'), rarity: 'RARE' },
    { listing_id: 'l4', horse_id: 'h4', price: '110.00', current_day: 1, listed_at: iso(6, 14), name: 'Silent Dash', dna_hash: dna('4d'), rarity: 'COMMON' },
    { listing_id: 'l5', horse_id: 'h5', price: '161.05', current_day: 5, listed_at: iso(6, 20), name: 'Golden Wolf', dna_hash: dna('5e'), rarity: 'EPIC' },
    { listing_id: 'l6', horse_id: 'h6', price: '121.00', current_day: 2, listed_at: iso(7), name: 'Phantom Frost', dna_hash: dna('6f'), rarity: 'LEGENDARY' },
  ];
  const recent = [
    { horse_name: 'Royal Thunder', price: '177.16', buyer: 'U-8f3a', matched_at: iso(6, 12), dna_hash: dna('b1'), rarity: 'EPIC', is_mint: false },
    { horse_name: 'Emerald Storm', price: '133.10', buyer: 'U-2c91', matched_at: iso(6, 12), dna_hash: dna('c2'), rarity: 'RARE', is_mint: false },
    { horse_name: 'Lunar Echo', price: '121.00', buyer: 'U-77b0', matched_at: iso(6, 12), dna_hash: dna('d3'), rarity: 'COMMON', is_mint: false },
    { horse_name: 'Star Ember', price: '102.00', buyer: 'U-4e12', matched_at: iso(6, 12), dna_hash: dna('e4'), rarity: 'UNCOMMON', is_mint: true },
    { horse_name: 'Iron Comet', price: '146.41', buyer: 'U-a055', matched_at: iso(5, 12), dna_hash: dna('f5'), rarity: 'COMMON', is_mint: false },
    { horse_name: 'Violet Gale', price: '102.00', buyer: 'U-390c', matched_at: iso(5, 12), dna_hash: dna('a6'), rarity: 'RARE', is_mint: true },
  ];
  const available = flags.empty ? '58.20' : '412.55';
  const pendingCount = flags.full ? 10 : 1;
  return (
    <MarketPlaceView
      preview
      data={{
        shelf,
        pending_buy_count: 1834,
        recent_matches: recent,
        my_listings: [
          { listing_id: 'l3', horse_id: 'mine1', price: '133.10', current_day: 3, listed_at: iso(6), cancel_after_batch: false, source: 'MANUAL', name: 'Crimson Tiger', dna_hash: dna('3c'), rarity: 'COMMON' },
          { listing_id: 'l9', horse_id: 'mine2', price: '110.00', current_day: 1, listed_at: iso(4), cancel_after_batch: true, source: 'MANUAL', name: 'Emerald Storm', dna_hash: dna('7e'), rarity: 'RARE' },
          { listing_id: 'l10', horse_id: 'mine3', price: '146.41', current_day: 4, listed_at: iso(6, 20), cancel_after_batch: false, source: 'SMART', name: 'Neon Blaze', dna_hash: dna('b7'), rarity: 'EPIC' },
        ],
      }}
      myHorses={[
        { id: 'a1', name: 'Burning Meteor', current_day: 2, status: 'ACTIVE', dna_hash: dna('8a') },
        { id: 'a2', name: 'Azure Queen', current_day: 5, status: 'ACTIVE', dna_hash: dna('9b') },
        { id: 'a3', name: 'Solar Flame', current_day: 0, status: 'ACTIVE', dna_hash: dna('a3') },
      ]}
      reserveSlot={
        <>
          <ReservePanel preview available={available} pendingCount={pendingCount} />
          <TradeAutoTile
            preview
            settings={{ chosen: true, auto_list: true, auto_reserve: true, auto_reserve_max: 1 }}
          />
          {flags.choose ? (
            <TradeModeModal
              preview
              settings={{ chosen: false, auto_list: false, auto_reserve: false, auto_reserve_max: 1 }}
            />
          ) : null}
          <PurchaseView
            sessions={[
              { id: 's1', status: 'PENDING_ASSIGNMENT', locked_amount: '177.16', assigned_price: null, refund_amount: null, created_at: iso(7, 3) },
              { id: 's2', status: 'COMPLETED', locked_amount: '177.16', assigned_price: '133.10', refund_amount: '44.06', created_at: iso(6, 3) },
              { id: 's3', status: 'EXPIRED', locked_amount: '177.16', assigned_price: null, refund_amount: '177.16', created_at: iso(5, 3) },
            ]}
            assignments={[
              { id: 'as1', horse_id: 'h9', assigned_price: '133.10', status: 'SETTLED', was_day0_mint: false, created_at: iso(6, 12) },
              { id: 'as2', horse_id: 'h8', assigned_price: '102.00', status: 'SETTLED', was_day0_mint: true, created_at: iso(5, 12) },
            ]}
          />
        </>
      }
    />
  );
}
