import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { TrainPanelPlans } from './Plans';

/** 調教パネル再設計案の比較プレビュー(モック)。本番は管理者のみ・それ以外404。 */
export default async function TrainPanelPreviewPage() {
  await requireDevPreviewAccess();
  return <TrainPanelPlans />;
}
