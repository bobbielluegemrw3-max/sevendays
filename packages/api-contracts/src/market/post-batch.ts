import { Money, insertNotification } from '@sevendays/shared';
import type { SqlClient } from '@sevendays/shared';
import {
  MAX_CONCURRENT_PURCHASE_SESSIONS,
  P2P_FEE_SPLIT_RATE,
  PURCHASE_LOCK_AMOUNT,
  renderNotification,
} from '@sevendays/domain';
import { createPurchaseSession } from '@sevendays/settlement-engine';
import { ensureUserAccounts, getBalance } from '@sevendays/ledger';
import { sendCsEmail } from '../cs/mail.js';

/**
 * バッチ後スイープ(Decision 086)。当日バッチがCOMPLETEDの後にワーカーが叩く。
 * バッチステップではない(BATCH_STEPS_V1不変)。全処理が冪等:
 *  1. 売却メール — 今夜馬が売れた売り手へ1通(mail_claimsの一意クレームで1晩1回)
 *  2. 自動購入予約 — auto_reserve=ONのユーザーへ min(設定, 空き枠, 残高÷177.16) 頭の
 *     予約を作成(冪等キー autoreserve:{date}:{user}#i)+通知+メール
 * メールはベストエフォート(クレーム後の送信失敗は失われる — ブロードキャストと同じ割切り)。
 */

const LOCK = Money.of(PURCHASE_LOCK_AMOUNT);

function isRealEmail(email: string | null | undefined): email is string {
  return Boolean(email && !email.endsWith('@user.sevendays'));
}

/** claim_keyを一意クレーム。取れたらtrue(=このプロセスが送る番)。 */
async function claimMail(client: SqlClient, key: string): Promise<boolean> {
  const r = await client.query<{ id: string }>(
    `insert into mail_claims (claim_key) values ($1) on conflict (claim_key) do nothing returning id`,
    [key],
  );
  return r.rows.length > 0;
}

export interface PostBatchResult {
  skipped?: string;
  soldMails: number;
  autoReserveUsers: number;
  autoReserveSessions: number;
}

export async function runMarketPostBatch(
  client: SqlClient,
  batchDate: string,
): Promise<PostBatchResult> {
  // slot=NIGHT固定: バッチ後スイープは現行=夜レース後の運用(Decision 086)。
  // V2のレース単位スイープはプール購入改修(Decision 103)で再設計する。
  const batch = await client.query<{ id: string; status: string }>(
    `select id, status::text as status from batch_runs
     where batch_date = $1 and slot = 'NIGHT'`,
    [batchDate],
  );
  if (!batch.rows[0] || batch.rows[0].status !== 'COMPLETED') {
    return { skipped: 'batch not completed', soldMails: 0, autoReserveUsers: 0, autoReserveSessions: 0 };
  }
  const batchRunId = batch.rows[0].id;

  // ---- 1. 売却メール(売り手ごとに1通・複数頭はまとめる) ----------------
  const sold = await client.query<{
    seller_user_id: string;
    email: string;
    name: string;
    price: string;
  }>(
    `select a.seller_user_id, u.email, h.name, a.assigned_price::text as price
     from ownership_assignments a
     join horses h on h.id = a.horse_id
     join users u on u.id = a.seller_user_id
     where a.batch_run_id = $1 and a.status = 'SETTLED' and a.seller_user_id is not null
     order by a.seller_user_id, h.name`,
    [batchRunId],
  );
  const bySeller = new Map<string, { email: string; horses: { name: string; proceeds: Money }[] }>();
  for (const row of sold.rows) {
    const price = Money.of(row.price);
    const feeHalf = price.mulFloor(P2P_FEE_SPLIT_RATE);
    const proceeds = price.sub(feeHalf).sub(feeHalf);
    const entry = bySeller.get(row.seller_user_id) ?? { email: row.email, horses: [] };
    entry.horses.push({ name: row.name, proceeds });
    bySeller.set(row.seller_user_id, entry);
  }
  let soldMails = 0;
  for (const [sellerId, entry] of bySeller) {
    if (!isRealEmail(entry.email)) continue;
    if (!(await claimMail(client, `sold-mail:${batchDate}:${sellerId}`))) continue;
    const total = entry.horses.reduce((sum, h) => sum.add(h.proceeds), Money.of('0'));
    const lines = entry.horses.map((h) => `・${h.name} — ${h.proceeds.toFixed8()} USDT`);
    await sendCsEmail({
      toEmail: entry.email,
      subject: `馬が売れました — ${total.toFixed8()} USDT を受け取りました / Your horse sold`,
      body: [
        'オーナー様',
        '',
        `今夜のマッチングで、あなたの馬が売れました(${batchDate})。`,
        ...lines,
        '',
        `合計 ${total.toFixed8()} USDT(手数料2%控除後)がウォレットに反映されています。`,
        '取引の記録はウォレットページの履歴と台帳(LEDGER)で確認できます。',
        '',
        'Seven Days Derby',
      ].join('\n'),
    }).catch(() => undefined);
    soldMails += 1;
  }

  // ---- 2. 自動購入予約 ---------------------------------------------------
  const optedIn = await client.query<{
    user_id: string;
    auto_reserve_max: number | null;
    email: string;
  }>(
    `select uts.user_id, uts.auto_reserve_max, u.email
     from user_trade_settings uts
     join users u on u.id = uts.user_id
     where uts.auto_reserve = true
     order by uts.user_id`,
  );
  let autoReserveUsers = 0;
  let autoReserveSessions = 0;
  for (const user of optedIn.rows) {
    try {
      const pending = await client.query<{ count: string }>(
        `select count(*)::text as count from purchase_sessions
         where user_id = $1 and status = 'PENDING_ASSIGNMENT'`,
        [user.user_id],
      );
      const slots = MAX_CONCURRENT_PURCHASE_SESSIONS - Number(pending.rows[0]!.count);
      const accounts = await ensureUserAccounts(client, user.user_id);
      const available = await getBalance(client, accounts.available);
      const maxByBalance = Math.floor(Number(available) / Number(LOCK.toFixed8()));
      const target = Math.min(
        user.auto_reserve_max ?? MAX_CONCURRENT_PURCHASE_SESSIONS, // null = MAX
        slots,
        maxByBalance,
      );
      if (target <= 0) continue;

      let created = 0;
      for (let i = 0; i < target; i += 1) {
        const result = await createPurchaseSession(client, {
          userId: user.user_id,
          idempotencyKey: `autoreserve:${batchDate}:${user.user_id}#${i + 1}`,
        });
        if (!result.alreadyExists) created += 1;
      }
      if (created === 0) continue; // 既に作成済み(再実行)or何も作れず

      autoReserveUsers += 1;
      autoReserveSessions += created;
      const total = (Number(LOCK.toFixed8()) * created).toFixed(2);
      const rendered = renderNotification('AUTO_RESERVED', { count: created, total });
      await insertNotification(client, {
        userId: user.user_id,
        type: 'AUTO_RESERVED',
        dedupeKey: `notif:AUTO_RESERVED:${batchDate}:${user.user_id}`,
        payload: { ...rendered, count: created, total },
      });
      if (isRealEmail(user.email) && (await claimMail(client, `autoreserve-mail:${batchDate}:${user.user_id}`))) {
        await sendCsEmail({
          toEmail: user.email,
          subject: `自動購入予約を作成しました(${created}頭)— 明晩20:00に処理されます`,
          body: [
            'オーナー様',
            '',
            `設定にもとづき、購入予約を自動で作成しました(${batchDate} のバッチ後)。`,
            `・頭数: ${created}頭 / 最大ロック合計: ${total} USDT`,
            '・明晩20:00(MYT)の一斉マッチングで処理されます(割当価格との差額は自動返金)',
            '・精算前であればマーケットページからキャンセル(全額返金)できます',
            '',
            '自動購入予約はダッシュボードまたはマーケットページのAUTO設定からいつでもOFFにできます。',
            '',
            'Seven Days Derby',
          ].join('\n'),
        }).catch(() => undefined);
      }
    } catch {
      // 1ユーザーの失敗(残高レース・一時エラー)が他ユーザーを止めない。
      // 冪等キーなので次回の実行で自然に続きから再開する。
      continue;
    }
  }

  return { soldMails, autoReserveUsers, autoReserveSessions };
}
