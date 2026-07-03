import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { WithdrawForm } from '@/components/WithdrawForm';

interface Wallet {
  available: string;
  locked: string;
}

interface DepositInfo {
  address: string;
  chain_id: string;
  asset: string;
  confirmations_required: number;
}

interface HistoryEntry {
  type: string;
  direction: string;
  amount: string;
  account: string;
  created_at: string;
}

export default async function WalletPage() {
  const wallet = await serverApiOrLogin<Wallet>('/api/v1/wallet');
  const [deposit, history] = await Promise.all([
    serverApi<DepositInfo>('/api/v1/wallet/deposit', { method: 'POST' }),
    serverApi<{ entries: HistoryEntry[] }>('/api/v1/wallet/history'),
  ]);

  return (
    <>
      <h1>ウォレット</h1>
      <div className="grid">
        <div className="panel stat">
          <div className="label">利用可能</div>
          <div className="value">{wallet.available} USDT</div>
        </div>
        <div className="panel stat">
          <div className="label">ロック中</div>
          <div className="value">{wallet.locked} USDT</div>
        </div>
      </div>

      <h2>入金</h2>
      <div className="panel">
        {deposit.status === 200 ? (
          <>
            <p>
              あなた専用の入金アドレス({deposit.body.chain_id} / {deposit.body.asset}):
            </p>
            <p>
              <code>{deposit.body.address}</code>
            </p>
            <p className="muted">
              {deposit.body.confirmations_required}
              ブロック確認後に残高へ反映されます。USDT以外・他チェーンからの送金は失われます。
            </p>
          </>
        ) : (
          <p className="muted">入金アドレスを準備中です。しばらくしてから再度お試しください。</p>
        )}
      </div>

      <h2>出金</h2>
      <div className="panel">
        <WithdrawForm />
      </div>

      <h2>履歴</h2>
      <div className="panel">
        {history.status === 200 && history.body.entries.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>種別</th>
                <th>勘定</th>
                <th>方向</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              {history.body.entries.map((e, i) => (
                <tr key={i}>
                  <td className="muted">{e.created_at.slice(0, 19)}</td>
                  <td>{e.type}</td>
                  <td>{e.account}</td>
                  <td>{e.direction}</td>
                  <td>{e.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">履歴はまだありません。</p>
        )}
      </div>
    </>
  );
}
