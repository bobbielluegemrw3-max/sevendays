import { buildApiRegistry, createWorkerServer } from '@sevendays/api-contracts';
import { createPool, withPoolClient } from '@sevendays/database';

/**
 * MLM reward payments (targeted re-invocation).
 * Thin Cloud Run wrapper (08_INFRASTRUCTURE.md): mounts the shared registry
 * and serves ONLY its own internal paths. Protected by Cloud Run IAM +
 * internal ingress at the platform level and the x-internal-token header
 * in-process.
 */

const port = Number(process.env.PORT ?? 8080);
const databaseUrl = process.env.DATABASE_URL;
const internalToken = process.env.INTERNAL_TOKEN;
if (!databaseUrl) throw new Error('DATABASE_URL is not configured');
if (!internalToken) throw new Error('INTERNAL_TOKEN is not configured');

const pool = createPool(databaseUrl);
const server = createWorkerServer({
  workerName: 'mlm-worker',
  registry: buildApiRegistry(),
  withClient: (fn) => withPoolClient(pool, fn),
  internalToken,
  allowPaths: ['/internal/mlm/pay'],
});
server.listen(port, () => {
  console.log(`mlm-worker listening on ${port}`);
});
