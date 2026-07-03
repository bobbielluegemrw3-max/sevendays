import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Client bundle inspection (IMPLEMENTATION_PLAN Phase 13 / 01_CONSTITUTION):
 * the Service Role Key and financial/settlement logic must never reach the
 * browser. This scans every client-delivered chunk for markers that only
 * exist in server-side code. Runs as part of `pnpm build`.
 */

const FORBIDDEN_MARKERS = [
  // secrets / server env
  'SERVICE_ROLE',
  'service_role',
  'SUPABASE_JWT_SECRET',
  'DATABASE_URL',
  // ledger / settlement internals (distinctive, greppable markers)
  'NEGATIVE_BALANCE_FORBIDDEN',
  'PLATFORM_WITHDRAWAL_CLEARING',
  'PLATFORM_SETTLEMENT_CLEARING',
  'buildProductionHandlers',
  'wdrefund:',
  // key material handling
  'deriveDepositPrivateKey',
  'fromMasterSeed',
];

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticDir = join(webRoot, '.next', 'static');

if (!existsSync(staticDir)) {
  console.error('check-client-bundle: .next/static not found — run next build first');
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith('.js')) yield full;
  }
}

const violations = [];
let scanned = 0;
for (const file of walk(staticDir)) {
  scanned += 1;
  const content = readFileSync(file, 'utf8');
  for (const marker of FORBIDDEN_MARKERS) {
    if (content.includes(marker)) {
      violations.push({ file: file.slice(webRoot.length + 1), marker });
    }
  }
}

if (violations.length > 0) {
  console.error('Client bundle check FAILED — server-only material reached the browser bundle:');
  for (const v of violations) console.error(`  ${v.marker}  in  ${v.file}`);
  process.exit(1);
}
console.log(`Client bundle check passed: ${scanned} chunks clean.`);
