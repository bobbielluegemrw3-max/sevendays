import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { APP_COPY } from '@/lib/i18n';
import { ChampionView, type HallChampion } from '@/components/champion/ChampionView';
import type { Buyback } from '@/components/BuybacksView';

/**
 * /champion — チャンピオンの栄誉を1ページに集約(ADR-011 / Decision 080)。
 * ループアニメ+報酬(旧buyback)+殿堂+リーグ予告。
 */
export default async function ChampionPage() {
  const lang = await getLang();
  const [rewards, hall] = await Promise.all([
    serverApiOrLogin<{ buybacks: Buyback[] }>('/api/v1/buybacks'),
    serverApi<{ champions: HallChampion[] }>('/api/v1/champions/hall'),
  ]);
  return (
    <ChampionView
      buybacks={rewards.buybacks}
      hall={hall.status === 200 ? hall.body.champions : []}
      t={APP_COPY[lang].champion}
    />
  );
}
