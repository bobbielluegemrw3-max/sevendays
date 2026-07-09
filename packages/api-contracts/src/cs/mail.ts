/**
 * Resend送信ラッパー(betimail mail.py の移植・fetchのみ)。
 * - CS_TEST_MODE=true のとき、CS_TEST_ALLOWED(カンマ区切り)以外への送信をブロック
 * - RESEND_API_KEY 未設定: 本番では例外、それ以外はドライラン(テスト用)
 */

export class CsMailError extends Error {
  constructor(
    public code: 'CS_MAIL_NOT_CONFIGURED' | 'CS_TEST_MODE_BLOCKED' | 'CS_SEND_FAILED',
    message: string,
  ) {
    super(message);
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface SendCsEmailInput {
  toEmail: string;
  toName?: string | null;
  subject: string;
  body: string;
  /** スレッド維持用: 元メールの RFC822 Message-Id */
  inReplyTo?: string | null;
}

export async function sendCsEmail(input: SendCsEmailInput): Promise<{ id: string; dryRun: boolean }> {
  const testMode = process.env.CS_TEST_MODE === 'true';
  if (testMode) {
    const allowed = (process.env.CS_TEST_ALLOWED ?? '')
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    if (!allowed.includes(input.toEmail.trim().toLowerCase())) {
      throw new CsMailError(
        'CS_TEST_MODE_BLOCKED',
        `CS_TEST_MODE のため ${input.toEmail} への送信は禁止されています`,
      );
    }
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CS_FROM_EMAIL ?? 'support@sevendaysderby.com';
  const fromName = process.env.CS_FROM_NAME ?? 'Seven Days Derby サポート';
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new CsMailError('CS_MAIL_NOT_CONFIGURED', 'RESEND_API_KEY が未設定です');
    }
    return { id: `dry-run-${Date.now()}`, dryRun: true };
  }

  const payload: Record<string, unknown> = {
    from: `${fromName} <${from}>`,
    to: [input.toName ? `${input.toName} <${input.toEmail}>` : input.toEmail],
    subject: input.subject,
    text: input.body,
    html: escapeHtml(input.body).replaceAll('\n', '<br>'),
  };
  if (input.inReplyTo) {
    payload.headers = { 'In-Reply-To': input.inReplyTo, References: input.inReplyTo };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new CsMailError('CS_SEND_FAILED', `Resend HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id ?? 'unknown', dryRun: false };
}
