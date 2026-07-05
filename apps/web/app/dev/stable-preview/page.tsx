import { notFound } from 'next/navigation';
import { StableView, type StableHorse } from '@/components/StableView';

/** Dev-only /horses preview with a large mixed stable (404 in production). */
const H = (
  id: string, name: string, rarity: string, type: string, day: number,
  cond: number, ftg: number, trained: boolean, status = 'ACTIVE',
): StableHorse => ({
  id, name, status, current_day: day, horse_type: type, rarity,
  condition: String(cond), fatigue: String(ftg),
  dna_hash: `0x${id.repeat(10).slice(0, 64)}`, trained_for_next_race: trained,
});

const NAMES = [
  'Crimson Tiger', 'Azure Comet', 'Golden Wolf', 'Phantom Frost', 'Emerald Storm', 'Silent Dash',
  'Thunder King', 'Lunar Blade', 'Desert Arrow', 'Ocean Spirit', 'Wild Crown', 'Iron Falcon',
  'Bright Meteor', 'Storm Rider', 'Noble Flame', 'Rapid Star', 'Mystic Wave', 'Frozen Peak',
  'Burning Soul', 'Royal Legend', 'Sky Dragon', 'Night Comet', 'Dawn Glory', 'Solar Strike',
  'Cosmic Heart', 'Black Tempest', 'White Mirage', 'Shadow Knight', 'Sacred Dream', 'Blue Eagle',
];
const RAR = ['COMMON', 'COMMON', 'COMMON', 'UNCOMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const TYPES = ['SPRINTER', 'POWER', 'BALANCED', 'ENDURANCE', 'LUCK'];

const HORSES: StableHorse[] = [
  ...NAMES.map((n, i) =>
    H(`a${i.toString(16).padStart(3, '0')}`, n, RAR[i % RAR.length]!, TYPES[i % TYPES.length]!,
      i % 7, 40 + ((i * 13) % 60), (i * 17) % 80, i % 3 !== 0),
  ),
  H('f001', 'Burning Meteor', 'RARE', 'POWER', 4, 0, 0, false, 'BURNED'),
  H('f002', 'Falling Falcon', 'COMMON', 'LUCK', 3, 0, 0, false, 'BURNED'),
  H('f003', 'Grand Victory', 'EPIC', 'ENDURANCE', 7, 0, 0, false, 'DAY7_CLEARED'),
  H('f004', 'Lucky Legend', 'LEGENDARY', 'BALANCED', 7, 0, 0, false, 'MEMORIALIZED'),
];

export default function StablePreview() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <StableView data={{ horses: HORSES, pendingCount: 2 }} />;
}
