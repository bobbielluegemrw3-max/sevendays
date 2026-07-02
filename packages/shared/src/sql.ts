/**
 * Minimal SQL client interface shared by every package that talks to the
 * database. PGlite (tests) and the Cloud Run Postgres connection both
 * satisfy this shape. Transaction control is issued via plain
 * `begin`/`commit`/`rollback`, so a client MUST be a single connection,
 * never a pool.
 */
export interface QueryResult<T> {
  rows: T[];
  affectedRows?: number;
}

export interface SqlClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
