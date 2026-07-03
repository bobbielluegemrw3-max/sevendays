import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Spec-required static check (Phase 12): wallet private keys and the HD
 * master seed must never reach logs. This package therefore contains no
 * logging at all — no console.*, no process.stdout/stderr writes — so
 * nothing can ever interpolate key material into a log line.
 */
describe('key non-exposure', () => {
  it('src/ contains no logging statements', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
    for (const file of readdirSync(srcDir)) {
      const content = readFileSync(join(srcDir, file), 'utf8');
      expect(content, `${file} must not log`).not.toMatch(/console\.|process\.stdout|process\.stderr/);
    }
  });
});
