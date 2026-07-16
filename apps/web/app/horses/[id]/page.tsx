import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { APP_COPY } from '@/lib/i18n';
import { HorseDetailView, type HorseDetail } from '@/components/HorseDetailView';
import type { PagerNav } from '@/components/HorsePager';

/* 前/次ページャ:
 *  - 矢印は「同じグループ内」だけを巡回(出走中の馬なら出走中だけ)。
 *  - グループ内の並びは厩舎と同じ value_desc(日数→レアリティ)。
 *  - 出走中グループでは「未調教の次の馬」へのジャンプ先も算出。 */
interface OwnedHorse {
  id: string; name: string; status: string; current_day: number;
  rarity: string; listing: string | null; trained_for_next_race: boolean;
}
type Group = 'racing' | 'listed' | 'champion' | 'burned' | 'other';
function groupOf(h: OwnedHorse): Group {
  if (h.status === 'ACTIVE') return h.listing === 'MANUAL' ? 'listed' : 'racing';
  if (h.status === 'DAY7_CLEARED' || h.status === 'MEMORIALIZED') return 'champion';
  if (h.status === 'BURNED') return 'burned';
  return 'other';
}
const RANK: Record<string, number> = { COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, LEGENDARY: 4 };
const byValue = (a: OwnedHorse, b: OwnedHorse) =>
  b.current_day - a.current_day || (RANK[b.rarity] ?? 0) - (RANK[a.rarity] ?? 0);

function buildNav(horses: OwnedHorse[], id: string, groupLabel: Record<Group, string>): PagerNav | undefined {
  const current = horses.find((h) => h.id === id);
  if (!current) return undefined;
  const g = groupOf(current);
  const group = horses.filter((h) => groupOf(h) === g).sort(byValue);
  const i = group.findIndex((h) => h.id === id);
  if (i < 0) return undefined;

  const p = group[i - 1];
  const n = group[i + 1];

  // 出走中グループのみ: 未調教の次の馬(現在の馬の後ろから巡回)と残数を算出
  let nextUntrained: PagerNav['nextUntrained'] = null;
  let untrainedRemaining = 0;
  let allTrained = false;
  if (g === 'racing') {
    untrainedRemaining = group.filter((h) => h.id !== id && !h.trained_for_next_race).length;
    allTrained = group.every((h) => h.trained_for_next_race);
    for (let k = 1; k < group.length; k++) {
      const cand = group[(i + k) % group.length];
      if (cand && cand.id !== id && !cand.trained_for_next_race) {
        nextUntrained = { id: cand.id, name: cand.name };
        break;
      }
    }
  }

  // ページャを出す価値がある時だけ返す(グループ2頭以上、またはジャンプ先あり)
  if (group.length <= 1 && !nextUntrained) return undefined;

  return {
    groupLabel: groupLabel[g],
    prev: p ? { id: p.id, name: p.name } : null,
    next: n ? { id: n.id, name: n.name } : null,
    index: i + 1,
    total: group.length,
    nextUntrained,
    untrainedRemaining,
    allTrained,
  };
}

export default async function HorseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 詳細とページャ用一覧を並列取得(2026-07-16 §D: 直列2往復の解消)。
  const [result, list, lang] = await Promise.all([
    serverApi<HorseDetail>(`/api/v1/horses/${id}`),
    serverApi<{ horses: OwnedHorse[] }>('/api/v1/horses'),
    getLang(),
  ]);
  if (result.status !== 200) notFound();

  // 前/次ページャ用のデータ。取得失敗しても詳細は表示する(矢印なし)。
  const th = APP_COPY[lang].horse;
  let nav: PagerNav | undefined;
  if (list.status === 200) {
    nav = buildNav(list.body.horses, id, {
      racing: th.grp_racing, listed: th.grp_listed, champion: th.grp_champion,
      burned: th.grp_burned, other: th.grp_other,
    });
  }

  return <HorseDetailView horse={result.body} nav={nav} lang={lang} />;
}
