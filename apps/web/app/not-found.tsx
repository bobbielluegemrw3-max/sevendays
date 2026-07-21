import Link from 'next/link';
import { ErrorState } from '@/components/ui/ErrorState';
import { getLang } from '@/lib/i18n-server';
import { ERROR_COPY } from '@/lib/error-copy';

/* 404(UI基盤 3-3)。サーバーコンポーネントなので cookie から言語を読める。
   tone は notice — 見つからないことは「失敗」ではないので赤くしない。 */
export default async function NotFound() {
  const t = ERROR_COPY[await getLang()];
  return (
    <ErrorState title={t.nf_title} body={t.nf_body} tone="notice" live="polite">
      <Link href="/dashboard">{t.nf_home}</Link>
    </ErrorState>
  );
}
