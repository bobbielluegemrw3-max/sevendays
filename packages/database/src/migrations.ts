import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path to the Supabase migrations directory (infra/supabase/migrations). */
export function migrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // packages/database/src (or dist) -> repo root -> infra/supabase/migrations
  return join(here, '..', '..', '..', 'infra', 'supabase', 'migrations');
}

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
}

/** All migration files in lexicographic (= chronological) order. */
export function loadMigrations(dir = migrationsDir()): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
}
