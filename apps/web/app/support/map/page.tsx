import { serverApiOrLogin } from '@/lib/server-api';
import { SupportMapView } from '@/components/SupportMapView';
import type { NetworkNode, PoolMember, SupportSummary } from '@/components/SupportView';

/** /support/map — 組織マップ(Decision 074)。薄い取得層+View。 */
export default async function SupportMapPage() {
  const [me, summary, pool, network] = await Promise.all([
    serverApiOrLogin<{ id: string }>('/api/v1/me'),
    serverApiOrLogin<SupportSummary>('/api/v1/support/summary'),
    serverApiOrLogin<{ members: PoolMember[] }>('/api/v1/support/pool'),
    serverApiOrLogin<{ nodes: NetworkNode[] }>('/api/v1/support/network'),
  ]);
  return (
    <SupportMapView
      data={{
        selfUserId: me.id,
        selfDisplay: 'あなた',
        network: network.nodes,
        pool: pool.members,
        tierAmounts: summary.tier_amounts,
      }}
    />
  );
}
