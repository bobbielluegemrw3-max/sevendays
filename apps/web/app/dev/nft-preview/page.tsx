import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { NftPreviewGrid } from '@/components/dev/NftPreviewGrid';

/**
 * 馬アートの素の見た目を確認するdev専用ページ(2026-07-22)。
 * カードやヒーローの装飾を一切通さず NftHorseArt だけを描くので、
 * 「色がおかしいのはアート側か、ページ側の演出か」を切り分けられる。
 */
export default async function NftPreviewPage() {
  await requireDevPreviewAccess();
  return <NftPreviewGrid />;
}
