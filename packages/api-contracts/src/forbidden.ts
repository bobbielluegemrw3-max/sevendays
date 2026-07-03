/**
 * Forbidden APIs (07_API.md) — these MUST NOT exist anywhere.
 * The registry rejects any registration matching these patterns, and
 * scripts/check-forbidden-apis.mjs greps the whole repository in CI.
 * This file is the single canonical definition (the CI check excludes it).
 */
export const FORBIDDEN_API_PATHS: readonly string[] = [
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
