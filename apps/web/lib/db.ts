import { Pool, type PoolClient } from 'pg';
import type { QueryResult, SqlClient } from '@sevendays/shared';

/**
 * Server-side Postgres access (Supabase session pooler). The SqlClient
 * contract requires a SINGLE connection (transaction control uses plain
 * begin/commit), so every request checks a dedicated connection out of the
 * pool and releases it afterwards — the pool itself is never handed out.
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not configured');
    // Dashboard-style pages fan out several dispatches per render, each on
    // its own dedicated connection.
    // スパイク対策(2026-07-12): インスタンスのプラン/台数に合わせて環境変数で調整
    // (Supabaseプーラー側の上限と合わせること)。既定10。
    pool = new Pool({
      connectionString,
      max: Number(process.env.WEB_DB_POOL_MAX ?? 10),
      // 体感速度(2026-07-16 §D): pgの既定idleTimeout=10秒だと閑散時に接続が
      // 毎回破棄され、次の表示がTCP+TLS+認証(DBがムンバイ=数往復)を払う。
      // 5分保持+keepaliveでウォーム接続を維持(プーラー側上限に対しては
      // max=WEB_DB_POOL_MAX が上限なので変わらない)。
      idleTimeoutMillis: Number(process.env.WEB_DB_POOL_IDLE_MS ?? 300000),
      keepAlive: true,
    });
  }
  return pool;
}

export async function withSqlClient<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
  const connection: PoolClient = await getPool().connect();
  let poisoned = false;
  try {
    const client: SqlClient = {
      async query<R>(sql: string, params?: unknown[]): Promise<QueryResult<R>> {
        const result = await connection.query(sql, params);
        return { rows: result.rows as R[], affectedRows: result.rowCount ?? 0 };
      },
    };
    return await fn(client);
  } catch (error) {
    // A handler may have died mid-transaction. NEVER return a connection
    // in that state to the pool — the next request would join an aborted
    // transaction and every query would fail.
    try {
      await connection.query('rollback');
    } catch {
      poisoned = true; // rollback itself failed: destroy, don't reuse
    }
    throw error;
  } finally {
    if (poisoned) connection.release(new Error('connection possibly mid-transaction'));
    else connection.release();
  }
}
