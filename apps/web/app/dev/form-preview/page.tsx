import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { FormPreview } from './FormPreview';

/** 馬柱(成績表)+予報の読解プレビュー(実装⑤a・モック)。本番は管理者のみ・それ以外404。 */
export default async function FormPreviewPage() {
  await requireDevPreviewAccess();
  return <FormPreview />;
}
