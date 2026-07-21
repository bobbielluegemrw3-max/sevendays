'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/* TopNav の「その他」ドロワー(UI_FOUNDATION_PLAN 2-2)。
 *
 * 旧: 13項目が1行に並び、毎日使う3つ(DASHBOARD/STABLE/RACE)と年に数回の
 * 問合せが同じ音量で置かれていた。さらに 700px 以下では横スクロール行に
 * なるため、後半の項目に気づけなかった。
 *
 * 畳むのは「稀にしか使わない実用リンク」だけ(オーナー判断・2026-07-21)。
 * ゲーム導線 — とくに LEDGER(透明性台帳)と CHAMPION、そして常時表示に
 * 値するものは topnav に残す。公開したばかりの導線を畳むと「見せたいものを
 * 隠す」ことになるため、ここへ入れる基準は用途の頻度だけで決める。
 *
 * ドロワーは .topnav-links(モバイルでは折り返す行)の外側 = ナビ右クラスタに
 * 置く — スクロールする領域の中だと絶対配置のパネルが切り落とされる。
 *
 * 通知の未読はドロワーの中に隠れてしまうため、ボタン側にも数を出す
 * (畳んだせいで気づけなくなる情報を作らない)。
 *
 * A11y: aria-haspopup/aria-expanded、Esc と外側クリックで閉じる、
 * 遷移したら閉じる(Linkでルートが変わってもコンポーネントは生き残るため)。
 * クライアント部品なので APP_COPY は import せず、文字列は props で受ける
 * (client↔server のモジュール分離則)。
 */
export interface NavMoreCopy {
  notifications: string;
  account: string;
  guide: string;
  contact: string;
}

const GAME_LINKS: Array<{ href: string; label: string }> = [
  { href: '/breeders', label: 'BREEDERS' },
  { href: '/support', label: 'TEAM' },
];

export function NavMore({ t, unread = 0 }: { t: NavMoreCopy; unread?: number }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const badge = unread > 99 ? '99+' : String(unread);

  return (
    <div className="topnav-more" ref={rootRef}>
      <button
        type="button"
        className="topnav-more-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        MORE
        {unread > 0 ? <span className="topnav-badge">{badge}</span> : null}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          className={open ? 'topnav-more-chev topnav-more-chev-open' : 'topnav-more-chev'}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="topnav-drawer" role="menu">
          {GAME_LINKS.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem">{l.label}</Link>
          ))}
          <span className="topnav-drawer-sep" aria-hidden="true" />
          <Link href="/notifications" className="topnav-util" role="menuitem">
            {t.notifications}
            {unread > 0 ? <span className="topnav-badge">{badge}</span> : null}
          </Link>
          <Link href="/account" className="topnav-util" role="menuitem">{t.account}</Link>
          <Link href="/guide" className="topnav-util" role="menuitem">{t.guide}</Link>
          <Link href="/contact" className="topnav-util" role="menuitem">{t.contact}</Link>
        </div>
      ) : null}
    </div>
  );
}
