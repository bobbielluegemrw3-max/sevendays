-- Migration 23: horse condition/fatigue state (Decision 054) and unique
-- horse names (Decision 055).

alter table horses
  add column condition numeric(20, 8) not null default 80.00
    check (condition between 0 and 100),
  add column fatigue numeric(20, 8) not null default 0.00
    check (fatigue between 0 and 100);

-- Duplicate names are not allowed; the name generator resolves collisions
-- with Roman numeral suffixes (Royal Thunder II, ...).
alter table horses add constraint uq_horses_name unique (name);
