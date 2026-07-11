import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { ApiRegistry, HandlerContext } from '../router.js';
import { sendCsEmail, CsMailError } from '../cs/mail.js';
import { generateCsReply } from '../cs/ai.js';
import { buildWebPushTransport } from '../push/webpush.js';
import { sendNightlyBroadcast, type BroadcastResult } from '../push/broadcast.js';

/** AIカスタマーサービス(2026-07-09): 承認キューの閲覧・承認送信・却下。 */

function requireAdminRole(ctx: HandlerContext): void {
  if (ctx.auth.kind !== 'admin' || ctx.auth.roles.length === 0) {
    throw new ApiError('FORBIDDEN', 'Admin role required');
  }
}

async function audit(ctx: HandlerContext, action: string, referenceId: string): Promise<void> {
  await ctx.client.query(
    `insert into audit_logs (actor_type, actor_id, action, reference_type, reference_id)
     values ('ADMIN', $1, $2, 'cs_message', $3)`,
    [ctx.userId, action, referenceId],
  );
}

export function registerCsEndpoints(registry: ApiRegistry): void {
  registry.register({
    method: 'GET',
    path: '/api/v1/admin/cs/queue',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select m.id, m.email, m.name, m.subject, m.body,
                m.ai_draft, m.ai_confidence::text as ai_confidence, m.ai_reason,
                m.status, m.created_at::text as created_at,
                m.handled_at::text as handled_at,
                u.email as matched_user_email
         from cs_messages m
         left join users u on u.id = m.user_id
         where m.direction = 'RECEIVED'
         order by (m.status = 'PENDING') desc, m.created_at desc
         limit 100`,
      );
      return { messages: rows.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/cs/:id/approve',
    auth: 'admin',
    input: z.object({
      // 編集済み本文(省略時はAI下書きをそのまま送信)
      body: z.string().min(1).max(20000).optional(),
    }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      const msg = await ctx.client.query<{
        id: string; email: string; name: string | null; subject: string | null;
        message_id: string | null; ai_draft: string | null; status: string;
      }>(
        `select id, email, name, subject, message_id, ai_draft, status
         from cs_messages where id = $1 and direction = 'RECEIVED'`,
        [ctx.params.id],
      );
      const m = msg.rows[0];
      if (!m) throw new ApiError('NOT_FOUND', 'Message not found');
      if (m.status !== 'PENDING') throw new ApiError('GRANT_NOT_PENDING', `Message is ${m.status}`);
      const body = input.body ?? m.ai_draft ?? '';
      if (body.trim() === '') throw new ApiError('VALIDATION_FAILED', 'Reply body is empty');

      let sent: { id: string; dryRun: boolean };
      try {
        sent = await sendCsEmail({
          toEmail: m.email,
          toName: m.name,
          subject: m.subject ? `Re: ${m.subject}` : 'Seven Days Derby サポートより',
          body,
          inReplyTo: m.message_id,
        });
      } catch (error) {
        if (error instanceof CsMailError) throw new ApiError('CS_SEND_FAILED', error.message);
        throw error;
      }

      await ctx.client.query(
        `update cs_messages
         set status = 'SENT', handled_by = $2, handled_at = now(), resend_email_id = $3
         where id = $1`,
        [m.id, ctx.userId, sent.id],
      );
      await ctx.client.query(
        `insert into cs_messages (direction, email, name, subject, body, reply_to_cs_id, status, handled_by, resend_email_id, handled_at)
         values ('SENT', $1, $2, $3, $4, $5, 'SENT', $6, $7, now())`,
        [m.email, m.name, m.subject ? `Re: ${m.subject}` : null, body, m.id, ctx.userId, sent.id],
      );
      await audit(ctx, input.body ? 'CS_APPROVE_EDITED' : 'CS_APPROVE', m.id);
      return { id: m.id, status: 'SENT', resend_email_id: sent.id, dry_run: sent.dryRun };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/cs/:id/reject',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const updated = await ctx.client.query<{ id: string }>(
        `update cs_messages set status = 'REJECTED', handled_by = $2, handled_at = now()
         where id = $1 and direction = 'RECEIVED' and status = 'PENDING'
         returning id`,
        [ctx.params.id, ctx.userId],
      );
      if (updated.rows.length === 0) throw new ApiError('NOT_FOUND', 'Pending message not found');
      await audit(ctx, 'CS_REJECT', ctx.params.id!);
      return { id: ctx.params.id, status: 'REJECTED' };
    },
  });

  /* ---- betimail移植第2弾(2026-07-09): 送信履歴・個別スレッド・一斉送信 ---- */

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/cs/sent',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const rows = await ctx.client.query(
        `select m.id, m.email, m.subject, m.created_at::text as created_at,
                m.handled_at::text as handled_at,
                case
                  when m.broadcast_id is not null then 'BROADCAST'
                  when m.reply_to_cs_id is not null then 'REPLY'
                  else 'DIRECT'
                end as kind
         from cs_messages m
         where m.direction = 'SENT'
         order by m.created_at desc
         limit 100`,
      );
      const broadcasts = await ctx.client.query(
        `select b.id, b.subject, b.mode, b.status, b.total, b.sent, b.failed,
                b.created_at::text as created_at, u.email as created_by_email
         from cs_broadcasts b join users u on u.id = b.created_by
         order by b.created_at desc limit 20`,
      );
      return { sent: rows.rows, broadcasts: broadcasts.rows };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/cs/thread',
    auth: 'admin',
    input: z.object({ email: z.string().email().max(320) }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      const email = input.email.trim().toLowerCase();
      const rows = await ctx.client.query(
        `select id, direction, subject, body, status, ai_confidence::text as ai_confidence,
                created_at::text as created_at
         from cs_messages
         where lower(email) = $1
         order by created_at asc
         limit 100`,
        [email],
      );
      const user = await ctx.client.query<{ id: string; status: string; created_at: string }>(
        `select id, status::text as status, created_at::text as created_at
         from users where lower(email) = $1`,
        [email],
      );
      return {
        email,
        registered: user.rows.length > 0,
        user_status: user.rows[0]?.status ?? null,
        messages: rows.rows,
      };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/cs/compose',
    auth: 'admin',
    input: z.object({
      email: z.string().email().max(320),
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(20000),
    }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      const email = input.email.trim().toLowerCase();
      let sent: { id: string; dryRun: boolean };
      try {
        sent = await sendCsEmail({ toEmail: email, subject: input.subject, body: input.body });
      } catch (error) {
        if (error instanceof CsMailError) throw new ApiError('CS_SEND_FAILED', error.message);
        throw error;
      }
      const row = await ctx.client.query<{ id: string }>(
        `insert into cs_messages (direction, email, subject, body, status, handled_by, resend_email_id, handled_at)
         values ('SENT', $1, $2, $3, 'SENT', $4, $5, now())
         returning id`,
        [email, input.subject, input.body, ctx.userId, sent.id],
      );
      await audit(ctx, 'CS_COMPOSE', row.rows[0]!.id);
      return { id: row.rows[0]!.id, resend_email_id: sent.id, dry_run: sent.dryRun };
    },
  });

  registry.register({
    method: 'GET',
    path: '/api/v1/admin/cs/broadcast-targets',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const r = await ctx.client.query<{ count: number }>(
        `select count(*)::int as count from users
         where status = 'ACTIVE' and email not like '%@user.sevendays' and email not like 'moved+%'`,
      );
      return { count: r.rows[0]?.count ?? 0 };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/cs/broadcast',
    auth: 'admin',
    idempotencyKeyRequired: true,
    input: z.object({
      subject: z.string().min(1).max(300),
      body: z.string().min(1).max(50000),
      // TEST=自分(呼び出した管理者)宛てのみ / ALL=全ACTIVEユーザー
      mode: z.enum(['TEST', 'ALL']),
      // true でプッシュ通知も同時配信(Decision 084)。TESTは自分の購読端末のみ。
      push: z.boolean().optional(),
    }),
    handler: async (ctx, input) => {
      requireAdminRole(ctx);
      // 宛先の確定
      let recipients: { email: string }[];
      if (input.mode === 'TEST') {
        const me = await ctx.client.query<{ email: string }>(
          `select email from users where id = $1`,
          [ctx.userId],
        );
        recipients = me.rows;
      } else {
        const r = await ctx.client.query<{ email: string }>(
          `select email from users
           where status = 'ACTIVE' and email not like '%@user.sevendays' and email not like 'moved+%'
           order by created_at
           limit 500`,
          [],
        );
        recipients = r.rows;
      }

      const job = await ctx.client.query<{ id: string }>(
        `insert into cs_broadcasts (subject, body, mode, total, created_by, idempotency_key)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (idempotency_key) do nothing
         returning id`,
        [input.subject, input.body, input.mode, recipients.length, ctx.userId, ctx.idempotencyKey],
      );
      if (job.rows.length === 0) {
        // 同一キーの再送: 既存ジョブを返す(再送信しない)
        const existing = await ctx.client.query<{ id: string; status: string; sent: number; failed: number }>(
          `select id, status, sent, failed from cs_broadcasts where idempotency_key = $1`,
          [ctx.idempotencyKey],
        );
        const e = existing.rows[0]!;
        return { id: e.id, status: e.status, sent: e.sent, failed: e.failed, duplicate: true };
      }
      const broadcastId = job.rows[0]!.id;

      // 逐次送信(Resendのレート制限 ~2req/s を尊重)。現在の規模(〜500)向けの
      // 同期実装 — 数千規模になったらワーカー化する(CS_SETUP.md参照)。
      let sentCount = 0;
      let failedCount = 0;
      for (const r of recipients) {
        try {
          const sent = await sendCsEmail({ toEmail: r.email, subject: input.subject, body: input.body });
          await ctx.client.query(
            `insert into cs_messages (direction, email, subject, body, status, handled_by, resend_email_id, broadcast_id, handled_at)
             values ('SENT', $1, $2, $3, 'SENT', $4, $5, $6, now())`,
            [r.email, input.subject, input.body, ctx.userId, sent.id, broadcastId],
          );
          sentCount += 1;
          if (!sent.dryRun && recipients.length > 1) {
            await new Promise((resolve) => setTimeout(resolve, 550));
          }
        } catch {
          failedCount += 1;
        }
        await ctx.client.query(
          `update cs_broadcasts set sent = $2, failed = $3 where id = $1`,
          [broadcastId, sentCount, failedCount],
        );
      }
      await ctx.client.query(
        `update cs_broadcasts set status = $2, completed_at = now() where id = $1`,
        [broadcastId, failedCount === recipients.length && recipients.length > 0 ? 'FAILED' : 'DONE'],
      );

      // プッシュ同時配信(Decision 084)。broadcast_key=cs:{ジョブID}で冪等、
      // TESTは自分の購読端末のみ。失敗してもメルマガの成否には関与させない。
      let push: (BroadcastResult & { configured: boolean }) | null = null;
      if (input.push) {
        const transport = buildWebPushTransport();
        if (!transport) {
          push = { configured: false, skipped: true, sent: 0, disabled: 0, failed: 0 };
        } else {
          try {
            const pushResult = await sendNightlyBroadcast(ctx.client, {
              broadcastKey: `cs:${broadcastId}`,
              message: {
                title: input.subject.slice(0, 60),
                body: 'お知らせが届きました。メールをご確認ください。 / A new announcement has arrived — check your email.',
                url: '/dashboard',
              },
              transport,
              ...(input.mode === 'TEST' ? { onlyUserId: ctx.userId } : {}),
            });
            push = { configured: true, ...pushResult };
          } catch {
            push = { configured: true, skipped: false, sent: 0, disabled: 0, failed: -1 };
          }
        }
      }

      await audit(
        ctx,
        `CS_BROADCAST:${input.mode}:${sentCount}/${recipients.length}${push ? `:push${push.sent}` : ''}`,
        broadcastId,
      );
      return { id: broadcastId, status: 'DONE', total: recipients.length, sent: sentCount, failed: failedCount, push };
    },
  });

  /* ---- サイト内お問い合わせ(2026-07-09): フォーム→同じ承認キューへ ------- */

  registry.register({
    method: 'POST',
    path: '/api/v1/contact',
    auth: 'user',
    input: z.object({
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(10000),
    }),
    handler: async (ctx, input) => {
      // 連投ガード: 24時間で10件まで
      const recent = await ctx.client.query<{ count: number }>(
        `select count(*)::int as count from cs_messages
         where user_id = $1 and direction = 'RECEIVED'
           and created_at > now() - interval '24 hours'`,
        [ctx.userId],
      );
      if ((recent.rows[0]?.count ?? 0) >= 10) {
        throw new ApiError('CONTACT_LIMIT', 'お問い合わせは24時間に10件までです');
      }
      const me = await ctx.client.query<{ email: string }>(
        `select email from users where id = $1`,
        [ctx.userId],
      );
      const email = me.rows[0]?.email ?? '';
      const row = await ctx.client.query<{ id: string }>(
        `insert into cs_messages (direction, user_id, email, subject, body, status)
         values ('RECEIVED', $1, $2, $3, $4, 'PENDING')
         returning id`,
        [ctx.userId, email, input.subject, input.body],
      );
      return { id: row.rows[0]!.id, status: 'PENDING' };
    },
  });

  registry.register({
    method: 'POST',
    path: '/api/v1/admin/cs/:id/draft',
    auth: 'admin',
    handler: async (ctx) => {
      requireAdminRole(ctx);
      const msg = await ctx.client.query<{
        id: string; email: string; name: string | null; subject: string | null;
        body: string; status: string; user_id: string | null;
      }>(
        `select id, email, name, subject, body, status, user_id
         from cs_messages where id = $1 and direction = 'RECEIVED'`,
        [ctx.params.id],
      );
      const m = msg.rows[0];
      if (!m) throw new ApiError('NOT_FOUND', 'Message not found');
      // 送信者文脈(Webhook経路と同じ・公開可能情報のみ)
      const account: {
        registered: boolean; activeHorses?: number; horseNames?: string[]; createdAt?: string;
      } = { registered: m.user_id !== null };
      if (m.user_id) {
        const u = await ctx.client.query<{ created_at: string }>(
          `select created_at::text as created_at from users where id = $1`,
          [m.user_id],
        );
        if (u.rows[0]) account.createdAt = u.rows[0].created_at;
        const horses = await ctx.client.query<{ name: string }>(
          `select name from horses where owner_user_id = $1 and status = 'ACTIVE' limit 10`,
          [m.user_id],
        );
        account.activeHorses = horses.rows.length;
        account.horseNames = horses.rows.map((h) => h.name);
      }
      const historyRows = await ctx.client.query<{
        direction: 'RECEIVED' | 'SENT'; subject: string | null; body: string;
      }>(
        `select direction, subject, body from cs_messages
         where email = $1 and id <> $2 order by created_at desc limit 6`,
        [m.email, m.id],
      );
      const ai = await generateCsReply({
        senderName: m.name ?? '',
        senderEmail: m.email,
        subject: m.subject ?? '',
        body: m.body,
        account,
        history: historyRows.rows.reverse(),
      });
      await ctx.client.query(
        `update cs_messages set ai_draft = $2, ai_confidence = $3, ai_reason = $4 where id = $1`,
        [m.id, ai.reply || null, ai.confidence, ai.needsHuman ? ai.reason || '要確認' : null],
      );
      return {
        id: m.id,
        ai_draft: ai.reply,
        ai_confidence: ai.confidence,
        ai_reason: ai.needsHuman ? ai.reason : null,
      };
    },
  });
}
