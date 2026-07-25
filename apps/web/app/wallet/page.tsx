import { serverApi, serverApiOrLogin } from '@/lib/server-api';
import { WalletView, type Wallet, type DepositInfo } from '@/components/WalletView';
import type { HistoryEntry } from '@/components/WalletHistory';
import { horseValue, uncollectedGain } from '@/components/stable-shared';
import { APP_COPY } from '@/lib/i18n';
import { getLang } from '@/lib/i18n-server';

interface WalletHorse { status: string; current_day: number; trained_for_next_race: boolean; listing?: string | null }

export default async function WalletPage() {
  // 全部を1段の並列取得に(2026-07-16 §D: wallet先行の直列1往復を解消)。
  const [wallet, deposit, history, horsesR, walletsR, lang] = await Promise.all([
    serverApiOrLogin<Wallet>('/api/v1/wallet'),
    serverApi<DepositInfo>('/api/v1/wallet/deposit', { method: 'POST' }),
    serverApi<{ entries: HistoryEntry[] }>('/api/v1/wallet/history'),
    serverApi<{ horses: WalletHorse[] }>('/api/v1/horses'),
    // A3: 出金先ホワイトリスト(連携ウォレット)。出金可能なものだけフォームに出す。
    serverApi<{ wallets: Array<{ wallet_address: string; withdrawable: boolean }> }>('/api/v1/account/wallets'),
    getLang(),
  ]);
  const withdrawableWallets =
    walletsR.status === 200
      ? walletsR.body.wallets.filter((w) => w.withdrawable).map((w) => w.wallet_address)
      : [];
  // 総資産カード用: 現役馬の評価額合計(ダッシュボードと同じ公開価格テーブル基準)
  const walletHorses = horsesR.status === 200 ? horsesR.body.horses : [];
  const stableValue = walletHorses
    .filter((h) => h.status === 'ACTIVE')
    .reduce((sum, h) => sum + Number(horseValue(h.current_day)), 0);
  // 未回収(利確待ち)— A2の収穫の儀式(FUN_V2_PLAN §3)
  const uncollected = walletHorses.reduce((sum, h) => sum + uncollectedGain(h), 0);
  return (
    <WalletView
      wallet={wallet}
      deposit={deposit.status === 200 ? deposit.body : null}
      history={history.status === 200 ? history.body.entries : []}
      stableValue={stableValue}
      uncollected={uncollected}
      withdrawableWallets={withdrawableWallets}
      assetsCopy={APP_COPY[lang].dash}
      t={APP_COPY[lang].walletPage}
    />
  );
}
