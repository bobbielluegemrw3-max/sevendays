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
  // 隠し演出の視覚確認: 真夜中の馬/黄金の夜/原色ルート/オーラ/リベンジ/記念
  { ...H('n001', 'Midnight Veil', 'EPIC', 'LUCK', 3, 66, 22, true, 'ACTIVE'), night_variant: true, golden_star: true },
  { ...H('c001', 'Crimson Blaze', 'RARE', 'POWER', 4, 58, 30, false, 'ACTIVE'), color_variant: 'red' },
  { ...H('c002', 'Azure Tide', 'UNCOMMON', 'SPRINTER', 2, 60, 25, false, 'ACTIVE'), color_variant: 'blue' },
  { ...H('c003', 'Verdant Gale', 'COMMON', 'ENDURANCE', 3, 55, 28, false, 'ACTIVE'), color_variant: 'green' },
  { ...H('c004', 'Sunfire Mane', 'RARE', 'LUCK', 5, 62, 20, true, 'ACTIVE'), color_variant: 'yellow' },
  { ...H('c005', 'Obsidian Vow', 'EPIC', 'BALANCED', 4, 50, 33, false, 'ACTIVE'), color_variant: 'black' },
  { ...H('r001', 'Ember Return', 'RARE', 'POWER', 3, 57, 31, false, 'ACTIVE'), revenge_flame: true },
  { ...H('m777', 'Lucky Seven', 'LEGENDARY', 'LUCK', 6, 70, 15, true, 'ACTIVE'), milestone: true, golden_star: true },
  H('m001', 'Velvet Storm', 'RARE', 'SPRINTER', 5, 70, 20, false, 'ACTIVE', 'MANUAL'),
  H('m002', 'Quiet Ember', 'COMMON', 'BALANCED', 2, 55, 33, false, 'ACTIVE', 'MANUAL'),
  H('f001', 'Burning Meteor', 'RARE', 'POWER', 4, 0, 0, false, 'BURNED'),
  H('f002', 'Falling Falcon', 'COMMON', 'LUCK', 3, 0, 0, false, 'BURNED'),
  H('f003', 'Grand Victory', 'EPIC', 'ENDURANCE', 7, 0, 0, false, 'DAY7_CLEARED'),
  H('f004', 'Lucky Legend', 'LEGENDARY', 'BALANCED', 7, 0, 0, false, 'MEMORIALIZED'),
  H('f005', 'Aurora Crown', 'RARE', 'SPRINTER', 7, 0, 0, false, 'MEMORIALIZED'),
];

/* FUN改修A1: 総合値+安全圏の見た目確認用のフィクスチャ値(実計算ではない・devのみ)。 */
const RARN: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };
for (const h of HORSES) {
  if (h.status !== 'ACTIVE') continue;
  h.total_value = Math.max(5, Math.min(97, Math.round(
    35 + Number(h.condition) * 0.5 - Number(h.fatigue) * 0.25 + (RARN[h.rarity] ?? 0) * 6 + (h.trained_for_next_race ? 4 : 0),
  )));
}
{
  const runners = HORSES.filter((h) => h.status === 'ACTIVE' && h.listing !== 'MANUAL')
    .sort((a, b) => (b.total_value ?? 0) - (a.total_value ?? 0));
  runners.forEach((h, i) => {
    const rank = i + 1;
    h.tonight_rank = rank;
    h.tonight_entrants = runners.length;
    h.tonight_band = rank <= Math.ceil(runners.length * 0.4)
      ? 'SAFE'
      : rank > runners.length - Math.ceil(runners.length * 0.25) ? 'RISK' : 'MID';
  });
}

export default async function StablePreview({
  searchParams,
}: {
  searchParams: Promise<{ newcomer?: string; nonight?: string; allsafe?: string; norank?: string; real?: string }>;
}) {
  await requireDevPreviewAccess();
  const flags = await searchParams;
  // STABLE_REVISION_SPEC §3 のエッジを目視するためのフラグ(devのみ)
  //  ?newcomer=1 … 1頭も持たない真の新規 → サマリーを出さない
  //  ?nonight=1  … 現役はいるが今夜の出走が0(全馬が手動出品中 等)
  //  ?allsafe=1  … RISK が0頭 → 名指しを出さず「全頭が安全圏(目安)」
  // ?real=1 … オーナーの実厩舎(2026-07-22 スクショ)と同じ総合値・順位で再現する。
  // 「実プレイの厩舎は 50〜76 に固まる」ので、見え方の検証はこの並びで行う
  const REAL: [number, number, string][] = [
    [76.1, 4, 'SAFE'], [59.8, 9, 'MID'], [55.7, 10, 'MID'],
    [53.3, 12, 'RISK'], [52.9, 13, 'RISK'], [50.2, 14, 'RISK'],
  ];
  const horses = flags.real === '1'
    ? HORSES.filter((h) => h.status === 'ACTIVE' && h.listing !== 'MANUAL')
        .slice(0, 6)
        .map((h, i) => ({
          ...h, total_value: REAL[i]![0], tonight_rank: REAL[i]![1], tonight_entrants: 14,
          tonight_band: REAL[i]![2] as 'SAFE' | 'MID' | 'RISK', trained_for_next_race: false,
        }))
    : flags.newcomer === '1'
    ? []
    : flags.nonight === '1'
      ? HORSES.map((h) => (h.status === 'ACTIVE' ? { ...h, listing: 'MANUAL' } : h))
      : flags.allsafe === '1'
        ? HORSES.map((h) => (h.tonight_band === 'RISK' || h.tonight_band === 'MID' ? { ...h, tonight_band: 'SAFE' as const } : h))
        : HORSES;
  return (
    <StableView
      data={{
        horses,
        pendingCount: 2,
        breederRank: flags.norank === '1' ? null : 14,
        hiddenBadges: [
          { key: 'rain_reader', name: '雨読みの三重奏', flavor: '雨を味方につけた者にだけ、水面は道を見せる。', tone: 'rain' },
          { key: 'mud_general', name: '泥将', flavor: '道悪を制する者は、晴天の勝者を三度食う。', tone: 'mud' },
          { key: 'legacy_bearer', name: '遺志を継ぐ者', flavor: '失われた馬の力が、次の一頭を勝たせた。', tone: 'spirit' },
        ],
      }}
    />
  );
}
