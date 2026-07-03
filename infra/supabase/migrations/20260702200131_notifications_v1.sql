-- Migration 31: notification spec v1.0 (Decision 065)

-- Deterministic dedupe key: batch retries / crash re-runs emit the same key
-- and conflict away instead of duplicating the notification.
alter table notifications
  add column dedupe_key text;

create unique index uq_notifications_dedupe
  on notifications (dedupe_key)
  where dedupe_key is not null;

-- Broadcast notifications (MARKETPLACE_LOCKED / MARKETPLACE_REOPENED) are a
-- single row with user_id null instead of a 100k-user fan-out.
alter table notifications
  alter column user_id drop not null;

drop policy sel_own_notifications on notifications;
create policy sel_own_notifications on notifications
  for select to authenticated using (user_id = auth.uid() or user_id is null);
