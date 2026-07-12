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
  experimental: {
    // 遷移速度(2026-07-12): 動的ページもクライアントのルーターキャッシュを30秒
    // 再利用 — 「戻る」や直近訪問ページへの再遷移がサーバー往復なしで即描画。
    // 30秒までの表示の古さは許容(ショーの実況はクライアント側ポーリングで別系統)。
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
