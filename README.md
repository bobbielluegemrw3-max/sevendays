# Seven Days Derby

Seven Days Derby v1.0 specification package and implementation monorepo.

- The authoritative implementation documents are in `docs/`.
- The implementation master plan is `IMPLEMENTATION_PLAN.md`.
- Raw source materials are preserved in `references/raw/`.

## Repository layout

```text
apps/       user & admin frontends (Next.js / Vercel)
services/   Cloud Run workers (batch, race, burn, assignment, buyback, mlm, ...)
packages/   shared libraries (shared, domain, database, ledger, race-engine, ...)
infra/      supabase / cloudrun / pubsub / vercel / monitoring
docs/       v1.0 specification (authoritative — do not edit without owner decision)
```

## Development

Requirements: Node >= 22, pnpm 10.

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

Environment: copy `.env.example` to `.env.local` and fill in values.
`SUPABASE_SERVICE_ROLE_KEY` is server-side only — never expose it to the browser.

Supabase project lives under `infra/supabase` (`pnpm exec supabase --workdir infra <cmd>`).
Local Supabase (`supabase start`) requires Docker Desktop.
