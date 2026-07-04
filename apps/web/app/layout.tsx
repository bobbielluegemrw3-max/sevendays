import type { Metadata } from 'next';
import Link from 'next/link';
import { Orbitron, Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { getAccessToken } from '@/lib/server-api';
import { LogoutButton } from '@/components/LogoutButton';

const orbitron = Orbitron({ subsets: ['latin'], weight: ['500', '600', '700', '800', '900'], variable: '--f-display' });
const grotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--f-sans' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--f-mono' });

export const metadata: Metadata = {
  title: 'Seven Days Derby',
  description: '7日間のダービー — 毎晩20:00、全馬が一斉に発走。生き残った馬だけがDay7の栄光へ。',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = (await getAccessToken()) !== null;
  return (
    <html lang="ja" className={`${orbitron.variable} ${grotesk.variable} ${plexMono.variable}`}>
      <body>
        <nav className="topnav">
          <Link href="/" className="brand">
            <span className="brand-bars" aria-hidden="true">
              <span></span>
              <span></span>
            </span>
            SEVEN&nbsp;DERBY
          </Link>
          {authed ? (
            <>
              <Link href="/">HOME</Link>
              <Link href="/horses">STABLE</Link>
              <Link href="/races">RACE</Link>
              <Link href="/wallet">WALLET</Link>
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
