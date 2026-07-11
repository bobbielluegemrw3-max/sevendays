'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import s from '../app/dashboard.module.css';

type PwaState = 'loading' | 'done' | 'enable' | 'blocked' | 'ios-install' | 'install';

/** Android Chrome系が発火する「アプリを追加」ネイティブダイアログの起動イベント。 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

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

/** iOSの共有ボタン(□↑)。文字で説明せずアイコンで見せる。 */
function ShareIcon() {
  return (
    <svg className={s.pwaIcon} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
      <path d="M8 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-2" />
    </svg>
  );
}

/**
 * ダッシュボードの「アプリ化&通知ON」導線。
 * - iOS Safari(未インストール)は通知APIが無い → 番号チップ3ステップでホーム画面追加を誘導
 * - 通知APIがある環境(インストール済みPWA / Android / PCブラウザ)は許可ボタン1つ
 * - Androidは通知ON完了後に beforeinstallprompt 経由の「+ アプリを追加」を控えめに提示
 * - 許可済みなら購読をサーバーへ同期して完了表示。SW(/sw.js)はキャッシュなしで
 *   プッシュ受信・クリック遷移のみを担う。配信は夜間バッチのブロードキャスト。
 */
export function PwaSetupTile() {
  const [state, setState] = useState<PwaState>('loading');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setMobile(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setState('done');
        void syncPushSubscription();
      } else if (Notification.permission === 'denied') {
        setState('blocked');
      } else {
        setState('enable');
      }
    } else if (isIos && !standalone) {
      setState('ios-install');
    } else {
      setState('install');
    }
    // 「+ アプリを追加」用のネイティブイベント(Android Chrome系のみ発火。インストール済みなら発火しない)
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvent(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function enable() {
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setState('done');
      void syncPushSubscription();
    } else if (result === 'denied') {
      setState('blocked');
    }
  }

  async function install() {
    const ev = installEvent;
    if (!ev) return;
    setInstallEvent(null); // prompt()は1回しか呼べない
    await ev.prompt();
  }

  if (state === 'loading') return null;

  // 通知ON完了後のモバイルにだけ出す控えめなインストール導線(PCは出さない)
  const installOffer =
    installEvent && mobile && (state === 'done' || state === 'install') ? (
      <div className={s.pwaInstallRow}>
        <span className={s.pwaHint}>ホーム画面に追加するとワンタップで開けます。</span>
        <button type="button" className={s.pwaGhostBtn} onClick={() => void install()}>
          + アプリを追加
        </button>
      </div>
    ) : null;

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
        ) : state === 'blocked' ? (
          <span className={s.pwaText}>通知は現在ブロック中です。ブラウザの設定で許可すると再開できます。</span>
        ) : state === 'ios-install' ? (
          <span className={s.pwaText}>ホーム画面に追加すると発走通知が届きます。</span>
        ) : (
          <span className={s.pwaText}>ホーム画面に追加すると、アプリとして使えます。</span>
        )}
      </div>
      {state === 'ios-install' ? (
        <div className={s.pwaFlow}>
          <span className={s.pwaStep}>
            <span className={s.pwaStepNum}>1</span>
            共有ボタン
            <ShareIcon />
            をタップ
          </span>
          <span className={s.pwaArrow}>→</span>
          <span className={s.pwaStep}>
            <span className={s.pwaStepNum}>2</span>
            「ホーム画面に追加」
          </span>
          <span className={s.pwaArrow}>→</span>
          <span className={s.pwaStep}>
            <span className={s.pwaStepNum}>3</span>
            アプリを開いて通知ON
          </span>
        </div>
      ) : null}
      {state === 'install' && !installOffer ? (
        <div className={s.pwaSteps}>
          ブラウザのメニューから「ホーム画面に追加」/「アプリをインストール」を選ぶと、アプリとして起動できます。
        </div>
      ) : null}
      {installOffer}
    </section>
  );
}
