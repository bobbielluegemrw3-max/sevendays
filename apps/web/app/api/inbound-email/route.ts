import { createHmac, timingSafeEqual } from 'node:crypto';
import { withSqlClient } from '@/lib/db';
import { generateCsReply } from '@sevendays/api-contracts';

/**
 * Resend 受信Webhook(betimail webhook.py + main.py /webhook/email の移植)。
 * support@ 宛のメールを取り込み、DeepSeekの下書きを付けて承認キューへ入れる。
 * 初期運用は全件承認制(自動送信はしない)。
 */

export const dynamic = 'force-dynamic';

const TOLERANCE_SECONDS = 5 * 60;

function decodeSecret(secret: string): Buffer {
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  try {
    return Buffer.from(raw, 'base64');
  } catch {
    return Buffer.from(raw, 'utf-8');
  }
}

/** Svix互換署名検証(Resend Webhookの標準)。 */
function verifySignature(request: Request, body: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production'; // 本番は必須
  const svixId = request.headers.get('svix-id') ?? '';
  const svixTimestamp = request.headers.get('svix-timestamp') ?? '';
  const svixSignature = request.headers.get('svix-signature') ?? '';
  if (!svixId || !svixTimestamp || !svixSignature) return false;
  const ts = Number(svixTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const expected = createHmac('sha256', decodeSecret(secret)).update(signedContent).digest('base64');
  for (const part of svixSignature.split(' ')) {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) continue;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

function asText(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

function extractEmails(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  return list
    .map((v) => {
      const s = asText(v);
      const m = /<([^>]+)>/.exec(s);
      return (m ? m[1]! : s).trim().toLowerCase();
    })
    .filter((s) => s.includes('@'));
}

function isAllowedRecipient(emails: string[]): boolean {
  const support = (process.env.CS_FROM_EMAIL ?? 'support@sevendaysderby.com').toLowerCase();
  const domain = support.split('@')[1] ?? '';
  return emails.some((e) => e === support || e.endsWith(`@${domain}`));
}

export async function POST(request: Request): Promise<Response> {
  const bodyText = await request.text();
  if (!verifySignature(request, bodyText)) {
    return Response.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const eventType = asText(payload.type);
  const data = (payload.data ?? payload) as Record<string, unknown>;
  let senderRaw = asText(data.from ?? data.sender);
  let senderName = asText(data.from_name ?? data.sender_name);
  const subject = asText(data.subject);
  let body = asText(data.text) || asText(data.html) || asText(data.body);
  let messageId = asText(data.message_id);
  const inReplyTo = asText(data.in_reply_to);
  const emailId = asText(data.email_id) || asText(data.id);
  let toEmails = extractEmails(data.to ?? data.recipients ?? []);

  // "Name <email>" 形式の分解
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(senderRaw);
  if (m) {
    senderName = senderName || m[1]!.replaceAll('"', '').trim();
    senderRaw = m[2]!.trim();
  }
  const senderEmail = senderRaw.toLowerCase();

  // email.received はメタデータのみ → 本文をResend APIで取得。
  // 失敗理由はレスポンスに載せる(Resendの配信ログで直接見えるように)。
  // 5xxを返すとResend(Svix)が自動リトライするため、一過性の失敗にも強い。
  let hydrateError = '';
  if (eventType === 'email.received' && !body && emailId) {
    if (!process.env.RESEND_API_KEY) {
      hydrateError = 'RESEND_API_KEY is not set on the server';
    } else {
      // 新旧両方のAPIパスを試す(betimail実績: /inbound/emails/{id})
      for (const url of [
        `https://api.resend.com/inbound/emails/${emailId}`,
        `https://api.resend.com/emails/inbound/${emailId}`,
      ]) {
        try {
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          });
          if (!res.ok) {
            hydrateError = `${url} -> HTTP ${res.status}`;
            continue;
          }
          const full = (await res.json()) as Record<string, unknown>;
          body = asText(full.text) || asText(full.html);
          if (toEmails.length === 0) toEmails = extractEmails(full.to ?? full.recipients ?? []);
          if (!messageId) messageId = asText(full.message_id);
          if (body) { hydrateError = ''; break; }
          hydrateError = `${url} -> 200 but empty text/html`;
        } catch (error) {
          hydrateError = `${url} -> ${String(error).slice(0, 120)}`;
        }
      }
    }
  }

  if (toEmails.length > 0 && !isAllowedRecipient(toEmails)) {
    return Response.json({ status: 'ignored', reason: 'recipient_not_allowed' });
  }
  if (!senderEmail) {
    return Response.json({ status: 'ignored', reason: 'missing_sender' });
  }
  if (!body) {
    // 500でResendに再試行させる+失敗理由をダッシュボードで見えるようにする
    return Response.json(
      { status: 'error', reason: 'body_hydration_failed', detail: hydrateError },
      { status: 500 },
    );
  }

  return withSqlClient(async (client) => {
    // 重複排除(betimailと同じ2キー)
    if (messageId) {
      const dup = await client.query(
        `select 1 from cs_messages where message_id = $1 and direction = 'RECEIVED'`,
        [messageId],
      );
      if (dup.rows.length > 0) return Response.json({ status: 'duplicate' });
    }
    if (emailId) {
      const dup = await client.query(
        `select 1 from cs_messages where webhook_email_id = $1`,
        [emailId],
      );
      if (dup.rows.length > 0) return Response.json({ status: 'duplicate' });
    }

    // 送信者の公開可能な文脈(数値・残高は渡さない — なりすまし対策)
    const user = await client.query<{ id: string; created_at: string }>(
      `select id, created_at::text as created_at from users where lower(email) = $1`,
      [senderEmail],
    );
    const account: {
      registered: boolean; activeHorses?: number; horseNames?: string[]; createdAt?: string;
    } = { registered: user.rows.length > 0 };
    if (user.rows[0]) {
      account.createdAt = user.rows[0].created_at;
      const horses = await client.query<{ name: string }>(
        `select name from horses where owner_user_id = $1 and status = 'ACTIVE' limit 10`,
        [user.rows[0].id],
      );
      account.activeHorses = horses.rows.length;
      account.horseNames = horses.rows.map((h) => h.name);
    }

    const historyRows = await client.query<{
      direction: 'RECEIVED' | 'SENT'; subject: string | null; body: string;
    }>(
      `select direction, subject, body from cs_messages
       where email = $1 order by created_at desc limit 6`,
      [senderEmail],
    );

    const ai = await generateCsReply({
      senderName,
      senderEmail,
      subject,
      body,
      account,
      history: historyRows.rows.reverse(),
    });

    const inserted = await client.query<{ id: string }>(
      `insert into cs_messages
         (direction, user_id, email, name, subject, body, message_id, webhook_email_id,
          in_reply_to, ai_draft, ai_confidence, ai_reason, status)
       values ('RECEIVED', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING')
       on conflict do nothing
       returning id`,
      [
        user.rows[0]?.id ?? null,
        senderEmail,
        senderName || null,
        subject || null,
        body,
        messageId || null,
        emailId || null,
        inReplyTo || null,
        ai.reply || null,
        ai.confidence,
        ai.needsHuman ? ai.reason || '要確認' : null,
      ],
    );
    if (inserted.rows.length === 0) return Response.json({ status: 'duplicate' });
    return Response.json({ status: 'queued', id: inserted.rows[0]!.id });
  });
}
