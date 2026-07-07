import { notFound } from 'next/navigation';
import { MarketPlaceView } from '@/components/MarketPlaceView';

/**
 * Dev-only visual preview of /market (Decision 076) with fixture data:
 * demand count, a 6-horse shelf (one of them MINE), recent matches, my
 * listings incl. a cancel-pending one, and the listing dialog (local).
 * 404 in production.
 */
export default function MarketPreview() {
  if (process.env.NODE_ENV === 'production') notFound();
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
  return (
    <MarketPlaceView
      preview
      data={{
        shelf,
        pending_buy_count: 1834,
        recent_matches: [
          { horse_name: 'Royal Thunder', price: '177.16', buyer: 'U-8f3a', matched_at: iso(6, 12) },
          { horse_name: 'Emerald Storm', price: '133.10', buyer: 'U-2c91', matched_at: iso(6, 12) },
          { horse_name: 'Lunar Echo', price: '121.00', buyer: 'U-77b0', matched_at: iso(6, 12) },
        ],
        my_listings: [
          { listing_id: 'l3', horse_id: 'mine1', price: '133.10', current_day: 3, listed_at: iso(6), cancel_after_batch: false, name: 'Crimson Tiger', dna_hash: dna('3c'), rarity: 'COMMON' },
          { listing_id: 'l9', horse_id: 'mine2', price: '110.00', current_day: 1, listed_at: iso(4), cancel_after_batch: true, name: 'Emerald Storm', dna_hash: dna('7e'), rarity: 'RARE' },
        ],
      }}
      myHorses={[
        { id: 'a1', name: 'Burning Meteor', current_day: 2, status: 'ACTIVE', dna_hash: dna('8a') },
        { id: 'a2', name: 'Azure Queen', current_day: 5, status: 'ACTIVE', dna_hash: dna('9b') },
        { id: 'a3', name: 'Solar Flame', current_day: 0, status: 'ACTIVE', dna_hash: dna('a3') },
      ]}
    />
  );
}
