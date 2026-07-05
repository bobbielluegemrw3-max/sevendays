import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { AccountView, type Me, type Wallet } from '@/components/AccountView';

export default async function AccountPage() {
  const me = await serverApiOrLogin<Me>('/api/v1/me');
  const wallets = await serverApi<{ wallets: Wallet[] }>('/api/v1/account/wallets');
  return <AccountView me={me} wallets={wallets.status === 200 ? wallets.body.wallets : []} />;
}
