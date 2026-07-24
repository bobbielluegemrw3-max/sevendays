import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { ItemsPreview } from './ItemsPreview';

/**
 * /items 2本柱再デザイン(道具部屋)プレビュー — デザイナー正典 Items.html の忠実写経。
 * 🔵強くする(調教)/🔴今夜に賭ける(レース)の2本柱＋予報の手がかり＋マイアイテム＋履歴。
 * fixture(V3カタログ・在庫/予報は代表値)。本番は管理者のみ・それ以外404。
 * 承認後に本番 ItemsView へ結線(機構不変・盲目プッシュ禁止)。
 */
export default async function ItemsPreviewPage() {
  await requireDevPreviewAccess();
  return <ItemsPreview />;
}
