-- FUN overhaul V2 — two races a day (Decision 102), phase V2実装-2.
--
-- batch_runs and night_forecasts become keyed by (date, slot MORNING|NIGHT).
-- Everything is backward compatible: slot defaults to 'NIGHT', so the current
-- one-race-a-day production season continues unchanged (existing rows and new
-- V1 batches are all NIGHT). The MORNING cadence only starts when
-- race_engine_v2.0 is activated at the testnet-reset rollout.
--
-- BUYBACK_RESERVE_BACKSTOP (Decision 102-8): new ledger transaction type for
-- the explicit operating-reserve top-up posted immediately before
-- PAY_DUE_BUYBACKS when the buyback reserve is short of that batch's due
-- payments — making unpaid buybacks structurally impossible. The value is
-- only used at runtime by application code, never by migration DML, so it can
-- ride in this file (the ALTER TYPE restriction only bites same-transaction
-- DML usage — buff/marketing precedent).

create type race_slot as enum ('MORNING', 'NIGHT');

alter type transaction_type add value if not exists 'BUYBACK_RESERVE_BACKSTOP';

-- batch_runs: one batch per (date, slot) --------------------------------
alter table batch_runs
  add column slot race_slot not null default 'NIGHT';

alter table batch_runs drop constraint batch_runs_batch_date_key;
alter table batch_runs add constraint uq_batch_runs_date_slot unique (batch_date, slot);

-- night_forecasts: one committed condition seed per (date, slot) --------
-- The chain becomes chronological in V2: the MORNING batch commits the same
-- date's NIGHT forecast; the NIGHT batch commits the next date's MORNING
-- forecast. V1 batches keep committing (date+1, NIGHT) exactly as today.
alter table night_forecasts
  add column slot race_slot not null default 'NIGHT';

alter table night_forecasts drop constraint night_forecasts_forecast_date_key;
alter table night_forecasts add constraint uq_night_forecasts_date_slot unique (forecast_date, slot);
