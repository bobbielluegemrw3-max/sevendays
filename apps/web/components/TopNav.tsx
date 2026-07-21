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
      {/* ゲーム導線は常時出す(UI_FOUNDATION_PLAN 2-2 をオーナー判断で調整・
          2026-07-21)。計画書は「主要6+その他」だったが、LEDGER(透明性台帳=
          信頼の看板)と CHAMPION を畳むのは「見せたいものを隠す」方向に働く。
          畳むのは稀にしか使わない実用リンクだけにする。
          ADMIN は管理者だけに出る別系統なので残す。 */}
      <div className="topnav-links">
        <Link href="/dashboard">DASHBOARD</Link>
        <Link href="/horses">STABLE</Link>
        <Link href="/races">RACE</Link>
        <Link href="/market">MARKET</Link>
        <Link href="/items">ITEMS</Link>
        <Link href="/wallet">WALLET</Link>
        <Link href="/champion">CHAMPION</Link>
        <Link href="/ledger">LEDGER</Link>
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
