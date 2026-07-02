-- Migration 25: buff binding to the assigned horse (Decision 057).
--
-- Lifecycle: ACTIVE (waiting) -> APPLIED (bound to the horse from the
-- user's next successful assignment) -> CONSUMED (after that horse's
-- first race — snapshot inclusion commits the buff to exactly one race).

alter table revenge_buffs
  add column applied_horse_id uuid references horses (id);

-- One live buff per user across ACTIVE and APPLIED (06_DATABASE.md:
-- "one active/pending/applied buff per user").
drop index uq_revenge_buff_one_active;
create unique index uq_revenge_buff_one_live
  on revenge_buffs (user_id)
  where status in ('ACTIVE', 'APPLIED');

-- An APPLIED buff must reference the horse it is bound to.
alter table revenge_buffs
  add constraint buff_applied_requires_horse check (
    status <> 'APPLIED' or applied_horse_id is not null
  );
