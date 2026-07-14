import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { ApiRegistry } from '../router.js';
import { vapidPublicKey } from '../push/webpush.js';

/**
 * Webプッシュ購読API(Decision 084)。
 * 購読はブラウザのPushSubscriptionをそのまま預かるだけ — 通知の内容は
 * サーバー側ブロードキャスト(夜間バッチ)が決める。1 endpoint = 1行(unique)で、
 * 別ユーザーが同じendpointを登録し直したら所有者を付け替える(端末の使い回し)。
 */

const subscribeInput = z.object({
  endpoint: z.string().url().max(1024),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(512),
});

const unsubscribeInput = z.object({
  endpoint: z.string().url().max(1024),
});

export function registerPushEndpoints(registry: ApiRegistry): void {
  // 購読時にクライアントが必要とするVAPID公開鍵(未設定環境ではnull)
  registry.register({
    method: 'GET',
    path: '/api/v1/push/public-key',
    auth: 'user',
    handler: () => Promise.resolve({ public_key: vapidPublicKey() }),
  });

  // 実登録状態(2026-07-14 guri調査): 「READY」はブラウザ許可ではなく
  // サーバー登録の事実で判定する — 許可済みでも登録0件のケースが実際に起きた。
  registry.register({
    method: 'GET',
    path: '/api/v1/push/status',
    auth: 'user',
    handler: async (ctx) => {
      const r = await ctx.client.query<{ n: number }>(
        `select count(*)::int as n from push_subscriptions
         where user_id = $1 and disabled_at is null`,
        [ctx.userId],
      );
      return { subscribed: r.rows[0]!.n > 0, devices: r.rows[0]!.n };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/push/subscribe',
    auth: 'user',
    input: subscribeInput,
    handler: async (ctx, input) => {
      await ctx.client.query(
        `insert into push_subscriptions (user_id, endpoint, p256dh, auth)
         values ($1, $2, $3, $4)
         on conflict (endpoint) do update
           set user_id = excluded.user_id,
               p256dh = excluded.p256dh,
               auth = excluded.auth,
               disabled_at = null,
               fail_count = 0`,
        [ctx.userId, input.endpoint, input.p256dh, input.auth],
      );
      return { subscribed: true };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/push/unsubscribe',
    auth: 'user',
    input: unsubscribeInput,
    handler: async (ctx, input) => {
      const result = await ctx.client.query<{ id: string }>(
        `update push_subscriptions set disabled_at = now()
         where endpoint = $1 and user_id = $2
         returning id`,
        [input.endpoint, ctx.userId],
      );
      if (!result.rows[0]) throw new ApiError('NOT_FOUND', 'Subscription not found');
      return { unsubscribed: true };
    },
  });
}
