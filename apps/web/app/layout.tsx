import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getAccessToken } from '@/lib/server-api';
import { LogoutButton } from '@/components/LogoutButton';

export const metadata: Metadata = {
  title: 'Seven Days Derby',
  description: '7日間のダービー — 毎晩20:00、全馬が一斉に走る',
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
              <Link href="/">ホーム</Link>
              <Link href="/horses">マイ厩舎</Link>
              <Link href="/races">レース</Link>
              <Link href="/wallet">ウォレット</Link>
              <Link href="/notifications">通知</Link>
              <span className="spacer" />
              <Link href="/account">アカウント</Link>
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
