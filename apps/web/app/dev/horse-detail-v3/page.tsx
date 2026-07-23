import Link from 'next/link';
import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { HorseDetailView, type HorseDetail, type HorseRaceResult } from '@/components/HorseDetailView';

/* ============================================================================
 * /dev/horse-detail-v3 — 実 HorseDetailView を engine_v3=true のモックで強制描画。
 * 目的: V3の2カラム構図を「実部品(NftHorseArt / FormPanel v2 / TrainingFormV2 /
 *       ItemPrepPanelV3)」で確認する検証ハーネス。本番は管理者のみ・それ以外404。
 * ★ライブ(V2)には影響しない。engine_v3 ブランチは本番では休眠中(リセットで起動)。
 * 状態切替: ?s=active|listed|burned|cleared|rookie|grail
 * ========================================================================== */

const RUN = (
  weather: string, track: string, surface: string, rank: number, entrants: number,
): HorseRaceResult => ({
  batch_date: `2026-07-${10 + rank}`, final_rank: rank, final_score: '0', is_burned: false,
  participant_count: entrants, weather, track_condition: track, surface,
});

const ACTIVE_HISTORY: HorseRaceResult[] = [
  RUN('SUNNY', 'GOOD', 'DIRT', 14, 1800),
  RUN('RAIN', 'SOFT', 'TURF', 3, 2400),
  RUN('CLOUDY', 'HEAVY', 'TURF', 9, 2100),
  RUN('RAIN', 'FAST', 'DIRT', 11, 1950),
  RUN('SUNNY', 'GOOD', 'TURF', 16, 2200),
];

function baseHorse(): HorseDetail {
  return {
    id: '00000000-0000-0000-0000-0000000000a1', name: 'Tempest', status: 'ACTIVE', current_day: 4,
    horse_type: 'バランス', rarity: 'RARE', dna_hash: '0x9f2c7a41bd3e51be2b90c9d0aa16c4fdd69043ceb1f01fd6', dna_modifier: '12',
    ability_json: { speed: 62, stamina: 55, power: 48, guts: 51, luck: 44 },
    condition: '62', fatigue: '38', total_value: 74,
    tonight_rank: 320, tonight_entrants: 2400, tonight_band: 'SAFE',
    mint_seed_hash: '0x51bec9d0aa16c4fdd69043ceb1f01fd66b2f43e7', horse_generation_version: 'v3.0',
    listing: null, engine_v2: true, engine_v3: true,
    tonight_forecast: { weather: 'RAIN', track: 'SOFT', surface: 'TURF' },
    training_v2: null, history: ACTIVE_HISTORY,
    breeder_credits: [
      { breeder: null, is_you: true, delta: 8.4, item_bonus: 1.2, sessions: 12, pct: 64 },
      { breeder: 'nao***', is_you: false, delta: 4.7, item_bonus: 0, sessions: 7, pct: 36 },
    ],
  };
}

function mockHorse(sel: string): HorseDetail {
  const h = baseHorse();
  if (sel === 'listed') {
    return { ...h, name: 'Zephyr', horse_type: 'スタミナ', rarity: 'EPIC', current_day: 3, total_value: 68, listing: 'MANUAL', status: 'ACTIVE' };
  }
  if (sel === 'burned') {
    return { ...h, name: 'Falling Falcon', status: 'BURNED', total_value: null, tonight_rank: null, tonight_entrants: null, tonight_band: null };
  }
  if (sel === 'cleared') {
    return { ...h, name: 'Grand Victory', status: 'DAY7_CLEARED', current_day: 7, total_value: null, tonight_rank: null, tonight_entrants: null, tonight_band: null };
  }
  if (sel === 'rookie') {
    return { ...h, name: 'Nova', rarity: 'UNCOMMON', current_day: 1, total_value: 58, history: [], breeder_credits: [{ breeder: null, is_you: true, delta: 0, item_bonus: 0, sessions: 0, pct: 100 }] };
  }
  if (sel === 'grail') {
    return { ...h, name: 'Aurelius', horse_type: 'スピード', rarity: 'LEGENDARY', current_day: 5, total_value: 93, tonight_rank: 12, tonight_entrants: 2600, golden_star: true, golden_aura: true };
  }
  return h;
}

const STATES: { key: string; label: string }[] = [
  { key: 'active', label: '出走中' }, { key: 'rookie', label: '新馬' }, { key: 'grail', label: '聖杯90+' },
  { key: 'listed', label: '出品中' }, { key: 'burned', label: 'BURN' }, { key: 'cleared', label: 'Day7走破' },
];

export default async function HorseDetailV3Preview({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  await requireDevPreviewAccess();
  const { s } = await searchParams;
  const sel = s ?? 'active';
  const horse = mockHorse(sel);
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0714)' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', padding: '12px 20px', background: 'rgba(8,6,16,.86)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,.09)' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12, letterSpacing: '.14em', color: 'var(--gold, #c9a86a)' }}>馬個別ページ V3 結線検証(実 HorseDetailView · engine_v3)</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATES.map((st) => (
            <Link key={st.key} href={`/dev/horse-detail-v3?s=${st.key}`}
              style={{ fontSize: 10, padding: '6px 11px', borderRadius: 7, textDecoration: 'none', border: '1px solid rgba(255,255,255,.09)', background: sel === st.key ? 'rgba(201,168,106,.22)' : 'transparent', color: sel === st.key ? '#f2e4bf' : '#8f8ac2' }}>
              {st.label}
            </Link>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 9, color: '#5c5680' }}>実部品配置(C/D中身は次段階) · ライブV2は無変更</span>
      </div>
      <HorseDetailView horse={horse} lang="ja" />
    </div>
  );
}
