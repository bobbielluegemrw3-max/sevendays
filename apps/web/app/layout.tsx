import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import './globals.css';
import { getAccessToken, serverApi } from '@/lib/server-api';
import { withSqlClient } from '@/lib/db';
import { getMaintenanceState } from '@/lib/maintenance';
import { getLang } from '@/lib/i18n-server';
import { setLvDisplayMode, type Lang } from '@/lib/i18n';
import { isEngineV2Active } from '@/lib/engine-server';
import { TopNav } from '@/components/TopNav';
import { Splash } from '@/components/Splash';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';
import m from '@/components/maintenance.module.css';

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
  // PWAスプラッシュはリバート済み(2026-07-13): apple-touch-startup-imageを
  // 宣言するとiOS(iPhone 14 Pro実機)が画像適用に失敗して白い起動画面に
  // フォールバックした。未宣言ならiOSは前回画面のスナップショット(ダーク)で
  // 起動するため、宣言しない方が体験が良い。Androidはmanifestから自動生成。
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Seven Days Derby' },
};

export const viewport: Viewport = {
  themeColor: '#050409',
};

// ADMINリンクは管理者ロール保持者にのみ表示(ページ自体の保護は/adminレイアウトと
// 各adminエンドポイントの権限検証が担う — これは導線の出し分けだけ)
// 通知の未読数はメニューのバッジ用(表示だけ・失敗しても0のまま)。
// 遷移速度(2026-07-12): Suspenseでストリーミング — ナビのデータ取得がページ本体の
// 描画をブロックしない(フォールバックは同じナビをバッジなしで即描画)。
async function TopNavLoader({ lang }: { lang: Lang }) {
  const [me, notif] = await Promise.all([
    serverApi<{ is_admin?: boolean }>('/api/v1/me'),
    // スパイク対策(2026-07-12): バッジは軽量COUNT専用API(従来は50件全文取得)
    serverApi<{ unread: number }>('/api/v1/notifications/unread-count'),
  ]);
  const isAdmin = me.status === 200 && me.body.is_admin === true;
  const unread = notif.status === 200 ? notif.body.unread : 0;
  return <TopNav isAdmin={isAdmin} unread={unread} lang={lang} />;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = (await getAccessToken()) !== null;
  const lang = await getLang();
  // V2実装-7b(Decision 102): V2シーズンはDAY表記をLV表記へ(辞書Proxyが一括切替)
  setLvDisplayMode(await isEngineV2Active());

  // メンテナンスモード(Decision 098): ONの間、管理者以外は全ページを
  // メンテナンス画面に差し替える(APIはブリッジ側で503遮断済み)。
  // /api/v1/me はメンテ中も管理者だけ200を返す(ブリッジのゲートが
  // 非管理者を503にする)ため、この1回の問い合わせで判定が完結する。
  const maintenance = await withSqlClient((client) => getMaintenanceState(client));
  let maintenanceAdmin = false;
  if (maintenance.enabled) {
    const me = authed ? await serverApi<{ is_admin?: boolean }>('/api/v1/me') : null;
    maintenanceAdmin = me?.status === 200 && me.body.is_admin === true;
    if (!maintenanceAdmin) {
      return (
        <html lang={lang}>
          <head>
            {/* Impact/MoonPay アフィリエイト サイト検証(value属性が必須なため直書き) */}
            <meta {...({ name: 'impact-site-verification', value: '2702f35a-9d4e-4347-8a63-8b52915e3125' } as Record<string, string>)} />
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
            <link
              href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;600;700;800;900&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
              rel="stylesheet"
            />
          </head>
          <body>
            <MaintenanceScreen message={maintenance.message} />
          </body>
        </html>
      );
    }
  }

  return (
    <html lang={lang}>
      <head>
        {/* Impact/MoonPay アフィリエイト サイト検証(value属性が必須なため直書き) */}
        <meta {...({ name: 'impact-site-verification', value: '2702f35a-9d4e-4347-8a63-8b52915e3125' } as Record<string, string>)} />
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
        {/* 起動スプラッシュ(セッション初回のみ・全ページ共通) */}
        <Splash />
        {maintenance.enabled && maintenanceAdmin ? (
          <div className={m.adminBanner}>
            メンテナンス中 — 一般ユーザーは遮断されています。解除は{' '}
            <Link href="/admin">管理ダッシュボード</Link> から。
          </div>
        ) : null}
        {/* Anonymous pages (landing / login) carry their own header. */}
        {authed ? (
          <Suspense fallback={<TopNav lang={lang} />}>
            <TopNavLoader lang={lang} />
          </Suspense>
        ) : null}
        <main>{children}</main>
      </body>
    </html>
  );
}
