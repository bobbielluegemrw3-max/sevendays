-- Migration 27: Admin Recovery execution support (05_SETTLEMENT_ENGINE.md).
--
-- Failed non-retryable steps stay frozen for everyone EXCEPT an approved
-- recovery session (session flag sevendays.recovery_mode = 'on', set only
-- by executeRecovery after dual approval). Even then, only step STATUS can
-- move — race results, burns, seeds, snapshots, and posted ledger rows keep
-- their own unconditional immutability triggers, so recovery can re-execute
-- idempotent deterministic work but can never change outcomes.

create or replace function guard_batch_step_update()
returns trigger
language plpgsql
as $$
declare
  recovery_mode boolean :=
    coalesce(current_setting('sevendays.recovery_mode', true), '') = 'on';
begin
  if new.batch_run_id is distinct from old.batch_run_id
  or new.step_number is distinct from old.step_number
  or new.step_key is distinct from old.step_key
  or new.retryable is distinct from old.retryable
  or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'BATCH_STEP_IMMUTABLE: identity fields of step % cannot change', old.id;
  end if;

  -- Completed steps are final — recovery included.
  if old.status = 'COMPLETED' and new.status is distinct from old.status then
    raise exception 'BATCH_STEP_FINAL: completed step % cannot change status', old.id;
  end if;

  if old.status = 'FAILED' and new.status is distinct from old.status then
    if not old.retryable and not recovery_mode then
      raise exception 'RETRY_FORBIDDEN: step % (%) is not retryable', old.step_key, old.id;
    end if;
    if new.status not in ('PENDING', 'RUNNING') then
      raise exception 'INVALID_BATCH_STATE: failed step % may only return to PENDING/RUNNING', old.id;
    end if;
  end if;

  return new;
end;
$$;

-- Recovery bookkeeping: completion timestamp and one open recovery per batch.
alter table recovery_snapshots add column completed_at timestamptz;

create unique index uq_recovery_open_per_batch
  on recovery_snapshots (batch_run_id)
  where completed_at is null;
