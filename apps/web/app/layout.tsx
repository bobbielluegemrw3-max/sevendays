import type { Metadata, Viewport } from 'next';
import './globals.css';
import { getAccessToken, serverApi } from '@/lib/server-api';
import { TopNav } from '@/components/TopNav';

export const metadata: Metadata = {
  title: 'Seven Days Derby',
  description: '7日間のサバイバルレース。毎晩20:00、その日のすべての馬が一斉に発走。',
  // PWA(ホーム画面追加)対応。SWは /sw.js(キャッシュなし・プッシュ受け皿のみ)。
  manifest: '/manifest.webmanifest',
  icons: {
    // ?v=2: アイコンを馬アート→ブランドロゴに差し替え(Safariのキャッシュ対策)
    icon: [{ url: '/icons/icon-192.png?v=2', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/icon-180.png?v=2', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Seven Days Derby' },
};

export const viewport: Viewport = {
  themeColor: '#050409',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = (await getAccessToken()) !== null;
  // ADMINリンクは管理者ロール保持者にのみ表示(ページ自体の保護は/adminレイアウトと
  // 各adminエンドポイントの権限検証が担う — これは導線の出し分けだけ)
  // 通知の未読数はメニューのバッジ用(表示だけ・失敗しても0のまま)。
  let isAdmin = false;
  let unread = 0;
  if (authed) {
    const [me, notif] = await Promise.all([
      serverApi<{ is_admin?: boolean }>('/api/v1/me'),
      serverApi<{ notifications: { read_at: string | null; is_broadcast?: boolean }[] }>('/api/v1/notifications'),
    ]);
    isAdmin = me.status === 200 && me.body.is_admin === true;
    // ブロードキャスト(共有行)は既読化できないため未読バッジから除外
    if (notif.status === 200)
      unread = notif.body.notifications.filter((n) => !n.read_at && !n.is_broadcast).length;
  }
  return (
    <html lang="ja">
      <head>
        {/* Fonts matching the design handoff (Orbitron display, Space Grotesk,
            Zen Kaku Gothic New for Japanese, IBM Plex Mono for data). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* Anonymous pages (landing / login) carry their own header. */}
        {authed ? <TopNav isAdmin={isAdmin} unread={unread} /> : null}
        <main>{children}</main>
      </body>
    </html>
  );
}
