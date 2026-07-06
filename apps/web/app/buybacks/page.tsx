import { redirect } from 'next/navigation';

/** 旧URL互換(Decision 075): /buybacks → /champion。 */
export default function LegacyBuybacksRedirect(): never {
  redirect('/champion');
}
