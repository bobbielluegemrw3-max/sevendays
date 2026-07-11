import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { MarketPlaceView, type ListableHorse, type MarketPlaceData } from '@/components/MarketPlaceView';
import { PurchaseView, type Session } from '@/components/PurchaseView';
import { ReservePanel } from '@/components/ReservePanel';
import type { Assignment } from '@/components/AssignmentList';

/**
 * /market — 購入ファネル(Decision 085)。3幕構成:
 *   第1幕 SHOWCASE(出品中+実成約SOLDの棚)
 *   第2幕 購入予約パネル(残高連動・最大N頭)+予約一覧
 *   第3幕 予約完了の待機案内(ReservePanel内)
 * 出品管理・成約フィードは棚の下に続く。購入の入口はこのページのみ。
 */
export default async function MarketPage() {
  const [place, horses, sessions, assignments, wallet] = await Promise.all([
    serverApiOrLogin<MarketPlaceData>('/api/v1/market/place'),
    serverApiOrLogin<{ horses: ListableHorse[] }>('/api/v1/horses'),
    serverApiOrLogin<{ sessions: Session[] }>('/api/v1/purchase'),
    serverApi<{ assignments: Assignment[] }>('/api/v1/assignments'),
    serverApiOrLogin<{ available: string; locked: string }>('/api/v1/wallet'),
  ]);
  const pendingCount = sessions.sessions.filter((s) => s.status === 'PENDING_ASSIGNMENT').length;
  return (
    <MarketPlaceView
      data={place}
      myHorses={horses.horses}
      reserveSlot={
        <>
          <ReservePanel available={wallet.available} pendingCount={pendingCount} />
          <PurchaseView
            sessions={sessions.sessions}
            assignments={assignments.status === 200 ? assignments.body.assignments : []}
          />
        </>
      }
    />
  );
}
