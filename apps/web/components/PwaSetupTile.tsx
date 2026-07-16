'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client-api';
import type { AppDict } from '@/lib/i18n-shared';
import s from '../app/dashboard.module.css';

type PwaState = 'loading' | 'done' | 'enable' | 'register' | 'blocked' | 'ios-install' | 'install';

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

/** serviceWorker.ready は登録失敗時に永遠に解決しない — タイムアウトで守る。 */
function swReady(ms: number): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * 購読をサーバーに登録し、成功の事実を返す(Decision 084、2026-07-14堅牢化)。
 * guri事案: 旧実装は失敗しても✓READYを出した。以後「サーバーが購読を持つ」
 * ことを確認できた時だけ true。iOSはユーザー操作の文脈でsubscribeする必要が
 * あるため、公開鍵は事前フェッチ済みのものを使い、await数を最小にする。
 */
async function syncPushSubscription(publicKey: string | null): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
    const registration = await swReady(4000);
    if (!registration) return false;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      if (!publicKey) return false;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return false;
    const saved = await apiFetch<{ subscribed: boolean }>('/api/v1/push/subscribe', {
      method: 'POST',
      body: { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
    return saved.status === 200;
  } catch {
    return false;
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
 * - 通知APIがある環境は許可ボタン1つ。✓READYは**サーバー登録を確認できた時だけ**
 *   (許可済み・未登録は「登録を完了する」ボタン = guri事案の自己修復経路)
 * - 許可済みなら毎回サーバーと突合して自動同期。SW(/sw.js)はプッシュ受信のみ担う。
 */
export function PwaSetupTile({ t }: { t: AppDict['pwa'] }) {
  const [state, setState] = useState<PwaState>('loading');
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [mobile, setMobile] = useState(false);
  const [busy, setBusy] = useState(false);
  const publicKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setMobile(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));

    // 公開鍵はマウント時に先読み(iOSのユーザー操作文脈を守るため、タップ後のawaitを減らす)
    void apiFetch<{ public_key: string | null }>('/api/v1/push/public-key').then((r) => {
      if (r.status === 200 && typeof (r.body as { public_key?: unknown }).public_key === 'string') {
        publicKeyRef.current = (r.body as { public_key: string }).public_key;
      }
    });

    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        // 許可済みでも「サーバーに購読があるか」を必ず確認(guri事案)
        void (async () => {
          const status = await apiFetch<{ subscribed: boolean }>('/api/v1/push/status');
          if (status.status === 200 && (status.body as { subscribed: boolean }).subscribed) {
            setState('done');
            // 端末変更に追従するベストエフォート同期(結果は問わない)
            void syncPushSubscription(publicKeyRef.current);
          } else {
            // 許可はあるのに登録がない — ワンタップで登録を完了させる
            const ok = await syncPushSubscription(publicKeyRef.current);
            setState(ok ? 'done' : 'register');
          }
        })();
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
    if (busy) return;
    setBusy(true);
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      const ok = await syncPushSubscription(publicKeyRef.current);
      setState(ok ? 'done' : 'register');
    } else if (result === 'denied') {
      setState('blocked');
    }
    setBusy(false);
  }

  async function completeRegistration() {
    if (busy) return;
    setBusy(true);
    const ok = await syncPushSubscription(publicKeyRef.current);
    setState(ok ? 'done' : 'register');
    setBusy(false);
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
        <span className={s.pwaHint}>{t.install_hint}</span>
        <button type="button" className={s.pwaGhostBtn} onClick={() => void install()}>
          {t.add_app}
        </button>
      </div>
    ) : null;

  return (
    <section className={s.pwa}>
      <div className={s.pwaRow}>
        <span className={s.pwaLabel}>{t.label}</span>
        {state === 'done' ? (
          <>
            <span className={s.pwaText}>{t.done_text}</span>
            <span className={s.pwaDone}>✓ READY</span>
          </>
        ) : state === 'enable' ? (
          <>
            <span className={s.pwaText}>{t.enable_text}</span>
            <button type="button" className={s.pwaBtn} onClick={() => void enable()} disabled={busy}>
              {busy ? t.enable_busy : t.enable_btn}
            </button>
          </>
        ) : state === 'register' ? (
          <>
            <span className={s.pwaText}>
              {t.register_text}
            </span>
            <button type="button" className={s.pwaBtn} onClick={() => void completeRegistration()} disabled={busy}>
              {busy ? t.register_busy : t.register_btn}
            </button>
          </>
        ) : state === 'blocked' ? (
          <span className={s.pwaText}>{t.blocked_text}</span>
        ) : state === 'ios-install' ? (
          <span className={s.pwaText}>{t.ios_install_text}</span>
        ) : (
          <span className={s.pwaText}>{t.install_text}</span>
        )}
      </div>
      {state === 'ios-install' ? (
        <div className={s.pwaFlow}>
          <span className={s.pwaStep}>
            <span className={s.pwaStepNum}>1</span>
            {t.ios_step1_a}
            <ShareIcon />
            {t.ios_step1_b}
          </span>
          <span className={s.pwaArrow}>→</span>
          <span className={s.pwaStep}>
            <span className={s.pwaStepNum}>2</span>
            {t.ios_step2}
          </span>
          <span className={s.pwaArrow}>→</span>
          <span className={s.pwaStep}>
            <span className={s.pwaStepNum}>3</span>
            {t.ios_step3}
          </span>
        </div>
      ) : null}
      {state === 'install' && !installOffer ? (
        <div className={s.pwaSteps}>
          {t.install_steps}
        </div>
      ) : null}
      {installOffer}
    </section>
  );
}
