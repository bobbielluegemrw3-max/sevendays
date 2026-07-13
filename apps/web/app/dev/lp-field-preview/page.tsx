import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { Landing } from '@/components/Landing';

/**
 * LP「今夜の出走枠」ライン(Decision 093)の視覚QA(本番404)。
 * 本番のLPは実データ(ACTIVE馬0頭のうちは非表示)のため、フィクスチャで
 * 表示状態を確認する: 14頭/枠1(確定)。?range=1 で範囲表示(100頭/8〜13)。
 */
export default async function LpFieldPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireDevPreviewAccess();
  const { range } = await searchParams;
  const field =
    range === '1'
      ? { entrants: 100, min: 8, max: 13 }
      : { entrants: 14, min: 1, max: 1 };
  return <Landing tonightField={field} />;
}
