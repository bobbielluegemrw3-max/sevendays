import { join } from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Domain packages are ESM with dist/ builds; nothing special is required.
  // Financial/batch logic never runs here beyond what the API contracts
  // registry exposes (08_INFRASTRUCTURE.md execution boundary).
  turbopack: {
    // Stray lockfiles above the repo confuse workspace-root inference.
    root: join(__dirname, '..', '..'),
  },
};

export default nextConfig;
