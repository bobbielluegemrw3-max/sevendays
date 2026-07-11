'use client';

import { useEffect, useState } from 'react';
import s from '../app/dashboard.module.css';

type PwaState = 'loading' | 'done' | 'enable' | 'ios-install' | 'install';

/**
 * ダッシュボードの「アプリ化&通知ON」導線。
 * - iOS Safari(未インストール)は通知APIが無い → ホーム画面追加の手順を出す
 * - 通知APIがある環境(インストール済みPWA / Android / PCブラウザ)は許可ボタン
 * - 許可済みなら完了表示。あわせて Service Worker(/sw.js, キャッシュなし・
 *   プッシュ受信ハンドラのみ)を登録しておく — 実際のプッシュ配信は
 *   サーバー側の購読/送信基盤(別Decision)が入った時にそのまま使う下地。
 */
export function PwaSetupTile() {
  const [state, setState] = useState<PwaState>('loading');

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if ('Notification' in window) {
      setState(Notification.permission === 'granted' ? 'done' : 'enable');
    } else if (isIos && !standalone) {
      setState('ios-install');
    } else {
      setState('install');
    }
  }, []);

  async function enable() {
    const result = await Notification.requestPermission();
    if (result === 'granted') setState('done');
  }

  if (state === 'loading') return null;
  return (
    <section className={s.pwa}>
      <div className={s.pwaRow}>
        <span className={s.pwaLabel}>APP &amp; 通知</span>
        {state === 'done' ? (
          <>
            <span className={s.pwaText}>通知はONです。レースの夜をお見逃しなく。</span>
            <span className={s.pwaDone}>✓ READY</span>
          </>
        ) : state === 'enable' ? (
          <>
            <span className={s.pwaText}>通知をONにして、毎晩20:00のレースに備えましょう。</span>
            <button type="button" className={s.pwaBtn} onClick={() => void enable()}>
              通知をONにする
            </button>
          </>
        ) : (
          <span className={s.pwaText}>Seven Days Derby をアプリとしてホーム画面に追加できます。</span>
        )}
      </div>
      {state === 'ios-install' ? (
        <div className={s.pwaSteps}>
          ① Safariの共有ボタン(□↑)を押す → ②「ホーム画面に追加」を選ぶ → ③ 追加されたアプリから開くと、ここで通知をONにできます。
        </div>
      ) : null}
      {state === 'install' ? (
        <div className={s.pwaSteps}>
          ブラウザのメニューから「アプリをインストール」/「ホーム画面に追加」を選ぶと、アプリとして起動できます。
        </div>
      ) : null}
    </section>
  );
}
