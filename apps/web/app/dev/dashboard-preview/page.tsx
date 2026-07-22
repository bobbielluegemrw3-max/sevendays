import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { DashboardView, type DashHorse } from '@/components/DashboardView';

/**
 * Dev-only visual preview of the dashboard with rich fixture data (results,
 * stable, buyback, notifications). Returns 404 in production builds — it
 * exists so layout/visual changes can be checked without a live account.
 */
const H = (
  id: string, name: string, rarity: string, type: string, day: number,
  cond: number, ftg: number, trained: boolean, status = 'ACTIVE',
): DashHorse => ({
  id, name, status, current_day: day, horse_type: type, rarity,
  condition: String(cond), fatigue: String(ftg),
  dna_hash: `0x${id.repeat(8).slice(0, 64)}`, trained_for_next_race: trained,
});

const HORSES: DashHorse[] = [
  H('a1f4', 'Crimson Tiger', 'LEGENDARY', 'POWER', 5, 82, 34, true),
  H('b2e7', 'Azure Comet', 'RARE', 'SPRINTER', 3, 64, 51, false),
  H('c3d9', 'Golden Wolf', 'UNCOMMON', 'BALANCED', 2, 71, 22, true),
  H('d4c2', 'Phantom Frost', 'COMMON', 'LUCK', 1, 58, 12, false),
  H('e5b8', 'Emerald Storm', 'COMMON', 'ENDURANCE', 6, 44, 78, true),
  H('f6a3', 'Silent Dash', 'COMMON', 'SPRINTER', 0, 66, 8, false),
  H('0797', 'Burning Meteor', 'RARE', 'POWER', 4, 0, 0, false, 'BURNED'),
];

export default async function DashboardPreview({
  searchParams,
}: {
  searchParams: Promise<{ choose?: string; newcomer?: string }>;
}) {
  await requireDevPreviewAccess();
  const flags = await searchParams;
  // ?newcomer=1 … 真の新規(0頭・履歴なし)の見え方を確認する
  // (DASHBOARD_REVISION_SPEC 2026-07-22: 歓迎ブロックはこの状態でしか出ない)
  const newcomer = flags.newcomer === '1';
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();
  return (
    <DashboardView
      data={{
        wallet: { available: '312.55', locked: '177.16' },
        horses: newcomer ? [] : HORSES,
        buff: { buff_rarity: 'RARE', buff_bonus_score: '2.40', status: 'ACTIVE' },
        pendingCount: 1,
        lastRace: { id: 'race-demo', status: 'COMPLETED', participant_count: 1874, batch_date: '2026-07-04' },
        myResults: newcomer ? [] : [
          { horse_id: 'a1f4', final_score: '84.31', final_rank: 12, is_burned: false, horse: HORSES[0]! },
          { horse_id: 'e5b8', final_score: '71.02', final_rank: 341, is_burned: false, horse: HORSES[4]! },
          { horse_id: '0797', final_score: '42.77', final_rank: 1743, is_burned: true, horse: HORSES[6]! },
        ],
        buybacks: [{ id: 'bb-1', status: 'IN_PROGRESS', payments_paid: 3 }],
        notifications: [
          { id: 'n1', notification_type: 'RACE_RESULT_READY', payload_json: { title: '本日のレース結果が確定しました。' }, read_at: null, created_at: iso(35) },
          { id: 'n2', notification_type: 'HORSE_BURNED', payload_json: { title: 'Burning Meteor は本日のレースでBurnされました。' }, read_at: null, created_at: iso(36) },
          { id: 'n3', notification_type: 'BUYBACK_PAYMENT_PAID', payload_json: { title: 'チャンピオン報酬が支払われました。' }, read_at: null, created_at: iso(37) },
          { id: 'n4', notification_type: 'TRAINING_COMPLETED', payload_json: { title: 'トレーニングが完了しました。' }, read_at: iso(300), created_at: iso(1500) },
        ],
        // ?choose=1 で必須選択モーダル(Decision 086)をプレビュー
        trade: flags.choose
          ? { chosen: false, auto_list: false, auto_reserve: false, auto_reserve_max: 1 }
          : { chosen: true, auto_list: true, auto_reserve: true, auto_reserve_max: null },
      }}
    />
  );
}
