import type { SqlClient } from '@sevendays/shared';
import { insertNotification } from '@sevendays/shared';
import { currentEconomyStatus } from '@sevendays/economy-engine';
import { sendCsEmail } from '../cs/mail.js';

/**
 * C-2 (ADMIN_IMPROVEMENT_BRIEF): 失敗の能動通知。
 * 8:00/20:00 バッチの直後に、管理者が"開いていなくても気づける"安全網を張る:
 *   ① バッチが FAILED / PARTIAL_FAILED
 *   ② 経済状態が WATCH 以上 (WATCH/WINTER/EMERGENCY)
 *   ③ 出金審査(ADMIN_REVIEW)が 24時間 超で滞留
 * のいずれかで、管理者名簿(users × admin_role_grants)へ メール + in-app 通知。
 *
 * ★push は管理者限定にできない(既存は全体ブロードキャストのみ)ため、確実に届く
 *   メールと in-app を主軸にする。呼び出し側は try/catch でラップし、通知失敗が
 *   精算バッチの成否に一切関与しないこと(ベストエフォート)。
 * ★冪等: 1サイクル(batch_date × slot)につき管理者ごと1通。既通知はメールも送らない。
 */

const WITHDRAWAL_STUCK_HOURS = 24;

export async function alertAdminsAfterBatch(
  client: SqlClient,
  input: { batchDate: string; slot: string; batchStatus: string },
): Promise<{ alerted: number; reasons: string[] }> {
  const reasons: string[] = [];

  if (['FAILED', 'PARTIAL_FAILED'].includes(input.batchStatus.toUpperCase())) {
    reasons.push(`バッチが ${input.batchStatus}（${input.batchDate} ${input.slot}）`);
  }

  const eco = await currentEconomyStatus(client, input.batchDate).catch(() => 'NORMAL');
  if (['WATCH', 'WINTER', 'EMERGENCY'].includes(String(eco).toUpperCase())) {
    reasons.push(`経済状態が ${eco}`);
  }

  const stuck = await client.query<{ n: number }>(
    `select count(*)::int as n from blockchain_withdrawals
     where status = 'ADMIN_REVIEW' and requested_at < now() - make_interval(hours => $1)`,
    [WITHDRAWAL_STUCK_HOURS],
  );
  const stuckN = stuck.rows[0]?.n ?? 0;
  if (stuckN > 0) reasons.push(`出金審査が ${stuckN} 件 滞留（${WITHDRAWAL_STUCK_HOURS}時間超）`);

  if (reasons.length === 0) return { alerted: 0, reasons };

  const admins = await client.query<{ id: string; email: string }>(
    `select distinct u.id, u.email from users u
     join admin_role_grants g on g.user_id = u.id
     where u.email is not null and u.email <> ''`,
  );

  const cycle = `${input.batchDate}:${input.slot}`;
  const title = '運用アラート — 要確認';
  const body = reasons.join(' ／ ');
  const mailBody = `管理者アラート（自動送信）\n\n${reasons.map((r) => `・${r}`).join('\n')}\n\n管理ダッシュボードでご確認ください。`;
  let alerted = 0;

  for (const a of admins.rows) {
    const dedupeKey = `admin-ops-alert:${cycle}:${a.id}`;
    // 冪等: このサイクルで既に通知済みならスキップ(メールの重複送信も防ぐ)。
    const seen = await client.query(`select 1 from notifications where dedupe_key = $1 limit 1`, [dedupeKey]);
    if (seen.rows.length > 0) continue;

    await insertNotification(client, {
      userId: a.id,
      type: 'ADMIN_OPS_ALERT',
      dedupeKey,
      payload: { title, body, reasons, batch_date: input.batchDate, slot: input.slot },
    });

    // メールはベストエフォート — 1名の失敗が他の管理者への送信をブロックしない。
    await sendCsEmail({
      toEmail: a.email,
      subject: `[Seven Days Derby 管理] 要確認 — ${input.batchDate} ${input.slot}`,
      body: mailBody,
    }).catch(() => undefined);

    alerted += 1;
  }

  return { alerted, reasons };
}
