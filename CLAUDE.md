# CLAUDE.md

Claude Code dev guide for ChittyFinance. For everything else, defer to the pentad:

- **[CHITTY.md](CHITTY.md)** — architecture, stack, ecosystem position
- **[CHARTER.md](CHARTER.md)** — scope, responsibilities, contracts
- **[AGENTS.md](AGENTS.md)** — AI agents, MCP capabilities, trust levels
- **[SECURITY.md](SECURITY.md)** — vuln reporting, supported versions

This file is dev-loop only. Don't duplicate the above.

## Commands

```bash
npm run dev              # Auto-detect mode (defaults standalone, port 5000)
npm run dev:system       # MODE=system, multi-tenant Neon
npm run check            # Typecheck
npm run build            # System-mode build (default for prod)
npm run deploy           # wrangler deploy (uses deploy/system-wrangler.jsonc)
npm run db:push:system   # Push schema to Neon
npm run db:push:standalone  # Push schema to SQLite
npm run db:seed          # Seed IT CAN BE LLC entities (system only)
```

Legacy Express dev binds port 5001 with `reusePort: true`. Secrets via `op run`.

## Where Things Live

```
client/src/      React UI (Vite root)
server/
  app.ts         Hono factory
  worker.ts      CF Workers entry (prod)
  index.ts       Legacy Express entry (standalone dev — kept for reference)
  routes/        22 resource-per-file modules. OpenAPI at /api/v1/documentation
  middleware/    auth (hybridAuth), tenant, error
  storage/       SystemStorage — single source of DB access
  db/            Neon HTTP connection
  lib/           wave-api, stripe, valuation/, openai, oauth-state-edge
database/        system.schema.ts (UUID/decimal) + standalone.schema.ts
shared/          Legacy integer-ID schema (forensic tables only)
```

## Dual-Mode

`MODE` env var switches the entire data layer:

| Mode | DB | Schema | Tenancy |
|------|-----|--------|---------|
| `standalone` (default) | SQLite | `database/standalone.schema.ts` | Single user |
| `system` | Neon Postgres | `database/system.schema.ts` | Full multi-tenant |

`server/db.ts` auto-switches the Drizzle client. Never cross schemas.

## Path Aliases

```
@/*       → client/src/*
@shared/* → shared/*
@assets/* → attached_assets/*    (vite only)
```

## Conventions

- **All DB access through `server/storage/system.ts`.** No raw Drizzle in routes.
- **Tenant scoping**: read `c.var.tenantId` from middleware, never trust path params.
- **Input validation**: Zod schemas from `@shared/schema` or `database/*.schema.ts`.
- **Frontend state**: TanStack Query. UI: shadcn/ui (`@/components/ui/*`). Routing: Wouter.
- **No mocks, fake data, or placeholder endpoints in commits** (global rule). Every route hits a real datastore the day it lands.
- **COA classification** writes audit rows. Trust levels L0-L4 enforced — see AGENTS.md.

## Schema Changes

1. Edit `database/system.schema.ts` (system) or `database/standalone.schema.ts` (standalone)
2. `npm run db:push:{mode}` — Drizzle types auto-generate
3. No migrations: `drizzle-kit push` is destructive. Coordinate cutovers.

## Gotchas

- **Legacy Express code** (`server/index.ts`, `server/routes.ts`, `server/storage.ts`, `server/db.ts`, `shared/schema.ts`) is dev-only. Production is Hono on Workers.
- **Forensic tables** live in `shared/schema.ts` (integer IDs) — may not be in production Neon yet.
- **CF Workers Builds** (issue #111) is permanently red — auto-merge ignores it; real CI elsewhere.
- **Port 5000/5001** hardcoded.
- **DoorLoop is removed** (PR #78). Don't reintroduce.

## Required Env (system mode)

`DATABASE_URL`, `MODE=system`, `PUBLIC_APP_BASE_URL`, `OAUTH_STATE_SECRET`, `OPENAI_API_KEY`, `WAVE_CLIENT_ID/SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CHITTYCONNECT_API_BASE/TOKEN`. Valuation providers optional: `ZILLOW_/REDFIN_/HOUSECANARY_/ATTOM_API_KEY` (Cook County Socrata always available).

`GET /api/integrations/status` reports which are configured.

## Phase Status (2026-05)

Phases 1-6 complete. Remaining: ChittyCert + ChittyConnect MCP wiring (Phase 5), furnished-condos.com (Phase 7).
