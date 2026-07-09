'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '../app/admin.module.css';

/* ============================================================================
 * Admin ナビ(client) — アクティブ強調 + モバイル横スクロール帯。
 * 権限境界は API 層(JWT + role)で強制。レイアウトの probe は layout.tsx が行い、
 * このコンポーネントはナビ描画とアクティブ判定だけを担う。
 * ========================================================================== */

const LINKS: { href: string; label: string }[] = [
  { href: '/admin', label: 'ダッシュボード' },
  { href: '/admin/economy', label: '経済' },
  { href: '/admin/users', label: 'ユーザー' },
  { href: '/admin/items', label: 'アイテム' },
  { href: '/admin/races', label: 'レース' },
  { href: '/admin/support', label: 'サポート' },
  { href: '/admin/batches', label: 'バッチ' },
  { href: '/admin/withdrawals', label: '出金レビュー' },
  { href: '/admin/recovery', label: 'リカバリ' },
  { href: '/admin/audit', label: '監査ログ' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className={s.nav} aria-label="管理メニュー">
      <span className={s.brand}><span className={s.brandDot} />ADMIN</span>
      {LINKS.map((l) => {
        const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`${s.navLink} ${active ? s.navActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
