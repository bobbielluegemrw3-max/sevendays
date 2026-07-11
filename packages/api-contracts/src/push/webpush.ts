import webpush from 'web-push';

/**
 * Webプッシュの送信トランスポート(Decision 084)。
 * VAPID鍵は環境変数(VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT)。
 * 鍵が未設定の環境では null を返し、呼び出し側は送信をスキップする —
 * プッシュはあくまで付加機能で、バッチや購読APIを絶対に落とさない。
 * テストはこのインターフェースのスタブを注入する(実ネットワークに出ない)。
 */

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  url: string;
}

export type PushSendResult =
  | { ok: true }
  /** gone=true は購読が消滅(404/410)— 購読を無効化してよい。 */
  | { ok: false; gone: boolean };

export interface PushTransport {
  send(subscription: PushSubscriptionRow, message: PushMessage): Promise<PushSendResult>;
}

export function vapidPublicKey(): string | null {
  const key = process.env.VAPID_PUBLIC_KEY;
  return key && key.length > 0 ? key : null;
}

export function buildWebPushTransport(): PushTransport | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:support@sevendaysderby.com';
  return {
    async send(subscription, message) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify(message),
          {
            vapidDetails: { subject, publicKey, privateKey },
            TTL: 3600, // 発走通知は1時間で失効(古い通知を翌日に届けない)
            urgency: 'high',
          },
        );
        return { ok: true };
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        return { ok: false, gone: statusCode === 404 || statusCode === 410 };
      }
    },
  };
}
