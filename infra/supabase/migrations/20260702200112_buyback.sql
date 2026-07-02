-- Migration 12: buyback_schedules, buyback_schedule_payments
-- (06_DATABASE.md, 05_SETTLEMENT_ENGINE.md, Decision 042)

create table buyback_schedules (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses (id) unique, -- one schedule per horse
  user_id uuid not null references users (id),
  status buyback_status not null default 'SCHEDULED',
  total_amount numeric(20, 8) not null check (total_amount = 200),
  payment_count int not null check (payment_count = 7),
  day7_clear_date date not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table buyback_schedule_payments (
  id uuid primary key default gen_random_uuid(),
  buyback_schedule_id uuid not null references buyback_schedules (id),
  payment_number int not null check (payment_number between 1 and 7),
  due_date date not null,
  amount numeric(20, 8) not null check (amount > 0),
  status buyback_payment_status not null default 'SCHEDULED',
  ledger_transaction_id uuid references ledger_transactions (id),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint uq_buyback_payment unique (buyback_schedule_id, payment_number),
  -- Payments 1-6 are 28.57142857; payment 7 adjusts rounding to reach exactly 200.
  constraint buyback_payment_amounts check (
    (payment_number between 1 and 6 and amount = 28.57142857)
    or (payment_number = 7 and amount = 28.57142858)
  )
);

-- A PAID payment must reference its ledger transaction; PAID is final.
create or replace function guard_buyback_payment()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'PAID' then
    raise exception 'BUYBACK_PAYMENT_FINAL: paid payment % cannot change', old.id;
  end if;
  if new.status = 'PAID' and new.ledger_transaction_id is null then
    raise exception 'BUYBACK_PAYMENT_WITHOUT_LEDGER: payment % requires ledger_transaction_id', new.id;
  end if;
  return new;
end;
$$;

create trigger trg_buyback_payment_guard
before insert or update on buyback_schedule_payments
for each row execute function guard_buyback_payment();

create trigger trg_buyback_payments_no_delete
before delete on buyback_schedule_payments
for each row execute function forbid_delete();
