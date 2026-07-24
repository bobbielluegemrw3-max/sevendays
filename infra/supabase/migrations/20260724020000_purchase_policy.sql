-- Migration: purchase policy (安定/おまかせ/頭数) for pool purchases — DORMANT.
-- MARKET_VARIABLE_PRICING_READINESS_BRIEF.md / FUN_V3_PLAN.md §4 施策A.
--
-- The purchase policy is a per-session SORT preference the allocation applies
-- when selecting horses for a buyer (STABLE = high total_value first,
-- QUANTITY = low total_value / cheaper first, OMAKASE = current deterministic
-- queue order). It NEVER filters — the 3-stage fallback (budget stop → Day0
-- mint → refund) is unchanged.
--
-- ★DORMANT: defaults to 'OMAKASE' (current behaviour). No API/UI writes any
-- other value yet — that is the post-owner-decision (§5) go-live step, paired
-- with band pricing. Queue/allocation determinism (G4) is preserved: the sort
-- is a pure function of persisted total_value + seed tiebreaks.

alter table purchase_sessions
  add column purchase_policy text not null default 'OMAKASE'
    check (purchase_policy in ('STABLE', 'OMAKASE', 'QUANTITY'));

comment on column purchase_sessions.purchase_policy is
  'Pool purchase policy — allocation sort preference (STABLE/OMAKASE/QUANTITY). '
  'Dormant: defaults to OMAKASE (current order) until variable pricing goes live.';
