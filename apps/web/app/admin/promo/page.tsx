import { serverApi } from '@/lib/server-api';
import { AdminPromoView, type AdminPromo } from '@/components/AdminPromoView';

/** /admin/promo — セミナー特典馬の在庫・コード・配布(Decision 095)。 */
export default async function AdminPromoPage() {
  const result = await serverApi<AdminPromo>('/api/v1/admin/promo/codes');
  if (result.status !== 200) return <p className="error">プロモデータを取得できません。</p>;
  return <AdminPromoView data={result.body} />;
}
