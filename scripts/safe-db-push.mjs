#!/usr/bin/env node
// 本番マイグレーション適用の安全ラッパー(2026-07-20 事故の再発防止)。
//
// 事故: 手動適用済みで supabase_migrations.schema_migrations に未記録だった
// リセット系マイグレーションを `supabase db push` が「未適用」とみなして再実行し、
// 試運転データが全消失した。
//
// このスクリプトは「これから適用されるもの」を実行前に確定させる:
//   1. リモートの schema_migrations とローカルの migrations/ を突合して pending を算出
//   2. pending が引数で明示されたバージョン集合と完全一致する場合のみ db push を実行
//   3. 予期しない pending(=記録漏れの可能性)があれば何もせず中断し、
//      `supabase migration repair --status applied <version>` を案内する
//
// 使い方:
//   node scripts/safe-db-push.mjs 20260720010000            # このバージョンだけ適用
//   node scripts/safe-db-push.mjs 20260720010000 20260720020000
//   node scripts/safe-db-push.mjs --list                    # pending の確認のみ
//
// 必要な環境: .env.local の SUPABASE_ACCESS_TOKEN / SUPABASE_DB_PASSWORD と
// apps/web/.env.local の DATABASE_URL(突合の読み取りに使用)。

import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'infra', 'supabase', 'migrations');

function envFrom(file, key) {
  const m = readFileSync(file, 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

const databaseUrl = envFrom(join(root, 'apps', 'web', '.env.local'), 'DATABASE_URL');
if (!databaseUrl) {
  console.error('ABORT: apps/web/.env.local に DATABASE_URL がありません');
  process.exit(1);
}

const local = readdirSync(migrationsDir)
  .filter((f) => /^\d{14}_.+\.sql$/.test(f))
  .map((f) => ({ version: f.slice(0, 14), file: f }))
  .sort((a, b) => a.version.localeCompare(b.version));

const { Client } = await import('pg');
const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const applied = new Set(
  (await client.query('select version from supabase_migrations.schema_migrations')).rows.map(
    (r) => r.version,
  ),
);
await client.end();

const pending = local.filter((m) => !applied.has(m.version));

if (process.argv.includes('--list')) {
  console.log(pending.length === 0 ? 'pending なし' : 'pending:');
  for (const p of pending) console.log(`  ${p.file}`);
  process.exit(0);
}

const expected = process.argv.slice(2).filter((a) => /^\d{14}$/.test(a));
if (expected.length === 0) {
  console.error('ABORT: 適用したいバージョン(14桁)を引数で明示してください。確認のみは --list');
  process.exit(1);
}

const pendingSet = new Set(pending.map((p) => p.version));
const expectedSet = new Set(expected);
const unexpected = pending.filter((p) => !expectedSet.has(p.version));
const missing = expected.filter((v) => !pendingSet.has(v));

if (missing.length > 0) {
  console.error(`ABORT: 指定バージョンは pending にありません(適用済み?): ${missing.join(', ')}`);
  process.exit(1);
}
if (unexpected.length > 0) {
  console.error('ABORT: 意図しない pending があります(手動適用の記録漏れの可能性):');
  for (const u of unexpected) console.error(`  ${u.file}`);
  console.error('適用済みなら次で記録してから再実行:');
  for (const u of unexpected)
    console.error(`  pnpm exec supabase --workdir infra migration repair --status applied ${u.version}`);
  process.exit(1);
}

console.log(`pending と指定が一致 — 適用します: ${expected.join(', ')}`);
const env = {
  ...process.env,
  SUPABASE_ACCESS_TOKEN: envFrom(join(root, '.env.local'), 'SUPABASE_ACCESS_TOKEN') ?? '',
  SUPABASE_DB_PASSWORD: envFrom(join(root, '.env.local'), 'SUPABASE_DB_PASSWORD') ?? '',
};
const r = spawnSync('pnpm', ['exec', 'supabase', '--workdir', 'infra', 'db', 'push', '--yes'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: true,
});
process.exit(r.status ?? 1);
