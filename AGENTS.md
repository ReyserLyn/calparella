# CalParella — Agent Guide

## Stack

**Runtime:** Astro 6 + Cloudflare Workers (NOT Pages) + workerd
**Auth:** Better Auth (`better-auth/minimal`) + Drizzle adapter
**DB:** Cloudflare D1 + Drizzle ORM + `drizzle-kit`
**Storage:** R2 (bucket `calparella`), KV (namespace `SESSION`)
**Styles:** Tailwind v4 (`@theme inline`, OKLCH, dark/light)
**Package manager:** `bun`
**No React** — vanilla Astro + TypeScript

## Key commands

```bash
bun run dev        # wrangler types && astro dev
bun run build      # wrangler types && astro check && astro build
bun run deploy     # wrangler types && astro build && wrangler deploy
bun run validate   # lint && check && format — run before committing
bun run db:generate     # drizzle-kit generate
bun run db:migrate:local  # apply migrations to local D1
bun run db:migrate:prod   # apply migrations to production D1
```

All commands that touch Cloudflare run `wrangler types` first to regenerate `worker-configuration.d.ts`.

## Astro v6 + Cloudflare adapter quirks

- **NO** `Astro.locals.runtime` — removed in v13 adapter.
- Use `import { env } from 'cloudflare:workers'` for bindings (D1, KV, R2).
- Use `Astro.locals.cfContext` for `ExecutionContext` (`waitUntil`).
- Use `Astro.request.cf` for geolocation data.
- Dev server runs through **workerd** (not Node.js) → no request logs in terminal.
- Vite optimizer cache (`node_modules/.vite`) may corrupt after lockfile changes; delete and restart.

## Auth architecture

- `auth.ts` exports both `createAuth(env?, ctx?, baseURL?)` (runtime) and `export const auth = createAuth()` (CLI schema generation).
- **One auth instance per request**: middleware creates it, stores in `locals.auth`, API route reuses it. This avoids D1 WAL lock contention.
- KV `SESSION` namespace used for secondary storage + rate limiting. KV TTL clamped to 60s minimum.
- `cookieCache` enabled (15 min), `updateAge` (15 min), `backgroundTasks` via `ctx.waitUntil`.
- Client: `auth-client.ts` uses vanilla `createAuthClient()` (no React).

## DB + migrations

- Schema: `src/db/schema.ts` — Better Auth tables (users, sessions, accounts, verifications) in plural (`usePlural: true`).
- Migrations dir: `./src/db/migrations` (must match both `drizzle.config.ts` and `wrangler.jsonc`).
- `drizzle-kit push` uses `d1-http` driver → needs Cloudflare API credentials in `.env`.
- `wrangler d1 migrations apply` is the prod-safe path.

## Secrets & env

| File                    | Purpose                                        | Git       |
| ----------------------- | ---------------------------------------------- | --------- |
| `.env`                  | drizzle-kit credentials (Cloudflare API token) | ignored   |
| `.dev.vars`             | local dev secrets (`BETTER_AUTH_SECRET`)       | ignored   |
| `wrangler.jsonc` `vars` | non-sensitive vars (`BETTER_AUTH_URL`)         | committed |
| `wrangler secret put`   | production secrets (`BETTER_AUTH_SECRET`)      | CLI only  |

**Gotcha:** `BETTER_AUTH_SECRET` is a wrangler secret, NOT in wrangler.jsonc vars. Do NOT reference `env.BETTER_AUTH_SECRET` in code (it won't be in generated types in CI). Better Auth reads it from `process.env` automatically.

## Conventions

- **Formatting**: Prettier — no semicolons, single quotes, trailing commas, 100 width.
- **Tailwind v4**: Uses `@theme inline` + `@layer utilities` for custom fonts. OKLCH color space.
- **Path alias**: `@/` → `src/` in `tsconfig.json`.
- **Fonts**: Local `.woff2` in `src/assets/fonts/`, configured via Astro `fonts` config (no Google Fonts).
- **Git**: Two branches — production + dev.

## Paths / structure

```
src/
├── components/ui/    # Astro UI components (Button.astro with CVA)
├── db/               # schema.ts, db client
├── layouts/          # Layout.astro (fonts, meta, ClientRouter)
├── lib/              # auth.ts, auth-client.ts, utils.ts
├── pages/            # pages + api/auth/[...all].ts
├── sections/         # header.astro
├── styles/           # globals.css (Tailwind v4 + themes)
├── assets/fonts/     # local .woff2 files
├── env.d.ts          # App.Locals types
└── middleware.ts      # auth middleware (creates auth, sets locals)
```
