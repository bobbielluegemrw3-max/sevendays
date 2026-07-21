import { serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { APP_COPY } from '@/lib/i18n';
import { BreedersView, type BreederRow } from '@/components/BreedersView';

/**
 * /breeders — 名伯楽ランキング(施策D / FUN_V3)。
 * 調教の実力ぶん(delta_v2)の総和で並ぶ「腕」の指標。総合値・資産とは独立。
 */
export default async function BreedersPage() {
  const lang = await getLang();
  const res = await serverApiOrLogin<{ breeders: BreederRow[] }>('/api/v1/breeders');
  return <BreedersView breeders={res.breeders} t={APP_COPY[lang].breeders} />;
}
