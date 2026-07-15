import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { getLang } from '@/lib/i18n-server';
import { AccountView, type AccountStats, type Me, type Wallet } from '@/components/AccountView';
import type { TradeSettings } from '@/components/TradeAutoControls';

interface HorseRow { status: string; listing: string | null }
interface SessionRow { status: string }

/** /account — 設定とあなたの記録のハブ(2026-07-12)。集計はすべて既存APIの実データ。 */
export default async function AccountPage() {
  const lang = await getLang();
  const me = await serverApiOrLogin<Me>('/api/v1/me');
  const [wallets, horses, sessions, trade] = await Promise.all([
    serverApi<{ wallets: Wallet[] }>('/api/v1/account/wallets'),
    serverApi<{ horses: HorseRow[] }>('/api/v1/horses'),
    serverApi<{ sessions: SessionRow[] }>('/api/v1/purchase'),
    serverApi<TradeSettings>('/api/v1/trade-settings'),
  ]);

  const hs = horses.status === 200 ? horses.body.horses : [];
  const stats: AccountStats = {
    racing: hs.filter((h) => h.status === 'ACTIVE' && h.listing !== 'MANUAL').length,
    listed: hs.filter((h) => h.status === 'ACTIVE' && h.listing === 'MANUAL').length,
    champions: hs.filter((h) => h.status === 'DAY7_CLEARED' || h.status === 'MEMORIALIZED').length,
    burned: hs.filter((h) => h.status === 'BURNED').length,
    pendingReservations:
      sessions.status === 200
        ? sessions.body.sessions.filter((x) => x.status === 'PENDING_ASSIGNMENT').length
        : 0,
  };

  return (
    <AccountView
      me={me}
      wallets={wallets.status === 200 ? wallets.body.wallets : []}
      stats={stats}
      trade={trade.status === 200 ? trade.body : null}
      lang={lang}
    />
  );
}
