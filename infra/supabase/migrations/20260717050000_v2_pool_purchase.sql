-- FUN overhaul V2 — pool purchase (Decision 103), phase V2実装-3a.
--
-- "Build me a $1,000 stable": a purchase session becomes a BUDGET POOL that
-- receives multiple horses (P2P listings first in the Decision 100 lottery
-- order, then LV0 mints, remainder < 102 auto-returns).
-- Backward compatible: session_mode defaults to SINGLE (the V1 per-horse
-- 177.16 lock) and every existing row/flow is unchanged; POOL sessions are
-- only created by the V2 purchase path.

create type purchase_session_mode as enum ('SINGLE', 'POOL');

alter table purchase_sessions
  add column session_mode purchase_session_mode not null default 'SINGLE';

-- A pool must afford at least the cheapest horse (one LV0 mint = 102).
alter table purchase_sessions
  add constraint chk_pool_budget
  check (session_mode <> 'POOL' or locked_amount >= 102);

-- One live pool per user: "reserve an amount, edit it until cutoff" —
-- edits change the amount of the single live pool instead of stacking rows.
create unique index uq_purchase_pool_live
  on purchase_sessions (user_id)
  where status = 'PENDING_ASSIGNMENT' and session_mode = 'POOL';

-- A pool session receives multiple horses: the one-assignment-per-session
-- constraint becomes per (session, horse). SINGLE mode keeps its 1:1 shape
-- through the application's resume guard (load-before-insert under the
-- batch advisory lock), same as before the constraint existed for it.
alter table ownership_assignments drop constraint uq_assignment_session;
alter table ownership_assignments
  add constraint uq_assignment_session_horse unique (purchase_session_id, horse_id);
