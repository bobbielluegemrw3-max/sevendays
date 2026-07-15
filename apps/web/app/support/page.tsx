import { serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { SupportDashboardView } from '@/components/SupportDashboardView';
import type { BonusRow, NetworkNode, SupportSummary } from '@/components/SupportView';

/** /support — サポートボーナス ダッシュボード(Decision 074)。薄い取得層+View。 */
export default async function SupportPage() {
  const lang = await getLang();
  const [summary, network, bonuses] = await Promise.all([
    serverApiOrLogin<SupportSummary>('/api/v1/support/summary'),
    serverApiOrLogin<{ nodes: NetworkNode[] }>('/api/v1/support/network'),
    serverApiOrLogin<{ bonuses: BonusRow[] }>('/api/v1/support/bonuses'),
  ]);
  return (
    <SupportDashboardView
      data={{ summary, bonuses: bonuses.bonuses, networkCount: network.nodes.length }}
      lang={lang}
    />
  );
}
