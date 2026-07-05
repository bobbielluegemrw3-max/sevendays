import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { WalletView, type Wallet, type DepositInfo } from '@/components/WalletView';
import type { HistoryEntry } from '@/components/WalletHistory';

export default async function WalletPage() {
  const wallet = await serverApiOrLogin<Wallet>('/api/v1/wallet');
  const [deposit, history] = await Promise.all([
    serverApi<DepositInfo>('/api/v1/wallet/deposit', { method: 'POST' }),
    serverApi<{ entries: HistoryEntry[] }>('/api/v1/wallet/history'),
  ]);
  return (
    <WalletView
      wallet={wallet}
      deposit={deposit.status === 200 ? deposit.body : null}
      history={history.status === 200 ? history.body.entries : []}
    />
  );
}
