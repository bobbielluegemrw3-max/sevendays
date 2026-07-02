-- Migration 13: memorial_nfts (06_DATABASE.md, Decision 049: on-chain mint)

create table memorial_nfts (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references horses (id) unique, -- one Memorial NFT per horse
  user_id uuid not null references users (id),
  buyback_schedule_id uuid not null references buyback_schedules (id) unique,
  metadata_json jsonb not null,
  -- on-chain mint record (Decision 049); filled by the mint worker
  chain_id text,
  token_contract text,
  token_id text,
  mint_tx_hash text,
  minted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index uq_memorial_onchain
  on memorial_nfts (chain_id, token_contract, token_id)
  where token_id is not null;

-- Memorial record is permanent; only on-chain mint fields may be filled once.
create or replace function guard_memorial_update()
returns trigger
language plpgsql
as $$
begin
  if new.horse_id is distinct from old.horse_id
  or new.user_id is distinct from old.user_id
  or new.buyback_schedule_id is distinct from old.buyback_schedule_id
  or new.metadata_json is distinct from old.metadata_json
  or new.created_at is distinct from old.created_at then
    raise exception 'MEMORIAL_IMMUTABLE: memorial NFT % core fields cannot change', old.id;
  end if;
  if old.mint_tx_hash is not null and (
    new.chain_id is distinct from old.chain_id
    or new.token_contract is distinct from old.token_contract
    or new.token_id is distinct from old.token_id
    or new.mint_tx_hash is distinct from old.mint_tx_hash
    or new.minted_at is distinct from old.minted_at
  ) then
    raise exception 'MEMORIAL_MINT_FINAL: on-chain mint record for % cannot change', old.id;
  end if;
  return new;
end;
$$;

create trigger trg_memorial_guard
before update on memorial_nfts
for each row execute function guard_memorial_update();

create trigger trg_memorial_no_delete
before delete on memorial_nfts
for each row execute function forbid_delete();
