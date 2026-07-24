import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { RacesView, type Race } from '@/components/RacesView';

/* ============================================================================
 * Dev-only /races preview（本番は 404）。RACE_PAGE_BELOW_MONITOR_SPEC 道A の
 * モニター下部再設計を、②過去結果が埋まった状態で目視するためのプレビュー。
 * 縦順の確認: ①次のレース(NextRaceCard・自前fetch) → ②過去の結果 →
 * ③透明性台帳(独立カード) → ④あなたの記録(既定折りたたみ・MyDerbyRecord自前fetch)。
 * ①④はクライアントで実APIを叩く(ログイン中オーナーの実データ)。②のみここでモック。
 * ========================================================================== */

/** 直近数レースの FINALIZED 一覧モック(8:00/20:00 交互・出走頭数はそれっぽく)。 */
const R = (n: number, date: string, slot: 'MORNING' | 'NIGHT', parts: number): Race => ({
  id: `dev-race-${n.toString().padStart(3, '0')}`,
  status: 'FINALIZED',
  participant_count: parts,
  batch_date: date,
  slot,
  race_engine_version: 'v2.0',
});

const RACES: Race[] = [
  R(1, '2026-07-24', 'MORNING', 1284),
  R(2, '2026-07-23', 'NIGHT', 1361),
  R(3, '2026-07-23', 'MORNING', 1207),
  R(4, '2026-07-22', 'NIGHT', 1298),
  R(5, '2026-07-22', 'MORNING', 1150),
  R(6, '2026-07-21', 'NIGHT', 1342),
];

export default async function RacesPreview({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>;
}) {
  await requireDevPreviewAccess();
  const flags = await searchParams;
  // ?empty=1 … 確定レースがまだ無い状態(②の空カード)を確認する
  const races = flags.empty === '1' ? [] : RACES;
  return <RacesView races={races} />;
}
