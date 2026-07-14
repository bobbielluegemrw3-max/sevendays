'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import s from '../app/admin.module.css';

/* 管理ナビ(コックピット改修 2026-07-14) — 使用頻度で3グループに区切る:
 *   毎日(バッチ/レース/サポート) / 資金(経済/出金/リカバリ) / 管理(その他)。
 * href/ルーティングは不変。モバイルは横スクロール帯のまま(グループ区切りが
 * スクロール中の現在地の手がかりになる)。
 * 「デモ上映」= /dev/derby-preview(管理者のみ・20:00を待たない演出上映室)。 */
const GROUPS: { label: string; links: { href: string; label: string }[] }[] = [
  {
    label: '毎日',
    links: [
      { href: '/admin', label: 'ダッシュボード' },
      { href: '/admin/batches', label: 'バッチ' },
      { href: '/admin/races', label: 'レース' },
      { href: '/admin/support', label: 'サポート' },
    ],
  },
  {
    label: '資金',
    links: [
      { href: '/admin/economy', label: '経済' },
      { href: '/admin/withdrawals', label: '出金レビュー' },
      { href: '/admin/recovery', label: 'リカバリ' },
    ],
  },
  {
    label: '管理',
    links: [
      { href: '/admin/users', label: 'ユーザー' },
      { href: '/admin/promo', label: 'プロモ' },
      { href: '/admin/items', label: 'アイテム' },
      { href: '/admin/audit', label: '監査ログ' },
      { href: '/dev/derby-preview', label: 'デモ上映' },
    ],
  },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className={s.nav} aria-label="管理メニュー">
      <span className={s.navBrand}>
        <span className={s.navBar} />
        <span className={s.navBrandT}>ADMIN</span>
      </span>
      {GROUPS.map((g, gi) => (
        <span key={g.label} className={s.navGroup}>
          {gi > 0 ? <span className={s.navSep} aria-hidden /> : null}
          <span className={s.navGroupLabel}>{g.label}</span>
          {g.links.map((l) => {
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
        </span>
      ))}
    </nav>
  );
}
