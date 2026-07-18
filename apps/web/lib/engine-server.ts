import { withSqlClient } from '@/lib/db';

/* サーバー専用: アクティブなレースエンジンがv2か(60秒プロセスキャッシュ)。
 * V2実装-7b: root layoutがこれを毎リクエスト参照してLV表記へ切り替える。 */
let cache: { value: boolean; at: number } | null = null;

export async function isEngineV2Active(): Promise<boolean> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  const value = await withSqlClient(async (client) => {
    const r = await client.query<{ version: string }>(
      `select version from race_engine_versions
       where activated_at is not null and deactivated_at is null`,
    );
    return r.rows.length === 1 && r.rows[0]!.version.startsWith('race_engine_v2');
  });
  cache = { value, at: Date.now() };
  return value;
}
