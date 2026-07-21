'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { errorCopyFromCookie, ERROR_COPY, type ErrorCopy } from '@/lib/error-copy';

/* ルートのエラーバウンダリ(UI基盤 3-3)。
 *
 * 監査時点で error.tsx / global-error.tsx / not-found.tsx が1本も無く、
 * ページ内で throw されると Next.js の既定画面(英語・出口なし)に落ちていた。
 *
 * 文言は cookie から読むが、SSR と初回描画の不一致を避けるため既定(ja)で
 * 描いてから effect で差し替える(ハイドレーション不整合を作らない)。 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [t, setT] = useState<ErrorCopy>(ERROR_COPY.ja);

  useEffect(() => {
    setT(errorCopyFromCookie());
  }, []);

  useEffect(() => {
    // 遠隔デバッグ則: 本番の失敗は console にも残す(digest でサーバーログと突合)
    console.error('[error boundary]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <ErrorState
      title={t.err_title}
      body={t.err_body}
      detail={error.digest ? `${t.err_ref}: ${error.digest}` : undefined}
    >
      <Button variant="primary" onClick={() => reset()}>{t.err_retry}</Button>
      <Link href="/dashboard">{t.err_home}</Link>
    </ErrorState>
  );
}
