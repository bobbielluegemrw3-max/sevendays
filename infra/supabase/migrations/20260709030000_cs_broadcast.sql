-- CS拡張(2026-07-09): betimailの一斉送信・個別送信を移植。
-- 一斉送信はジョブとして記録し、宛先ごとの送信は cs_messages(SENT) に残す。

create table cs_broadcasts (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  mode text not null check (mode in ('TEST', 'ALL')),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'DONE', 'FAILED')),
  total int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  created_by uuid not null references users (id),
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table cs_messages add column broadcast_id uuid references cs_broadcasts (id);
create index idx_cs_messages_broadcast on cs_messages (broadcast_id) where broadcast_id is not null;
