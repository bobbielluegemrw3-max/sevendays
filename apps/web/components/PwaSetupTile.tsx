'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import s from '../app/dashboard.module.css';

type PwaState = 'loading' | 'done' | 'enable' | 'ios-install' | 'install';

/** VAPID公開鍵(base64url)を PushManager.subscribe 用の Uint8Array へ。 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * 許可済みブラウザの購読をサーバーに同期(Decision 084)。
 * 既存購読はそのまま登録し直す(endpoint uniqueのupsert)。失敗しても静かに諦める —
 * 次回ダッシュボード表示時に再試行される。
 */
async function syncPushSubscription(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const keyRes = await apiFetch<{ public_key: string | null }>('/api/v1/push/public-key');
      let publicKey: string | null = null;
      if (keyRes.status === 200 && 'public_key' in keyRes.body && typeof keyRes.body.public_key === 'string') {
        publicKey = keyRes.body.public_key;
      }
      if (!publicKey) return;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
    await apiFetch('/api/v1/push/subscribe', {
      method: 'POST',
      body: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  } catch {
    // ベストエフォート(オフライン・非対応ブラウザ等)
  }
}

/**
 * ダッシュボードの「アプリ化&通知ON」導線。
 * - iOS Safari(未インストール)は通知APIが無い → ホーム画面追加の手順を出す
 * - 通知APIがある環境(インストール済みPWA / Android / PCブラウザ)は許可ボタン
 * - 許可済みなら購読をサーバーへ同期して完了表示。SW(/sw.js)はキャッシュなしで
 *   プッシュ受信・クリック遷移のみを担う。配信は夜間バッチのブロードキャスト。
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
      if (Notification.permission === 'granted') {
        setState('done');
        void syncPushSubscription();
      } else {
        setState('enable');
      }
    } else if (isIos && !standalone) {
      setState('ios-install');
    } else {
      setState('install');
    }
  }, []);

  async function enable() {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setState('done');
      void syncPushSubscription();
    }
  }

  if (state === 'loading') return null;
  return (
    <section className={s.pwa}>
      <div className={s.pwaRow}>
        <span className={s.pwaLabel}>APP &amp; 通知</span>
        {state === 'done' ? (
          <>
            <span className={s.pwaText}>通知はONです。毎晩20:00、発走をお知らせします。</span>
            <span className={s.pwaDone}>✓ READY</span>
          </>
        ) : state === 'enable' ? (
          <>
            <span className={s.pwaText}>通知をONにすると、毎晩20:00の発走をお知らせします。</span>
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
