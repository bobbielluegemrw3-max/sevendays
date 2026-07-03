import { Pool, type PoolClient } from 'pg';
import type { QueryResult, SqlClient } from '@sevendays/shared';

/**
 * Production Postgres access for Cloud Run workers (06_DATABASE.md: this
 * package owns the DB client). The SqlClient contract requires a SINGLE
 * connection (plain begin/commit transaction control), so callers get a
 * dedicated connection per unit of work, never the pool itself.
 */

export function createPool(connectionString: string, max = 5): Pool {
  return new Pool({ connectionString, max });
}

export async function withPoolClient<T>(
  pool: Pool,
  fn: (client: SqlClient) => Promise<T>,
): Promise<T> {
  const connection: PoolClient = await pool.connect();
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
    // Never return a possibly mid-transaction connection to the pool.
    try {
      await connection.query('rollback');
    } catch {
      poisoned = true;
    }
    throw error;
  } finally {
    if (poisoned) connection.release(new Error('connection possibly mid-transaction'));
    else connection.release();
  }
}
