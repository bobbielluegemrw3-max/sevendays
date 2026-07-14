import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';

/* メンテナンス画面(Decision 098)の視覚QA(本番404)。
 * 実際の遮断はRootLayout+api-bridgeが担う — これは見た目の確認のみ。
 * ?msg=… で任意メッセージ、なしで既定表示。 */
export default async function MaintenancePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireDevPreviewAccess();
  const { msg } = await searchParams;
  return <MaintenanceScreen message={msg ?? '2026-07-15 02:00頃までを予定しています。'} />;
}
