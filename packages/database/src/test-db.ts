import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { loadMigrations } from './migrations.js';

/**
 * In-process Postgres (PGlite) with a Supabase-compatibility preamble,
 * used to verify migrations and DB-level rules without Docker.
 *
 * The preamble emulates what Supabase provides out of the box:
 *   - `auth.uid()` reading the JWT subject from a session setting
 *   - `authenticated` / `anon` roles with table grants
 *     (privileges are granted broadly so that denials in tests come from
 *     RLS policies, exactly like production Supabase)
 */

const SUPABASE_COMPAT_PREAMBLE = `
create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;
`;

const POST_MIGRATION_GRANTS = `
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
`;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_COMPAT_PREAMBLE);
  for (const migration of loadMigrations()) {
    try {
      await db.exec(migration.sql);
    } catch (error) {
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`);
    }
  }
  await db.exec(POST_MIGRATION_GRANTS);
  return db;
}

/** Run a callback as an authenticated user (RLS applies), then restore. */
export async function asUser<T>(
  db: PGlite,
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.exec(
    `select set_config('request.jwt.claim.sub', '${userId}', false); set role authenticated;`,
  );
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

/** Expect a statement to fail with a message containing `needle`. */
export async function expectDbError(
  promise: Promise<unknown>,
  needle: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const message = (error as Error).message;
    if (!message.includes(needle)) {
      throw new Error(`Expected error containing "${needle}", got: ${message}`);
    }
    return;
  }
  throw new Error(`Expected error containing "${needle}", but statement succeeded`);
}
