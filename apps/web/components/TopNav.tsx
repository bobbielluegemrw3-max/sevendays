import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { DerbyCountdown } from '@/components/DerbyCountdown';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { NavMore } from '@/components/NavMore';
import { APP_COPY, type Lang } from '@/lib/i18n';

/**
 * Signed-in header. The brand lockup mirrors the landing page exactly
 * (bar + "SEVEN DAYS" over "DERBY") so the logo reads as one product on
 * both sides of the login. Links are grouped: game pages (EN labels kept
 * across all languages as section names), then a separator, then utility
 * pages (localized labels, dimmer). On narrow screens the link row drops
 * below the brand and scrolls horizontally.
 */
export function TopNav({ isAdmin = false, unread = 0, lang = 'ja', engineV2 = false }: { isAdmin?: boolean; unread?: number; lang?: Lang; engineV2?: boolean }) {
  const t = APP_COPY[lang].nav;
  return (
    <nav className="topnav">
      <Link href="/dashboard" className="brand" aria-label="Seven Days Derby">
        <span className="brand-bar" aria-hidden="true" />
        <span className="brand-lock">
          <span className="brand-l1">SEVEN&nbsp;DAYS</span>
          <span className="brand-l2">DERBY</span>
        </span>
      </Link>
      {/* 主要6だけを常時出す(UI_FOUNDATION_PLAN 2-2)。毎日使うのは
          DASHBOARD/STABLE/RACE、週数回が MARKET/ITEMS、週1が WALLET。
          残り(CHAMPION/BREEDERS/LEDGER/TEAM/通知/アカウント/ガイド/問合せ)は
          右の MORE ドロワーへ。ADMIN は管理者だけに出る別系統なので残す。 */}
      <div className="topnav-links">
        <Link href="/dashboard">DASHBOARD</Link>
        <Link href="/horses">STABLE</Link>
        <Link href="/races">RACE</Link>
        <Link href="/market">MARKET</Link>
        <Link href="/items">ITEMS</Link>
        <Link href="/wallet">WALLET</Link>
        {isAdmin && (
          <Link href="/admin" className="topnav-admin">ADMIN</Link>
        )}
      </div>
      <span className="spacer" />
      <DerbyCountdown engineV2={engineV2} />
      <NavMore
        t={{ notifications: t.notifications, account: t.account, guide: t.guide, contact: t.contact }}
        unread={unread}
      />
      <LanguageSwitcher current={lang} />
      <LogoutButton label={t.logout} />
    </nav>
  );
}
