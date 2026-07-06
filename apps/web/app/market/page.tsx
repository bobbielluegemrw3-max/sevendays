import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { MarketPlaceView, type ListableHorse, type MarketPlaceData } from '@/components/MarketPlaceView';
import { PurchaseView, type Session } from '@/components/PurchaseView';
import type { Assignment } from '@/components/AssignmentList';

/**
 * /market — 見えるマーケットプレイス(Decision 076)。
 * 上段=市場(需要・出品棚・成約・自分の出品)、下段=買い予約(既存の購入UI)。
 */
export default async function MarketPage() {
  const [place, horses, sessions, assignments] = await Promise.all([
    serverApiOrLogin<MarketPlaceData>('/api/v1/market/place'),
    serverApiOrLogin<{ horses: ListableHorse[] }>('/api/v1/horses'),
    serverApiOrLogin<{ sessions: Session[] }>('/api/v1/purchase'),
    serverApi<{ assignments: Assignment[] }>('/api/v1/assignments'),
  ]);
  return (
    <>
      <MarketPlaceView data={place} myHorses={horses.horses} />
      <PurchaseView
        sessions={sessions.sessions}
        assignments={assignments.status === 200 ? assignments.body.assignments : []}
      />
    </>
  );
}
