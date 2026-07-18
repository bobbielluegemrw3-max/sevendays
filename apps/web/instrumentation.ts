/**
 * Next.js instrumentation hook (2026-07-19 障害対応).
 * サーバー側で起きた「全ての」リクエストエラー(レイアウト/ページ/ストリーミング/
 * Server Action)を digest つきで捕捉し、system_settings('debug:request_error') に
 * 記録する — Renderログに手が届かない環境での遠隔診断用。
 * 診断が済んだら撤去してよい(残しても害はない: 書くのはエラー時のみ)。
 */

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const e = err as { message?: string; stack?: string; digest?: string };
    const record = {
      at: new Date().toISOString(),
      digest: e?.digest ?? null,
      message: e?.message ?? String(err),
      stack: (e?.stack ?? '').slice(0, 3000),
      path: request.path,
      method: request.method,
      route: `${context.routerKind}:${context.routePath}:${context.routeType}`,
    };
    console.error('[onRequestError]', JSON.stringify(record));
    const { withSqlClient } = await import('./lib/db');
    await withSqlClient((client) =>
      client.query(
        `insert into system_settings (key, value, updated_at)
         values ('debug:request_error', $1::jsonb, now())
         on conflict (key) do update set value = $1::jsonb, updated_at = now()`,
        [JSON.stringify(record)],
      ),
    );
  } catch {
    /* 診断自身は絶対に二次障害を起こさない */
  }
}
