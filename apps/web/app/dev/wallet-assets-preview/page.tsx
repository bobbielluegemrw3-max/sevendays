import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { WalletAssetsPreview } from './WalletAssetsPreview';

/**
 * 総資産カード → ウォレット現金ビュー再フレーム(WALLET_HARDENING §4 C)プレビュー。
 * 「総資産/TOTAL/損益/増減」の投資フレーミングを廃止し、現金中心の中立ビューに:
 *   今あるお金(使える残高+ロック中) + これから入るお金(受取予定=チャンピオン買取残) +
 *   厩舎の馬(参考価値・別枠・合算しない)。
 * fixture(代表値の複数パターン)。本番は管理者のみ・それ以外404。
 * 承認後に WalletView/DashboardView へ結線(受取予定=buyback_schedule_payments SCHEDULED)。
 */
export default async function WalletAssetsPreviewPage(): Promise<React.JSX.Element> {
  await requireDevPreviewAccess();
  return <WalletAssetsPreview />;
}
