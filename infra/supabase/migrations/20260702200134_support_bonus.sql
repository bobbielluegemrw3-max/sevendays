-- Migration 34: Support Bonus v2 (Decision 074) — placement tree, referral
-- codes, placement audit. The sponsor relation (direct_referrer_user_id)
-- stays as-is; placement is a SECOND, separately-immutable relation that
-- carries the tier payouts.

-- 1) users: placement + referral code -----------------------------------

alter table users
  add column placement_parent_user_id uuid references users (id),
  add column placed_at timestamptz,
  add column referral_code text,
  add constraint users_no_self_placement check (placement_parent_user_id <> id);

-- Deterministic short referral code (12 hex chars of sha256(id || salt)).
-- Deterministic so retries/backfills converge; uniqueness is enforced by
-- index (collision odds at 48 bits are negligible, and an insert would
-- fail loudly rather than corrupt).
create or replace function set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    new.referral_code := substr(encode(digest(new.id::text || ':sdd-ref-v1', 'sha256'), 'hex'), 1, 12);
  end if;
  return new;
end;
$$;

create trigger trg_users_referral_code
before insert on users
for each row execute function set_referral_code();

update users
set referral_code = substr(encode(digest(id::text || ':sdd-ref-v1', 'sha256'), 'hex'), 1, 12)
where referral_code is null;

alter table users alter column referral_code set not null;
create unique index uq_users_referral_code on users (referral_code);

-- 2) placement guard: write-once + cycle detection ------------------------
-- Placement can be set once (by the sponsor via the API). Any later change
-- — including clearing it — requires the audited admin override flag
-- (set per-transaction by the Admin endpoint only).

create or replace function guard_placement()
returns trigger
language plpgsql
as $$
declare
  cursor_id uuid;
  hops int := 0;
begin
  if tg_op = 'UPDATE'
     and old.placement_parent_user_id is not null
     and new.placement_parent_user_id is distinct from old.placement_parent_user_id
     and coalesce(current_setting('sevendays.placement_admin_override', true), '') <> 'on' then
    raise exception 'PLACEMENT_IMMUTABLE: placement_parent_user_id cannot be changed once set';
  end if;

  if new.placement_parent_user_id is not null
     and (tg_op = 'INSERT' or new.placement_parent_user_id is distinct from old.placement_parent_user_id) then
    new.placed_at := now();
    cursor_id := new.placement_parent_user_id;
    while cursor_id is not null loop
      if cursor_id = new.id then
        raise exception 'PLACEMENT_CYCLE_DETECTED: user % would create a placement cycle', new.id;
      end if;
      hops := hops + 1;
      if hops > 10000 then
        raise exception 'PLACEMENT_CHAIN_TOO_LONG';
      end if;
      select placement_parent_user_id into cursor_id from users where id = cursor_id;
    end loop;
  end if;
  return new;
end;
$$;

create trigger trg_users_placement_guard
before insert or update of placement_parent_user_id on users
for each row execute function guard_placement();

-- 3) placement audit (service-written; every placement + every override) --

create table placement_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  old_parent_user_id uuid references users (id),
  new_parent_user_id uuid references users (id),
  actor_user_id uuid references users (id),
  action text not null check (action in ('PLACE', 'ADMIN_OVERRIDE')),
  reason text,
  created_at timestamptz not null default now()
);

create index idx_placement_audit_user on placement_audit (user_id);
-- Service-only table (RLS enabled, no policies — same pattern as race_seed_escrow).
alter table placement_audit enable row level security;

-- 4) lookup indexes for pool / subtree / tier-volume queries --------------

create index idx_users_placement_parent on users (placement_parent_user_id)
  where placement_parent_user_id is not null;
create index idx_users_direct_referrer on users (direct_referrer_user_id)
  where direct_referrer_user_id is not null;
