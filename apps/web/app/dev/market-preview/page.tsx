import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { MarketplacePreview } from './MarketplacePreview';

/**
 * /market 3幕再デザイン(マーケットプレイス)プレビュー — デザイナー正典 Marketplace.html の忠実写経。
 * 迎える(ACT1)/手放す(ACT2)/清算(ACT3)＋手放し確認モーダル。fixture・本番はAPI値へ差し替え。
 * 本番は管理者のみ・それ以外404。承認後に本番結線(既存機構・盲目プッシュ禁止)。
 */
export default async function MarketPreviewPage() {
  await requireDevPreviewAccess();
  return <MarketplacePreview />;
}
