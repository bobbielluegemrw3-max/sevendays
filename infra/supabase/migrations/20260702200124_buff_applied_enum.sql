-- Migration 24: buff lifecycle APPLIED state (Decision 057).
-- (ALTER TYPE ADD VALUE must commit before first use — the column/index
--  changes live in migration 25.)

alter type buff_status add value if not exists 'APPLIED' before 'CONSUMED';
