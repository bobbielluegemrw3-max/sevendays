import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { HorsePagePreview } from './HorsePagePreview';

/** 馬個別ページ 案3(縦長ポートレート)＋反応FX プレビュー。本番は管理者のみ・それ以外404。 */
export default async function HorsePagePreviewPage() {
  await requireDevPreviewAccess();
  return <HorsePagePreview />;
}
