import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { StableView, type StableHorse } from '@/components/StableView';

/** Dev-only /horses preview with a large mixed stable (404 in production). */
const H = (
  id: string, name: string, rarity: string, type: string, day: number,
  cond: number, ftg: number, trained: boolean, status = 'ACTIVE',
  listing: string | null = null,
): StableHorse => ({
  id, name, status, current_day: day, horse_type: type, rarity,
  condition: String(cond), fatigue: String(ftg),
  dna_hash: `0x${id.repeat(10).slice(0, 64)}`, trained_for_next_race: trained,
  listing,
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
      i % 7, 40 + ((i * 13) % 60), (i * 17) % 80, i % 3 !== 0,
      // 1頭はスマート出品中(走る)、Decision 087監査の表示確認用
      'ACTIVE', i === 1 ? 'SMART' : null),
  ),
  // 手動出品中(Market Lock=今夜走らない)
  // 隠し演出の視覚確認: 真夜中の馬(夜色)+黄金の夜(金星)
  { ...H('n001', 'Midnight Veil', 'EPIC', 'LUCK', 3, 66, 22, true, 'ACTIVE'), night_variant: true, golden_star: true },
  { ...H('g001', 'Gilded Comet', 'RARE', 'POWER', 4, 58, 30, false, 'ACTIVE'), golden_star: true },
  H('m001', 'Velvet Storm', 'RARE', 'SPRINTER', 5, 70, 20, false, 'ACTIVE', 'MANUAL'),
  H('m002', 'Quiet Ember', 'COMMON', 'BALANCED', 2, 55, 33, false, 'ACTIVE', 'MANUAL'),
  H('f001', 'Burning Meteor', 'RARE', 'POWER', 4, 0, 0, false, 'BURNED'),
  H('f002', 'Falling Falcon', 'COMMON', 'LUCK', 3, 0, 0, false, 'BURNED'),
  H('f003', 'Grand Victory', 'EPIC', 'ENDURANCE', 7, 0, 0, false, 'DAY7_CLEARED'),
  H('f004', 'Lucky Legend', 'LEGENDARY', 'BALANCED', 7, 0, 0, false, 'MEMORIALIZED'),
  H('f005', 'Aurora Crown', 'RARE', 'SPRINTER', 7, 0, 0, false, 'MEMORIALIZED'),
];

export default async function StablePreview() {
  await requireDevPreviewAccess();
  return (
    <StableView
      data={{
        horses: HORSES,
        pendingCount: 2,
        hiddenBadges: [
          { key: 'rain_reader', name: '雨読みの三重奏', flavor: '雨を味方につけた者にだけ、水面は道を見せる。', tone: 'rain' },
          { key: 'mud_general', name: '泥将', flavor: '道悪を制する者は、晴天の勝者を三度食う。', tone: 'mud' },
          { key: 'legacy_bearer', name: '遺志を継ぐ者', flavor: '失われた馬の力が、次の一頭を勝たせた。', tone: 'spirit' },
        ],
      }}
    />
  );
}
