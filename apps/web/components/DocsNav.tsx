'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '@/app/docs/docs.module.css';

const ITEMS = [
  { href: '/docs', label: 'Overview' },
  { href: '/docs/community', label: 'The Community' },
  { href: '/docs/funds', label: 'How Funds Are Handled' },
  { href: '/docs/fairness', label: 'Fairness & Determinism' },
  { href: '/docs/risk', label: 'Risk Disclosure' },
] as const;

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav className={s.side} aria-label="Documentation">
      <div className={s.sideLabel}>Documentation</div>
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${s.navLink} ${pathname === item.href ? s.navActive : ''}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
