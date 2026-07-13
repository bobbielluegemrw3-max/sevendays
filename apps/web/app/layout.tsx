import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
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
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Seven Days Derby',
    // PWA起動時のスプラッシュ(2026-07-13): ブランドロゴ+背景#050409。
    // iOSはmanifestを見ないため機種サイズ別のapple-touch-startup-imageが必須
    // (Androidはmanifestのbackground_color+512アイコンから自動生成)。
    // 画像は public/splash/(icon-512から生成・再生成手順はコミット参照)。
    startupImage: [
      { url: '/splash/splash-750x1334.png', media: 'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/splash-1334x750.png', media: 'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' },
      { url: '/splash/splash-1242x2208.png', media: 'screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2208x1242.png', media: 'screen and (device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1125x2436.png', media: 'screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2436x1125.png', media: 'screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-828x1792.png', media: 'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/splash-1792x828.png', media: 'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' },
      { url: '/splash/splash-1242x2688.png', media: 'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2688x1242.png', media: 'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1170x2532.png', media: 'screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2532x1170.png', media: 'screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1284x2778.png', media: 'screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2778x1284.png', media: 'screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1179x2556.png', media: 'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2556x1179.png', media: 'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1290x2796.png', media: 'screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2796x1290.png', media: 'screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1206x2622.png', media: 'screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2622x1206.png', media: 'screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1320x2868.png', media: 'screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2868x1320.png', media: 'screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1260x2736.png', media: 'screen and (device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)' },
      { url: '/splash/splash-2736x1260.png', media: 'screen and (device-width: 420px) and (device-height: 912px) and (-webkit-device-pixel-ratio: 3) and (orientation: landscape)' },
      { url: '/splash/splash-1536x2048.png', media: 'screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/splash-2048x1536.png', media: 'screen and (device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' },
      { url: '/splash/splash-1668x2388.png', media: 'screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/splash-2388x1668.png', media: 'screen and (device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' },
      { url: '/splash/splash-2048x2732.png', media: 'screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)' },
      { url: '/splash/splash-2732x2048.png', media: 'screen and (device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)' },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#050409',
};

// ADMINリンクは管理者ロール保持者にのみ表示(ページ自体の保護は/adminレイアウトと
// 各adminエンドポイントの権限検証が担う — これは導線の出し分けだけ)
// 通知の未読数はメニューのバッジ用(表示だけ・失敗しても0のまま)。
// 遷移速度(2026-07-12): Suspenseでストリーミング — ナビのデータ取得がページ本体の
// 描画をブロックしない(フォールバックは同じナビをバッジなしで即描画)。
async function TopNavLoader() {
  const [me, notif] = await Promise.all([
    serverApi<{ is_admin?: boolean }>('/api/v1/me'),
    // スパイク対策(2026-07-12): バッジは軽量COUNT専用API(従来は50件全文取得)
    serverApi<{ unread: number }>('/api/v1/notifications/unread-count'),
  ]);
  const isAdmin = me.status === 200 && me.body.is_admin === true;
  const unread = notif.status === 200 ? notif.body.unread : 0;
  return <TopNav isAdmin={isAdmin} unread={unread} />;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = (await getAccessToken()) !== null;
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
        {authed ? (
          <Suspense fallback={<TopNav />}>
            <TopNavLoader />
          </Suspense>
        ) : null}
        <main>{children}</main>
      </body>
    </html>
  );
}
