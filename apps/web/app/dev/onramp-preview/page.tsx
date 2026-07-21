import { requireDevPreviewAccess } from '@/lib/dev-preview';
import { OnrampGuide } from '@/components/OnrampGuide';
import { APP_COPY } from '@/lib/i18n';
import s from '@/app/wallet.module.css';

/* USDT入手ガイド(OnrampGuide)の視覚QA(本番404)。
 * メインネット移行時に /wallet の入金カード直下へ差し込む想定。
 * テストネット/デモUSDT運用中は本番の /wallet には出さない(混乱防止)。 */
export default async function OnrampPreview() {
  await requireDevPreviewAccess();
  return (
    <div className={s.wrap}>
      <div className={s.h1}>ウォレット(プレビュー: USDT入手ガイド)</div>
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', margin: '0 0 14px' }}>
        ↓ メインネット時に入金アドレスの直下へ差し込む。今はテストネットのため本番未表示。
      </p>
      <OnrampGuide address="0x0000000000000000000000000000000000000000" t={APP_COPY.ja.walletPage} />
    </div>
  );
}
