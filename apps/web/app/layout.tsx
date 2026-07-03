import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getAccessToken } from '@/lib/server-api';
import { LogoutButton } from '@/components/LogoutButton';

export const metadata: Metadata = {
  title: 'Seven Days Derby',
  description: 'Web3 horse racing — seven days to glory',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = (await getAccessToken()) !== null;
  return (
    <html lang="ja">
      <body>
        <nav className="topnav">
          <Link href="/" className="brand">
            Seven Days Derby
          </Link>
          {authed ? (
            <>
              <Link href="/wallet">ウォレット</Link>
              <Link href="/horses">馬</Link>
              <Link href="/races">レース</Link>
              <Link href="/purchase">購入</Link>
              <Link href="/buybacks">Buyback</Link>
              <Link href="/notifications">通知</Link>
              <span className="spacer" />
              <LogoutButton />
            </>
          ) : (
            <>
              <span className="spacer" />
              <Link href="/login">ログイン</Link>
            </>
          )}
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
