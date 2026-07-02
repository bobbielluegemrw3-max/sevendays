-- Migration 11: ownership_assignments (06_DATABASE.md, 05_SETTLEMENT_ENGINE.md)

create table ownership_assignments (
  id uuid primary key default gen_random_uuid(),
  batch_run_id uuid not null,
  purchase_session_id uuid not null references purchase_sessions (id),
  market_listing_id uuid references market_listings (id), -- null for Day0 Mint fallback
  horse_id uuid not null references horses (id),
  buyer_user_id uuid not null references users (id),
  seller_user_id uuid references users (id), -- null for Day0 Mint (platform is the source)
  assigned_price numeric(20, 8) not null check (assigned_price > 0),
  status assignment_status not null default 'PENDING',
  ledger_transaction_id uuid references ledger_transactions (id),
  created_at timestamptz not null default now(),
  constraint uq_assignment_session unique (purchase_session_id),
  constraint uq_assignment_batch_horse unique (batch_run_id, horse_id)
);

-- Ownership transfers only after Ledger settlement completes: a SETTLED
-- assignment must reference its ledger transaction.
create or replace function assert_assignment_settled_has_ledger()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'SETTLED' and new.ledger_transaction_id is null then
    raise exception 'ASSIGNMENT_WITHOUT_LEDGER: settled assignment % requires ledger_transaction_id', new.id;
  end if;
  return new;
end;
$$;

create trigger trg_assignment_settled_ledger
before insert or update of status on ownership_assignments
for each row execute function assert_assignment_settled_has_ledger();
