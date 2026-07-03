-- Migration 30: dual-approval records for large-withdrawal Admin Review
-- (Decision 060: >= 1,000 USDT requires one FINANCE_ADMIN + one SUPER_ADMIN,
--  two distinct persons — the Recovery Procedure standard.)

create table withdrawal_review_approvals (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references blockchain_withdrawals (id),
  admin_user_id uuid not null references users (id),
  admin_role admin_role not null,
  created_at timestamptz not null default now(),
  -- two DISTINCT persons, and one approval per role (FINANCE + SUPER)
  constraint uq_withdrawal_approval_admin unique (withdrawal_id, admin_user_id),
  constraint uq_withdrawal_approval_role unique (withdrawal_id, admin_role)
);

-- Approvals are append-only audit records.
create trigger trg_withdrawal_approvals_immutable
before update or delete on withdrawal_review_approvals
for each row execute function forbid_mutation();

-- Service-only (like recovery tables): RLS enabled, no policies.
alter table withdrawal_review_approvals enable row level security;

-- The approver must actually hold the role they approve with.
create or replace function assert_withdrawal_approver_role()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from admin_role_grants g
    where g.user_id = new.admin_user_id and g.role = new.admin_role
      and g.revoked_at is null
  ) then
    raise exception 'WITHDRAWAL_APPROVER_ROLE_MISSING: user % does not hold role %',
      new.admin_user_id, new.admin_role;
  end if;
  return new;
end;
$$;

create trigger trg_withdrawal_approver_role
before insert on withdrawal_review_approvals
for each row execute function assert_withdrawal_approver_role();
