import { serverApiOrLogin } from '@/lib/server-api';
import {
  SupportView,
  type BonusRow,
  type NetworkNode,
  type PoolMember,
  type SupportSummary,
} from '@/components/SupportView';

/** /support — サポートネットワーク(Decision 074)。薄い取得層+View。 */
export default async function SupportPage() {
  const [me, summary, pool, network, bonuses] = await Promise.all([
    serverApiOrLogin<{ id: string }>('/api/v1/me'),
    serverApiOrLogin<SupportSummary>('/api/v1/support/summary'),
    serverApiOrLogin<{ members: PoolMember[] }>('/api/v1/support/pool'),
    serverApiOrLogin<{ nodes: NetworkNode[] }>('/api/v1/support/network'),
    serverApiOrLogin<{ bonuses: BonusRow[] }>('/api/v1/support/bonuses'),
  ]);
  return (
    <SupportView
      selfUserId={me.id}
      data={{
        summary,
        pool: pool.members,
        network: network.nodes,
        bonuses: bonuses.bonuses,
      }}
    />
  );
}
