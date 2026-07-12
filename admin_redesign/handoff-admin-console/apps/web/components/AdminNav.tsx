'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '../app/admin.module.css';

/* 管理ナビ — 絵文字を廃し、単色ラベル＋現在地の下線ハイライトのみ。
   href/順序は既存のルーティングに合わせて調整すること（ラベルのみ確定）。 */
const LINKS: { href: string; label: string }[] = [
  { href: '/admin',             label: 'ダッシュボード' },
  { href: '/admin/economy',     label: '経済' },
  { href: '/admin/users',       label: 'ユーザー' },
  { href: '/admin/items',       label: 'アイテム' },
  { href: '/admin/races',       label: 'レース' },
  { href: '/admin/support',     label: 'サポート' },
  { href: '/admin/batches',     label: 'バッチ' },
  { href: '/admin/withdrawals', label: '出金' },
  { href: '/admin/recovery',    label: 'リカバリ' },
  { href: '/admin/audit',       label: '監査ログ' },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className={s.nav}>
      <span className={s.navBrand}>
        <span className={s.navBar} />
        <span className={s.navBrandT}>ADMIN</span>
      </span>
      {LINKS.map((l) => {
        const active = l.href === '/admin' ? path === '/admin' : path?.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={active ? `${s.navLink} ${s.navActive}` : s.navLink}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
