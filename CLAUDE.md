# CLAUDE.md

Claude Code dev guide for ChittyFinance. For everything else, defer to the pentad:

- **[CHITTY.md](CHITTY.md)** — architecture, stack, ecosystem position
- **[CHARTER.md](CHARTER.md)** — scope, responsibilities, contracts
- **[AGENTS.md](AGENTS.md)** — AI agents, MCP capabilities, trust levels
- **[SECURITY.md](SECURITY.md)** — vuln reporting, supported versions

This file is dev-loop only. Don't duplicate the above.

## Commands

```bash
npm run dev          # Development server
npm run build        # Build client + server bundle
npm run start        # Run the production bundle
npm run check        # Typecheck
npm run db:push      # Apply Drizzle schema changes
npm run db:seed:coa  # Seed the chart of accounts
npm run test         # Vitest watch mode
npm run test:ui      # Vitest UI
npm run test:run     # Vitest single run
```

Secrets are brokered by ChittySecrets (`secrets.chitty.cc`) into Cloudflare Worker bindings; 1Password/`op` is retired and non-functional.

## Where Things Live

```
client/src/      React UI (Vite root)
server/
  app.ts         Hono factory
  worker.ts      CF Workers entry (prod)
  routes/        22 resource-per-file modules. Resource routes are mounted at /api/<resource> (no /v1 prefix). Only operational/meta routes (status, metrics, documentation) live under /api/v1/. OpenAPI spec at /api/v1/documentation is partial (covers a subset — see `server/routes/docs.ts`); treat `server/app.ts` route mounts as the source of truth until the spec is completed.
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

`server/db/connection.ts` builds the Drizzle client (Neon HTTP). Never cross schemas.

Note: `server/db.ts` no longer exists, and the Hono app does **not** switch on `MODE` — `storageMiddleware` in `server/app.ts` always constructs `SystemStorage`. `server/storage/standalone.ts` and `database/standalone.schema.ts` are still in the tree but nothing in the request path reaches them, so treat the table above as describing the schemas, not a live runtime switch.

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
2. Run `npm run db:push` only against the intended target database.
3. `drizzle-kit push` can be destructive. Production changes require an operator gate, a pre-write snapshot, and a rollback plan; do not seed production without explicit operator approval.

## Gotchas

- **The legacy Express server is gone.** `server/index.ts`, `server/routes.ts`, `server/storage.ts` and `server/db.ts` were removed in #81; production and dev are both Hono. `express` survives only as a type-only import in `server/lib/error-handling.ts` and is a removal candidate. `shared/schema.ts` does still exist and still holds the forensic tables.
- **Forensic tables** live in `shared/schema.ts` (integer IDs) — may not be in production Neon yet.
- **CF Workers Builds** (issue #111) is permanently red — auto-merge ignores it; real CI elsewhere.
- **Port 5000/5001** hardcoded.
- **DoorLoop is removed** (PR #78). Don't reintroduce.
- **`package.json` is authoritative for npm scripts.** Retired mode/deploy aliases such as `dev:system`, `db:push:{mode}`, and `deploy` must not be reconstructed from old documentation.

## Books method lives in ChittyMarket

How books work is *conducted* — chart-of-accounts derivation, classification, reconciliation, and production financial writes — is governed by `finance-operating-defaults` in the `chittyos-finance` ChittyMarket plugin introduced by `chittyos/chittymarket#162`, not by anything in this repo. Load it before a chart change, a classification change, or any write to the books datastore. It hands off to `legal-operating-defaults` the moment a figure is filed or asserted in a matter.

The retired repo-local commands (`check-system`, `db-reset`, `quick-deploy`, `fix-deploy`) are not valid entry points. The TurboTenant/tenant commands remain repo-local because they carry entity facts and are not portable.

## Required Env (system mode)

`DATABASE_URL`, `MODE=system`, `PUBLIC_APP_BASE_URL`, `OAUTH_STATE_SECRET`, `OPENAI_API_KEY`, `WAVE_CLIENT_ID/SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CHITTYCONNECT_API_BASE/TOKEN`. Valuation providers optional: `ZILLOW_/REDFIN_/HOUSECANARY_/ATTOM_API_KEY` (Cook County Socrata always available).

`GET /api/integrations/status` reports which are configured.

## Phase Status (2026-05)

Phases 1-6 complete. Remaining: ChittyCert + ChittyConnect MCP wiring (Phase 5), furnished-condos.com (Phase 7).
