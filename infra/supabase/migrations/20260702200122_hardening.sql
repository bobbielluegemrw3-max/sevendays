-- Migration 22: hardening from Phase 0-3 audit (diagnosis F1 + F5)
--
-- F1: guard_batch_step_update had a hole — a non-retryable FAILED step could
--     be rewritten to COMPLETED directly (bypassing the retry prohibition).
--     Now: COMPLETED is final; a FAILED non-retryable step is frozen; a FAILED
--     retryable step may only go back through PENDING/RUNNING (never straight
--     to COMPLETED).
-- F5: audit_logs gets a metadata_json column so reasons/context stop being
--     stuffed into hash columns.

alter table audit_logs
  add column metadata_json jsonb not null default '{}'::jsonb;

create or replace function guard_batch_step_update()
returns trigger
language plpgsql
as $$
begin
  if new.batch_run_id is distinct from old.batch_run_id
  or new.step_number is distinct from old.step_number
  or new.step_key is distinct from old.step_key
  or new.retryable is distinct from old.retryable
  or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'BATCH_STEP_IMMUTABLE: identity fields of step % cannot change', old.id;
  end if;

  -- Completed steps are final, full stop.
  if old.status = 'COMPLETED' and new.status is distinct from old.status then
    raise exception 'BATCH_STEP_FINAL: completed step % cannot change status', old.id;
  end if;

  if old.status = 'FAILED' and new.status is distinct from old.status then
    -- Non-retryable failure is terminal; only Admin Recovery works AROUND it.
    if not old.retryable then
      raise exception 'RETRY_FORBIDDEN: step % (%) is not retryable', old.step_key, old.id;
    end if;
    -- Retryable failures must re-run through the queue, never jump to COMPLETED.
    if new.status not in ('PENDING', 'RUNNING') then
      raise exception 'INVALID_BATCH_STATE: failed retryable step % may only return to PENDING/RUNNING', old.id;
    end if;
  end if;

  return new;
end;
$$;
