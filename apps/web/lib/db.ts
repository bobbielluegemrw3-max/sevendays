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
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export async function withSqlClient<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
  const connection: PoolClient = await getPool().connect();
  try {
    const client: SqlClient = {
      async query<R>(sql: string, params?: unknown[]): Promise<QueryResult<R>> {
        const result = await connection.query(sql, params as unknown[] | undefined);
        return { rows: result.rows as R[], affectedRows: result.rowCount ?? 0 };
      },
    };
    return await fn(client);
  } finally {
    connection.release();
  }
}
