'use client';

import { useEffect, useState } from 'react';
import './globals.css';
import { ErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { errorCopyFromCookie, ERROR_COPY, type ErrorCopy } from '@/lib/error-copy';

/* ルートレイアウト自体が落ちたときの最後の受け皿(UI基盤 3-3)。
 *
 * この境界は layout.tsx を置き換えるため、<html>/<body> を自前で持つ必要がある
 * (TopNav も main もここには無い)。globals.css を直接 import しているのは
 * そのため — レイアウトが落ちている以上、スタイルも継承できない。
 *
 * 出口は「もう一度読み込む」だけにする。ここに至った時点でナビも描けない。 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [t, setT] = useState<ErrorCopy>(ERROR_COPY.ja);

  useEffect(() => {
    setT(errorCopyFromCookie());
    console.error('[global error boundary]', error.digest ?? '', error.message);
  }, [error]);

  return (
    <html lang="ja">
      <body>
        <main>
          <ErrorState
            title={t.err_title}
            body={t.err_body}
            detail={error.digest ? `${t.err_ref}: ${error.digest}` : undefined}
          >
            <Button variant="primary" onClick={() => reset()}>{t.err_retry}</Button>
          </ErrorState>
        </main>
      </body>
    </html>
  );
}
