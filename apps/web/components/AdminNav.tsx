'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '../app/admin.module.css';

/* 管理ナビ(Ops Consoleリデザイン 2026-07-13) — 絵文字を廃し、単色ラベル+
   現在地の下線ハイライトのみ。href/順序は既存ルーティング準拠。
   「デモ上映」= /dev/derby-preview(管理者のみ・20:00を待たない演出上映室)。 */
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
  { href: '/dev/derby-preview', label: 'デモ上映' },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className={s.nav} aria-label="管理メニュー">
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
            aria-current={active ? 'page' : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
