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
    // ★既定5(2026-07-18 実障害): セッションプーラー上限は pool_size=15。
    // 旧既定10だとデプロイの新旧インスタンス重複で web(10)+web(10)+worker(5)=25 と
    // なり EMAXCONNSESSION → ログイン済みSSRが数分500になる事故が頻発した。
    // web(5)+旧web(5)+worker(5)=15 で重複中もちょうど収まる。
    pool = new Pool({
      connectionString,
      max: Number(process.env.WEB_DB_POOL_MAX ?? 5),
      // 体感速度(2026-07-16 §D): pgの既定idleTimeout=10秒だと閑散時に接続が
      // 毎回破棄され、次の表示がTCP+TLS+認証(DBがムンバイ=数往復)を払う。
      // 60秒でも「閲覧中のユーザーの次のページ」はウォームなまま。
      idleTimeoutMillis: Number(process.env.WEB_DB_POOL_IDLE_MS ?? 60000),
      // 確保待ちを無限にしない(プーラー枯渇時はエラー→下のリトライが拾う)
      connectionTimeoutMillis: Number(process.env.WEB_DB_CONNECT_TIMEOUT_MS ?? 8000),
      keepAlive: true,
    });
  }
  return pool;
}

/** プーラー枯渇(EMAXCONNSESSION)や確保タイムアウトは短いバックオフで最大3回
 *  再試行する — デプロイの新旧重複など数秒〜数十秒のスパイクを500にしない。 */
async function acquireConnection(): Promise<PoolClient> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await getPool().connect();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!/max clients|EMAXCONN|timeout/i.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export async function withSqlClient<T>(fn: (client: SqlClient) => Promise<T>): Promise<T> {
  const connection: PoolClient = await acquireConnection();
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
