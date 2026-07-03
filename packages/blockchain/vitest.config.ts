import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60_000,
    // PGlite init (WASM + 30 migrations) can exceed the 10s default when
    // the whole workspace runs in parallel.
    hookTimeout: 60_000,
  },
});
