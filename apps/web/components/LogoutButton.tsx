'use client';

import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/client-api';

/** label はサーバー親(TopNav)が APP_COPY[lang].nav.logout を渡す(辞書の
 * クライアント混入を避ける i18n-shared 分離方針)。 */
export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      className="secondary"
      onClick={() => {
        void supabaseBrowser()
          .auth.signOut()
          .then(() => {
            router.push('/');
            router.refresh();
          });
      }}
    >
      {label}
    </button>
  );
}
