-- AIカスタマーサービス(2026-07-09, betimail方式の移植):
-- support@sevendaysderby.com への受信メールをResend Webhookで取り込み、
-- DeepSeekが下書きを生成し、管理者が承認して送信する(初期運用は全件承認)。

create table cs_messages (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('RECEIVED', 'SENT')),
  -- 送信者メールがusersに一致した場合のみ(なりすまし可能性があるため参考情報)
  user_id uuid references users (id),
  email text not null,
  name text,
  subject text,
  body text not null,
  -- 重複排除(betimailと同じ2キー)
  message_id text,
  webhook_email_id text,
  in_reply_to text,
  reply_to_cs_id uuid references cs_messages (id),
  -- AI下書き
  ai_draft text,
  ai_confidence numeric(4, 3),
  ai_reason text,
  -- PENDING(承認待ち) / SENT(承認送信済) / REJECTED / AUTO_SENT(将来) / FAILED
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SENT', 'REJECTED', 'AUTO_SENT', 'FAILED')),
  handled_by uuid references users (id),
  resend_email_id text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create unique index uq_cs_received_message_id
  on cs_messages (message_id) where message_id is not null and direction = 'RECEIVED';
create unique index uq_cs_webhook_email_id
  on cs_messages (webhook_email_id) where webhook_email_id is not null;
create index idx_cs_messages_status on cs_messages (status, created_at desc);
create index idx_cs_messages_email on cs_messages (email, created_at desc);
