import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { AccountLinking } from '@/components/AccountLinking';

interface Me {
  id: string;
  email: string;
  created_at: string;
}

interface Wallet {
  wallet_address: string;
  created_at: string;
}

export default async function AccountPage() {
  const me = await serverApiOrLogin<Me>('/api/v1/me');
  const wallets = await serverApi<{ wallets: Wallet[] }>('/api/v1/account/wallets');

  return (
    <>
      <h1>アカウント</h1>
      <div className="panel">
        <table>
          <tbody>
            <tr>
              <th>ユーザーID</th>
              <td>
                <code>{me.id}</code>
              </td>
            </tr>
            <tr>
              <th>メール</th>
              <td>{me.email.endsWith('@user.sevendays') ? '(未設定 — ウォレットログイン)' : me.email}</td>
            </tr>
            <tr>
              <th>登録日</th>
              <td className="muted">{me.created_at.slice(0, 10)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>ログイン方法の連携</h2>
      <div className="panel">
        <p className="muted">
          連携すると、どのログイン方法でも同じアカウント(残高・馬)にアクセスできます。
          1つのウォレットは1つのアカウントにのみ紐づけできます。
        </p>
        <AccountLinking
          userId={me.id}
          wallets={wallets.status === 200 ? wallets.body.wallets.map((w) => w.wallet_address) : []}
        />
      </div>
    </>
  );
}
