import { z } from 'zod';
import { ApiError } from '../errors.js';
import type { ApiRegistry, HandlerContext } from '../router.js';
import { sendCsEmail, CsMailError } from '../cs/mail.js';

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
}
