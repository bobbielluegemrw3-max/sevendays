#!/usr/bin/env node
/**
 * テスト用 Postgres にスキーマを流し込む(ローンチ前必須 L-5)。
 *
 * なぜ必要か: 二重支払い防止テスト(`packages/ledger/test/concurrency.test.ts`)は
 * **真の並行性**を要求するため PGlite(単一接続)では動かせず、実 Postgres が要る。
 * TEST_DATABASE_URL が無い間このテストは `describe.skipIf` で常時スキップされ、
 * **金の二重払いを防ぐ最後の砦がCIで一度も実行されていなかった。**
 *
 * ここでやること = `packages/database/src/test-db.ts`(PGlite版)と同じ手順を
 * 実 Postgres に対して行う:
 *   1. Supabase 互換プリアンブル(auth.uid() / authenticated・anon ロール)
 *   2. infra/supabase/migrations/*.sql を辞書順(=時系列)に適用
 *   3. 事後 GRANT(拒否は RLS だけが理由になるようにする)
 *
 * 使い方:
 *   TEST_DATABASE_URL=postgres://... node scripts/apply-test-schema.mjs
 *
 * 冪等ではない(まっさらなDBに1回流す前提)。CIのサービスコンテナ向け。
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error('TEST_DATABASE_URL is not set');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const migrationsDir = join(repoRoot, 'infra', 'supabase', 'migrations');

// `postgres` は @sevendays/ledger の依存。pnpm は厳格なので明示的に解決する
const require = createRequire(join(repoRoot, 'packages', 'ledger', 'package.json'));
const postgres = require('postgres');

const PREAMBLE = `
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

const GRANTS = `
grant usage on schema public to authenticated, anon;
grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
`;

const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  await sql.unsafe(PREAMBLE);

  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.error(`no migrations found in ${migrationsDir}`);
    process.exit(1);
  }
  for (const name of files) {
    const text = readFileSync(join(migrationsDir, name), 'utf8');
    try {
      await sql.unsafe(text);
    } catch (error) {
      console.error(`migration ${name} failed: ${error.message}`);
      process.exit(1);
    }
  }

  await sql.unsafe(GRANTS);
  console.log(`applied ${files.length} migrations to the test database`);
} finally {
  await sql.end();
}
