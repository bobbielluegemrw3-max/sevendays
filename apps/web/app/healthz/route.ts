/** Render health check — no auth, no DB, no business surface (not part of 07_API). */
export function GET(): Response {
  return Response.json({ ok: true });
}
