import { redirect } from 'next/navigation';

/** 旧URL互換(Decision 076): /purchase → /market(購入UIはマーケットに統合)。 */
export default function LegacyPurchaseRedirect(): never {
  redirect('/market');
}
