'use client';

import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/client-api';

export function LogoutButton() {
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
      ログアウト
    </button>
  );
}
