-- Migration 02: users, admin role grants, referral cycle detection
-- (06_DATABASE.md users; Decision 041 valid referrer; plan Phase 11 admin roles)

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status user_status not null default 'ACTIVE',
  direct_referrer_user_id uuid references users (id),
  created_at timestamptz not null default now(),
  constraint users_no_self_referral check (direct_referrer_user_id <> id)
);

-- Referral cycle detection at registration/binding time (06_DATABASE.md).
create or replace function assert_no_referral_cycle()
returns trigger
language plpgsql
as $$
declare
  cursor_id uuid;
  hops int := 0;
begin
  if new.direct_referrer_user_id is null then
    return new;
  end if;
  -- Referrer binding is write-once.
  if tg_op = 'UPDATE'
     and old.direct_referrer_user_id is not null
     and new.direct_referrer_user_id is distinct from old.direct_referrer_user_id then
    raise exception 'REFERRER_IMMUTABLE: direct_referrer_user_id cannot be changed once set';
  end if;

  cursor_id := new.direct_referrer_user_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'REFERRAL_CYCLE_DETECTED: user % would create a referral cycle', new.id;
    end if;
    hops := hops + 1;
    if hops > 10000 then
      raise exception 'REFERRAL_CHAIN_TOO_LONG';
    end if;
    select direct_referrer_user_id into cursor_id from users where id = cursor_id;
  end loop;
  return new;
end;
$$;

create trigger trg_users_referral_cycle
before insert or update of direct_referrer_user_id on users
for each row execute function assert_no_referral_cycle();

-- Admin role grants (FINANCE_ADMIN / SUPER_ADMIN). Dual approval logic checks
-- two DISTINCT admins; grants themselves are audited via audit_logs.
create table admin_role_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id),
  role admin_role not null,
  granted_by_user_id uuid references users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index uq_admin_role_active
  on admin_role_grants (user_id, role)
  where revoked_at is null;
