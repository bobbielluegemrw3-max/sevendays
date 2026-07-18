/** Render health check — no auth, no DB, no business surface (not part of 07_API). */
export function GET(): Response {
  // build: どのコミットが本番で動いているかを外部から確認できるように
  // (2026-07-19: デプロイ完了の判定が推測になっていた問題の恒久解決)。
  return Response.json({ ok: true, build: process.env.RENDER_GIT_COMMIT ?? 'unknown' });
}
