import { redirect } from 'next/navigation';

/** ADR-011互換: /champions → /champion(栄誉ページに集約)。 */
export default function ChampionsRedirect(): never {
  redirect('/champion');
}
