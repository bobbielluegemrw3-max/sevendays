'use client';

import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/client-api';
import { APP_COPY, type Lang } from '@/lib/i18n';

export function LogoutButton({ lang = 'ja' }: { lang?: Lang }) {
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
      {APP_COPY[lang].nav.logout}
    </button>
  );
}
