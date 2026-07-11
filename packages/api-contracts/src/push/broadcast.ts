import type { SqlClient } from '@sevendays/shared';
import type { PushMessage, PushTransport } from './webpush.js';

/**
 * 夜間ブロードキャスト(Decision 084)。
 * push_broadcasts.broadcast_key の一意制約で冪等 — バッチの再実行・リカバリでも
 * 同じ夜に二度送られない。送信失敗はカウントのみ(fail_count>=8で無効化)、
 * 購読消滅(404/410)は即 disabled_at。例外は呼び出し側でも握るが、
 * ここでも1件の失敗が全体を止めない構造にする。
 */

const SEND_CHUNK = 50;
const DISABLE_AFTER_FAILS = 8;

export interface BroadcastResult {
  skipped: boolean;
  sent: number;
  disabled: number;
  failed: number;
}

export function raceStartMessage(): PushMessage {
  return {
    title: 'SEVEN DAYS DERBY',
    body: '本日のダービーが発走しました。今夜の結果と「明日の予報」はショーの中で。',
    url: '/races',
  };
}

/** 発走5分前リマインド — どのタイムゾーンでも「受信=あと5分」になる時刻非依存の文面。 */
export function raceReminderMessage(): PushMessage {
  return {
    title: 'SEVEN DAYS DERBY',
    body: 'まもなく発走 — あと5分で本日のダービーが始まります。今夜の結果と「明日の予報」はショーの中で。',
    url: '/races',
  };
}

/** 指定キーのブロードキャストが既に送られたか(バッチ側のフォールバック判定用)。 */
export async function hasBroadcast(client: SqlClient, broadcastKey: string): Promise<boolean> {
  const r = await client.query(`select 1 from push_broadcasts where broadcast_key = $1`, [broadcastKey]);
  return r.rows.length > 0;
}

export async function sendNightlyBroadcast(
  client: SqlClient,
  input: {
    broadcastKey: string;
    message: PushMessage;
    transport: PushTransport;
    /** 指定時はそのユーザーの購読だけに送る(CSメルマガのTESTモード用)。 */
    onlyUserId?: string;
  },
): Promise<BroadcastResult> {
  // 冪等クレーム: 行を取れた実行だけが送信する
  const claimed = await client.query<{ id: string }>(
    `insert into push_broadcasts (broadcast_key) values ($1)
     on conflict (broadcast_key) do nothing
     returning id`,
    [input.broadcastKey],
  );
  const broadcastId = claimed.rows[0]?.id;
  if (!broadcastId) return { skipped: true, sent: 0, disabled: 0, failed: 0 };

  const subs = input.onlyUserId
    ? await client.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
        `select id, endpoint, p256dh, auth from push_subscriptions where disabled_at is null and user_id = $1`,
        [input.onlyUserId],
      )
    : await client.query<{ id: string; endpoint: string; p256dh: string; auth: string }>(
        `select id, endpoint, p256dh, auth from push_subscriptions where disabled_at is null`,
      );

  let sent = 0;
  let disabled = 0;
  let failed = 0;
  for (let i = 0; i < subs.rows.length; i += SEND_CHUNK) {
    const chunk = subs.rows.slice(i, i + SEND_CHUNK);
    const results = await Promise.all(
      chunk.map(async (sub) => ({ sub, result: await input.transport.send(sub, input.message) })),
    );
    for (const { sub, result } of results) {
      if (result.ok) {
        sent += 1;
      } else if (result.gone) {
        disabled += 1;
        await client.query(`update push_subscriptions set disabled_at = now() where id = $1`, [sub.id]);
      } else {
        failed += 1;
        await client.query(
          `update push_subscriptions
             set fail_count = fail_count + 1,
                 disabled_at = case when fail_count + 1 >= $2 then now() else disabled_at end
           where id = $1`,
          [sub.id, DISABLE_AFTER_FAILS],
        );
      }
    }
  }

  await client.query(
    `update push_broadcasts set sent_count = $2, disabled_count = $3 where id = $1`,
    [broadcastId, sent, disabled],
  );
  return { skipped: false, sent, disabled, failed };
}
