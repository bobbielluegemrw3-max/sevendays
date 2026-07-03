#!/usr/bin/env node
/**
 * Forbidden API check (07_API.md / Completion Gate G8).
 * Scans every source file for forbidden endpoint paths. The canonical
 * definition (packages/api-contracts/src/forbidden.ts) and this script are
 * the only files allowed to contain the literals.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';

const FORBIDDEN = [
  '/race/change',
  '/burn/cancel',
  '/ledger/update',
  '/buyback/change',
  '/revenge-buff/use',
  '/ownership/change',
  '/market/force-sell',
  '/admin/race/recalculate',
  '/admin/seed/change',
];

const ROOTS = ['packages', 'services', 'apps'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.next']);
const ALLOWED_FILES = new Set([
  ['packages', 'api-contracts', 'src', 'forbidden.ts'].join(sep),
]);

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|sql)$/.test(entry)) continue;
    if ([...ALLOWED_FILES].some((allowed) => full.endsWith(allowed))) continue;
    const content = readFileSync(full, 'utf8');
    for (const forbidden of FORBIDDEN) {
      if (content.includes(forbidden)) {
        violations.push(`${full}: contains forbidden API path "${forbidden}"`);
      }
    }
  }
}

for (const root of ROOTS) {
  try {
    walk(root);
  } catch {
    // root may not exist yet
  }
}

if (violations.length > 0) {
  console.error('FORBIDDEN API CHECK FAILED:');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log('Forbidden API check passed: no forbidden endpoints exist.');
