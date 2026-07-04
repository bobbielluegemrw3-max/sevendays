import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getAccessToken } from '@/lib/server-api';
import { LogoutButton } from '@/components/LogoutButton';

export const metadata: Metadata = {
  title: 'Seven Days Derby',
  description: '7日間のサバイバルレース。毎晩20:00、その日のすべての馬が一斉に発走。',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = (await getAccessToken()) !== null;
  return (
    <html lang="ja">
      <head>
        {/* Fonts matching the design handoff (Orbitron display, Space Grotesk,
            Zen Kaku Gothic New for Japanese, IBM Plex Mono for data). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Anonymous pages (landing / login) carry their own header. */}
        {authed ? (
          <nav className="topnav">
            <Link href="/" className="brand">
              <span className="brand-bars" aria-hidden="true">
                <span></span>
                <span></span>
              </span>
              SEVEN&nbsp;DERBY
            </Link>
            <Link href="/">HOME</Link>
            <Link href="/horses">STABLE</Link>
            <Link href="/races">RACE</Link>
            <Link href="/wallet">WALLET</Link>
            <Link href="/notifications">通知</Link>
            <span className="spacer" />
            <Link href="/account">アカウント</Link>
            <LogoutButton />
          </nav>
        ) : null}
        <main>{children}</main>
      </body>
    </html>
  );
}
