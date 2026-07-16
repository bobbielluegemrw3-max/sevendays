import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { WalletView, type Wallet, type DepositInfo } from '@/components/WalletView';
import type { HistoryEntry } from '@/components/WalletHistory';
import { horseValue } from '@/components/stable-shared';
import { APP_COPY } from '@/lib/i18n';
import { getLang } from '@/lib/i18n-server';

interface WalletHorse { status: string; current_day: number }

export default async function WalletPage() {
  const wallet = await serverApiOrLogin<Wallet>('/api/v1/wallet');
  const [deposit, history, horsesR, lang] = await Promise.all([
    serverApi<DepositInfo>('/api/v1/wallet/deposit', { method: 'POST' }),
    serverApi<{ entries: HistoryEntry[] }>('/api/v1/wallet/history'),
    serverApi<{ horses: WalletHorse[] }>('/api/v1/horses'),
    getLang(),
  ]);
  // 総資産カード用: 現役馬の評価額合計(ダッシュボードと同じ公開価格テーブル基準)
  const stableValue = (horsesR.status === 200 ? horsesR.body.horses : [])
    .filter((h) => h.status === 'ACTIVE')
    .reduce((sum, h) => sum + Number(horseValue(h.current_day)), 0);
  return (
    <WalletView
      wallet={wallet}
      deposit={deposit.status === 200 ? deposit.body : null}
      history={history.status === 200 ? history.body.entries : []}
      stableValue={stableValue}
      assetsCopy={APP_COPY[lang].dash}
    />
  );
}
