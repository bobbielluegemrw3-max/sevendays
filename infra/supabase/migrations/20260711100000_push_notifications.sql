-- Webプッシュ配信基盤(Decision 084: 毎晩20:00「レース開始」プッシュ)
--
-- push_subscriptions: ブラウザのPushSubscription(endpoint+鍵)をユーザーに紐づけて保存。
--   購読はAPI(/api/v1/push/subscribe)からのみ・解除は disabled_at(削除しない)。
--   配信先が消えた(404/410)購読も disabled_at で無効化する。
-- push_broadcasts: 夜間ブロードキャストの冪等記録。broadcast_key(例 race-start:2026-07-11)
--   の一意制約で、バッチが再実行されても1晩1回しか送られない。

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  fail_count int not null default 0
);

create index idx_push_subscriptions_user on push_subscriptions (user_id);
create index idx_push_subscriptions_enabled on push_subscriptions (id) where disabled_at is null;

alter table push_subscriptions enable row level security;

create table push_broadcasts (
  id uuid primary key default gen_random_uuid(),
  broadcast_key text not null unique,
  sent_count int not null default 0,
  disabled_count int not null default 0,
  created_at timestamptz not null default now()
);

alter table push_broadcasts enable row level security;

create trigger trg_push_broadcasts_no_delete
before delete on push_broadcasts
for each row execute function forbid_delete();
