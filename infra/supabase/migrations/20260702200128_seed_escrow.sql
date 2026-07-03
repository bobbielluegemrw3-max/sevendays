-- Migration 28: race seed escrow.
--
-- Server Commit-Reveal (03_GAME_DESIGN.md): only the HASH may be visible
-- before the race. randomness_commits is transparently readable for
-- verification, so the raw seed must live elsewhere until Step 9 (reveal).
-- This table has RLS enabled with NO policies — service role only. The
-- reveal step moves the seed into randomness_commits (where the DB trigger
-- verifies SHA-256(seed) == commit_hash) and deletes the escrow row.

create table race_seed_escrow (
  race_id uuid primary key references races (id),
  seed text not null,
  created_at timestamptz not null default now()
);

alter table race_seed_escrow enable row level security;
-- no policies: invisible to authenticated/anon
