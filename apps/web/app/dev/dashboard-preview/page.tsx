import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { DashboardView, type DashHorse } from '@/components/DashboardView';

/**
 * Dev-only visual preview of the dashboard with rich fixture data (results,
 * stable, buyback, notifications). Returns 404 in production builds — it
 * exists so layout/visual changes can be checked without a live account.
 */
const H = (
  id: string, name: string, rarity: string, type: string, day: number,
  cond: number, ftg: number, trained: boolean, status = 'ACTIVE', totalValue: number | null = null,
): DashHorse => ({
  id, name, status, current_day: day, horse_type: type, rarity,
  condition: String(cond), fatigue: String(ftg),
  dna_hash: `0x${id.repeat(8).slice(0, 64)}`, trained_for_next_race: trained,
  // 総合値(V2)。実データでは必ず入る値なので、プレビューでも与えて
  // 表示崩れを見られるようにする(2026-07-22)。ティア5帯を一通り並べる
  total_value: totalValue,
});

const HORSES: DashHorse[] = [
  H('a1f4', 'Crimson Tiger', 'LEGENDARY', 'POWER', 5, 82, 34, true, 'ACTIVE', 92.4),
  H('b2e7', 'Azure Comet', 'RARE', 'SPRINTER', 3, 64, 51, false, 'ACTIVE', 84.1),
  H('c3d9', 'Golden Wolf', 'UNCOMMON', 'BALANCED', 2, 71, 22, true, 'ACTIVE', 73.6),
  H('d4c2', 'Phantom Frost', 'COMMON', 'LUCK', 1, 58, 12, false, 'ACTIVE', 58.9),
  H('e5b8', 'Emerald Storm', 'COMMON', 'ENDURANCE', 6, 44, 78, true, 'ACTIVE', 47.2),
  H('f6a3', 'Silent Dash', 'COMMON', 'SPRINTER', 0, 66, 8, false, 'ACTIVE', 55.3),
  H('0797', 'Burning Meteor', 'RARE', 'POWER', 4, 0, 0, false, 'BURNED'),
];

export default async function DashboardPreview({
  searchParams,
}: {
  searchParams: Promise<{ choose?: string; newcomer?: string; pending?: string }>;
}) {
  await requireDevPreviewAccess();
  const flags = await searchParams;
  // ?newcomer=1 … 真の新規(0頭・履歴なし・予約なし・残高0)の見え方
  // (DASHBOARD_REVISION_SPEC 2026-07-22: 歓迎ブロックはこの状態でしか出ない)
  // ?pending=1 … 新規が初回のプール予約を済ませた直後(0頭・履歴なし・予約1件)。
  //   ここで歓迎ブロックが再び出ると「買ったのにまた最初の馬を迎えろ」になる —
  //   レビュー側指摘(2026-07-22)の再現・確認用
  const pending = flags.pending === '1';
  const newcomer = flags.newcomer === '1' || pending;
  const now = Date.now();
  const iso = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString();
  return (
    <DashboardView
      data={{
        wallet: newcomer
          ? (pending ? { available: '0.00', locked: '100.00' } : { available: '0.00', locked: '0.00' })
          : { available: '312.55', locked: '177.16' },
        horses: newcomer ? [] : HORSES,
        buff: { buff_rarity: 'RARE', buff_bonus_score: '2.40', status: 'ACTIVE' },
        pendingCount: newcomer && !pending ? 0 : 1,
        lastRace: { id: 'race-demo', status: 'COMPLETED', participant_count: 1874, batch_date: '2026-07-04' },
        myResults: newcomer ? [] : [
          // margin は帯内の実測差(Dashboard.tsx が算出)。プレビューは値を直接与える
          { horse_id: 'a1f4', final_score: '84.31', final_rank: 12, is_burned: false, horse: HORSES[0]!, margin: 4.66 },
          { horse_id: 'e5b8', final_score: '71.02', final_rank: 341, is_burned: false, horse: HORSES[4]!, margin: 12.3 },
          { horse_id: '0797', final_score: '42.77', final_rank: 1743, is_burned: true, horse: HORSES[6]!, margin: 1.2 },
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
