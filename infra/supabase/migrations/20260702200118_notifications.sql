-- Migration 18: notifications (07_API.md GET /notifications; implementation
-- artifact — content types are open item E17, so payload is generic JSON)

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  notification_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
