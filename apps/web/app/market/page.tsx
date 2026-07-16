import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { MarketPlaceView, type ListableHorse, type MarketPlaceData } from '@/components/MarketPlaceView';
import { PurchaseView, type Session } from '@/components/PurchaseView';
import { ReservePanel } from '@/components/ReservePanel';
import { TradeAutoTile, TradeModeModal, type TradeSettings } from '@/components/TradeAutoControls';
import type { Assignment } from '@/components/AssignmentList';
import { APP_COPY } from '@/lib/i18n';
import { getLang } from '@/lib/i18n-server';

/**
 * /market — 購入ファネル(Decision 085)。3幕構成:
 *   第1幕 SHOWCASE(出品中+実成約SOLDの棚)
 *   第2幕 購入予約パネル(残高連動・最大N頭)+予約一覧
 *   第3幕 予約完了の待機案内(ReservePanel内)
 * 出品管理・成約フィードは棚の下に続く。購入の入口はこのページのみ。
 */
export default async function MarketPage() {
  const [place, horses, sessions, assignments, wallet, trade] = await Promise.all([
    serverApiOrLogin<MarketPlaceData>('/api/v1/market/place'),
    serverApiOrLogin<{ horses: ListableHorse[] }>('/api/v1/horses'),
    serverApiOrLogin<{ sessions: Session[] }>('/api/v1/purchase'),
    serverApi<{ assignments: Assignment[] }>('/api/v1/assignments'),
    serverApiOrLogin<{ available: string; locked: string }>('/api/v1/wallet'),
    serverApi<TradeSettings>('/api/v1/trade-settings'),
  ]);
  const pendingCount = sessions.sessions.filter((s) => s.status === 'PENDING_ASSIGNMENT').length;
  const tradeSettings = trade.status === 200 ? trade.body : null;
  const tradeCopy = APP_COPY[await getLang()].trade;
  return (
    <MarketPlaceView
      data={place}
      myHorses={horses.horses}
      reserveSlot={
        <>
          <ReservePanel available={wallet.available} pendingCount={pendingCount} />
          {/* AUTOトグルはダッシュボードとここの2箇所(Decision 086) */}
          {tradeSettings ? <TradeAutoTile settings={tradeSettings} t={tradeCopy} /> : null}
          <PurchaseView
            sessions={sessions.sessions}
            assignments={assignments.status === 200 ? assignments.body.assignments : []}
          />
          {tradeSettings ? <TradeModeModal settings={tradeSettings} t={tradeCopy} /> : null}
        </>
      }
    />
  );
}
