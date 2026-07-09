import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { DerbyCountdown } from '@/components/DerbyCountdown';

/**
 * Signed-in header. The brand lockup mirrors the landing page exactly
 * (bar + "SEVEN DAYS" over "DERBY") so the logo reads as one product on
 * both sides of the login. On narrow screens the link row drops below the
 * brand and scrolls horizontally instead of wrapping.
 */
export function TopNav({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <nav className="topnav">
      <Link href="/dashboard" className="brand" aria-label="Seven Days Derby">
        <span className="brand-bar" aria-hidden="true" />
        <span className="brand-lock">
          <span className="brand-l1">SEVEN&nbsp;DAYS</span>
          <span className="brand-l2">DERBY</span>
        </span>
      </Link>
      <div className="topnav-links">
        <Link href="/dashboard">HOME</Link>
        <Link href="/horses">STABLE</Link>
        <Link href="/races">RACE</Link>
        <Link href="/market">MARKET</Link>
        <Link href="/items">ITEMS</Link>
        <Link href="/champion">CHAMPION</Link>
        <Link href="/wallet">WALLET</Link>
        <Link href="/support">TEAM</Link>
        <Link href="/notifications">通知</Link>
        <Link href="/account">アカウント</Link>
        <Link href="/contact">お問い合わせ</Link>
        {isAdmin && (
          <Link href="/admin" className="topnav-admin">ADMIN</Link>
        )}
      </div>
      <span className="spacer" />
      <DerbyCountdown />
      <LogoutButton />
    </nav>
  );
}
