# ChittyFinance Hono Migration & Integration Design

**Date:** 2026-02-23
**Status:** Approved
**Approach:** Big-Bang Hono First — port all Express routes to Hono on Cloudflare Workers before adding new features

## Context

ChittyFinance (`finance.chitty.cc`) is deployed and returns `{"status":"ok"}` at `/health`, but the system-mode storage layer is 100% stubs — every method returns `undefined` or `[]`. The service is non-functional beyond health checks. ChittyCommand (`command.chitty.cc`) has a `financeClient()` that calls ChittyFinance endpoints which return nothing.

### Goals (All Four)

1. **Make aggregation API work** — finance.chitty.cc serves `/api/accounts`, `/api/transactions`, `/api/summary` for ChittyCommand
2. **Full Express→Hono Workers migration** — port all 60+ Express routes to Hono on Cloudflare Workers
3. **Mercury live data** — direct Mercury client in ChittyCommand (per approved design `2026-02-23-mercury-live-data-design.md`)
4. **ChittyLedger-Finance integration** — document reconciliation pipeline (future phase, architecture prepared)

### Current State

| Component | Status |
|-----------|--------|
| `server/worker.ts` | Thin shell: /health, /api/v1/status, /api/v1/metrics, proxy to API_ORIGIN |
| `server/routes.ts` | 60+ Express endpoints, 2042 lines, fully implemented |
| `server/storage/system.ts` | ALL STUBS — every method returns undefined/empty |
| `server/storage/standalone.ts` | Functional SQLite storage for local dev |
| `server/db.ts` | pg Pool connection (Express-era) |
| `server/bootstrap.ts` | Neon HTTP driver connection (conflicts with db.ts) |
| `database/system.schema.ts` | Drizzle schema with full multi-tenant tables |
| `deploy/finance-wrangler.toml` | Minimal shell, currently deployed |
| `deploy/system-wrangler.toml` | Template with placeholder KV/R2 IDs |

## Agent Review Findings

### Canon Cardinal Audit

- **Tier conflict:** CHARTER.md says Tier 3 (Service Layer), CHITTY.md says Tier 4 (Domain). Resolution: **Tier 3** per CHARTER.md (canonical source)
- **Domain correct:** `finance.chitty.cc` matches charter
- **Org discrepancy:** Repo is under `chittyapps/` but CHARTER.md says `CHITTYOS`. Non-blocking — GitHub org is organizational, canonical URI is what matters
- **Canonical URI:** `chittycanon://core/services/chittyfinance` — valid

### Schema Overlord Analysis

- **SystemStorage ALL STUBS** — root cause of non-functionality
- **ChittyOS-Core Neon has partial data:** 52 accounts, 269 transactions (from prior Plaid/manual sync)
- **ChittyCommand Neon DB** in us-west-2 project, separate from main org — needs location confirmation
- **Missing columns in existing schema:** `cc_accounts` lacks some fields the Mercury sync will need
- **Two conflicting DB files:** `server/db.ts` (pg Pool) vs `server/bootstrap.ts` (Neon HTTP) — consolidate to one

### ChittyConnect Concierge Review

- **Zero auth on ChittyCommand→ChittyFinance** — security gap, needs service token auth
- **3 inconsistent env var names** for the same service token:
  - `CHITTYCONNECT_API_TOKEN` (integrations.ts)
  - `CHITTY_CONNECT_SERVICE_TOKEN` (auth middleware)
  - `CHITTY_AUTH_SERVICE_TOKEN` (worker.ts)
  - Resolution: standardize on `CHITTY_AUTH_SERVICE_TOKEN` (matches ChittyOS convention)
- **Edge JWT:** Use `jose` library (works in Workers runtime, unlike `jsonwebtoken`)
- **10+ secrets** needed — all should flow through 1Password via ChittyConnect
- **Mercury needs static egress IP** — must proxy through ChittyConnect, not call Mercury API directly from Workers

### Code Architect Blueprint

- 8-phase implementation plan identified
- ~30 files to create/modify
- Key architectural decisions: Hono middleware chain, Drizzle on Workers via Hyperdrive or `@neondatabase/serverless`

## Architecture

### Target Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers |
| Framework | Hono |
| Database | Neon PostgreSQL via `@neondatabase/serverless` (HTTP driver) |
| ORM | Drizzle |
| Auth | `jose` for JWT/JWKS verification |
| KV | Cloudflare KV for token cache, config flags |
| R2 | Cloudflare R2 for document storage |
| DO | Durable Objects for ChittyAgent (existing) |
| Cron | Cloudflare Cron Triggers |

### Env Type

```typescript
interface Env {
  // Database
  DATABASE_URL: string;
  // or Hyperdrive binding:
  // DB: Hyperdrive;

  // Auth
  CHITTY_AUTH_SERVICE_TOKEN: string;
  CHITTY_AUTH_JWKS_URL?: string;

  // Service URLs
  CHITTYCONNECT_API_BASE: string;

  // Integration secrets (via KV or env)
  OPENAI_API_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  WAVE_CLIENT_ID: string;
  WAVE_CLIENT_SECRET: string;
  OAUTH_STATE_SECRET: string;
  GITHUB_TOKEN?: string;
  MERCURY_WEBHOOK_SECRET?: string;

  // App config
  MODE: string;
  NODE_ENV: string;
  APP_VERSION: string;
  PUBLIC_APP_BASE_URL: string;

  // Bindings
  FINANCE_KV: KVNamespace;
  FINANCE_R2: R2Bucket;
  ASSETS: Fetcher;
  CF_AGENT: DurableObjectNamespace;
}
```

### Hono App Structure

```
server/
├── app.ts                    # Hono app factory, middleware chain
├── worker.ts                 # Cloudflare Workers fetch handler (thin)
├── env.ts                    # Env type definition
├── middleware/
│   ├── auth.ts               # Service token + JWT verification (jose)
│   ├── tenant.ts             # Tenant resolution from headers/query
│   └── error.ts              # Global error handler
├── routes/
│   ├── index.ts              # Route barrel, mounts all groups
│   ├── health.ts             # /health, /api/v1/status, /api/v1/metrics
│   ├── session.ts            # /api/session
│   ├── accounts.ts           # /api/accounts, /api/accounts/:id
│   ├── transactions.ts       # /api/transactions
│   ├── summary.ts            # /api/summary, /api/financial-summary
│   ├── integrations.ts       # /api/integrations/*
│   ├── mercury.ts            # /api/mercury/* (via ChittyConnect proxy)
│   ├── wave.ts               # /api/integrations/wave/*
│   ├── stripe.ts             # /api/integrations/stripe/*
│   ├── tasks.ts              # /api/tasks
│   ├── ai.ts                 # /api/ai/*
│   ├── recurring-charges.ts  # /api/recurring-charges/*
│   ├── properties.ts         # /api/properties, /api/tenants/*/properties
│   ├── tenants.ts            # /api/tenants/*
│   ├── github.ts             # /api/github/*
│   └── webhooks.ts           # /webhooks/mercury, /webhooks/stripe
├── storage/
│   ├── index.ts              # Storage factory (mode-aware)
│   ├── system.ts             # PostgreSQL storage (IMPLEMENT — currently stubs)
│   └── standalone.ts         # SQLite storage (keep for local dev)
├── lib/
│   ├── openai.ts             # AI financial advice
│   ├── financial-services.ts # Mercury/Wave data fetching
│   ├── charge-automation.ts  # Recurring charge analysis
│   ├── stripe.ts             # Stripe client
│   ├── wave-api.ts           # Wave GraphQL client
│   ├── github.ts             # GitHub API
│   ├── oauth-state.ts        # CSRF-safe OAuth state tokens
│   └── integration-validation.ts
├── db/
│   ├── connection.ts         # Single DB connection (replaces db.ts + bootstrap.ts)
│   └── schema.ts             # Re-export from database/system.schema.ts
└── agents/
    └── agent.ts              # ChittyAgent Durable Object (existing)
```

### Middleware Chain

```
Request
  → errorHandler()        # Catches thrown errors, returns JSON
  → cors()                # CORS for app.command.chitty.cc + localhost
  → logger()              # Request logging
  → authMiddleware()      # Verify Bearer token (service token or JWT)
  → tenantMiddleware()    # Resolve tenant from X-Tenant-ID header
  → Route handler
```

Public routes (health, webhooks, OAuth callbacks) skip auth/tenant middleware via Hono's route grouping.

### Database Connection (Consolidated)

Replace both `server/db.ts` and `server/bootstrap.ts` with a single `server/db/connection.ts`:

```typescript
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../../database/system.schema';

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}
```

This uses the Neon HTTP driver which works natively in Cloudflare Workers (no WebSocket, no pg Pool).

### SystemStorage Implementation

The critical work: implement every stub method in `server/storage/system.ts` with real Drizzle queries against `database/system.schema.ts`.

Key patterns:
- All queries scoped by `tenantId` (from middleware context)
- UUIDs for all IDs (schema already uses them)
- Decimal handling for monetary amounts
- Proper error propagation (no silent swallowing)

Example:
```typescript
async getAccounts(tenantId: string): Promise<Account[]> {
  return this.db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.tenantId, tenantId))
    .orderBy(desc(schema.accounts.updatedAt));
}
```

### Consumer Contract (ChittyCommand)

ChittyCommand's `financeClient()` calls these endpoints — they MUST work:

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/api/accounts` | GET | `FinanceAccount[]` |
| `/api/accounts/:id/transactions` | GET | `FinanceTransaction[]` (with `?since=` filter) |
| `/api/summary` | GET | `{ total_cash, total_owed, net }` |

These are the minimum viable endpoints. All other routes are secondary.

### Auth: ChittyCommand→ChittyFinance

Currently zero auth. Fix:

1. ChittyCommand sends `Authorization: Bearer {CHITTY_AUTH_SERVICE_TOKEN}` on all financeClient requests
2. ChittyFinance validates with simple token comparison (Phase 1)
3. Later: upgrade to JWT/JWKS verification via `jose` (Phase 2+)

## Phasing

### Phase 1: Hono Scaffold + Core API (Priority)

**Goal:** finance.chitty.cc serves real data for ChittyCommand

**Files:**
- `server/app.ts` — Hono app with middleware
- `server/env.ts` — Env type
- `server/worker.ts` — Rewrite as thin Hono handler
- `server/db/connection.ts` — Consolidated Neon HTTP connection
- `server/middleware/auth.ts` — Service token auth
- `server/middleware/tenant.ts` — Tenant resolution
- `server/middleware/error.ts` — Error handler
- `server/routes/health.ts` — Health/status/metrics
- `server/routes/accounts.ts` — GET /api/accounts
- `server/routes/transactions.ts` — GET /api/accounts/:id/transactions
- `server/routes/summary.ts` — GET /api/summary
- `server/storage/system.ts` — Implement account/transaction/summary queries

**Wrangler:**
- Provision real KV namespace (`FINANCE_KV`)
- Set `DATABASE_URL` secret
- Set `CHITTY_AUTH_SERVICE_TOKEN` secret
- Deploy and verify consumer contract with ChittyCommand

### Phase 2: Full Route Migration

**Goal:** All 60+ Express routes ported to Hono

**Route groups** (in priority order):
1. Session + financial summary
2. Integrations CRUD
3. Mercury (via ChittyConnect proxy)
4. Wave OAuth flow
5. Stripe checkout + webhooks
6. Tasks
7. AI advice
8. Recurring charges
9. Properties + tenants
10. GitHub

**Each group:** Create `server/routes/{group}.ts`, implement storage methods needed, add to route barrel.

### Phase 3: Mercury Direct Client (ChittyCommand side)

Per approved design `2026-02-23-mercury-live-data-design.md`:

- Add `mercuryClient(token)` to ChittyCommand's `integrations.ts`
- Add Mercury bridge routes to ChittyCommand
- Add Mercury sync steps to ChittyCommand cron
- Token management via KV + ChittyConnect refresh

This is ChittyCommand work, not ChittyFinance. Runs in parallel with Phase 2.

### Phase 4: ChittyLedger-Finance (Future)

**Not in initial build.** Architecture prepared with:

- Table naming conventions compatible with future `financial_documents`, `financial_facts`, `transaction_links` tables
- Schema extensibility via Drizzle migrations
- Webhook infrastructure for cross-service events
- Trust tier concept documented for later implementation

**Integration point:** When ready, add new Drizzle schema tables + storage methods + routes. The Hono middleware chain, auth, and tenant scoping all apply without changes.

## Credential Map

All secrets via 1Password → ChittyConnect → env/KV:

| Secret | 1Password Ref | Used By |
|--------|---------------|---------|
| `DATABASE_URL` | `op://ChittyVault/neon-chittyfinance/url` | DB connection |
| `CHITTY_AUTH_SERVICE_TOKEN` | `op://ChittyVault/chittyfinance-service-token/token` | Service auth |
| `OPENAI_API_KEY` | `op://ChittyVault/openai/api-key` | AI advice |
| `STRIPE_SECRET_KEY` | `op://ChittyVault/stripe/secret-key` | Payments |
| `STRIPE_WEBHOOK_SECRET` | `op://ChittyVault/stripe/webhook-secret` | Webhook verification |
| `WAVE_CLIENT_ID` | `op://ChittyVault/wave/client-id` | Wave OAuth |
| `WAVE_CLIENT_SECRET` | `op://ChittyVault/wave/client-secret` | Wave OAuth |
| `OAUTH_STATE_SECRET` | `op://ChittyVault/chittyfinance/oauth-state-secret` | CSRF protection |
| `GITHUB_TOKEN` | `op://ChittyVault/github/token` | GitHub API |
| `MERCURY_WEBHOOK_SECRET` | `op://ChittyVault/mercury/webhook-secret` | Webhook HMAC |

**Env var standardization:** All references to `CHITTYCONNECT_API_TOKEN` and `CHITTY_CONNECT_SERVICE_TOKEN` renamed to `CHITTY_AUTH_SERVICE_TOKEN`.

## Canonical Compliance

- **Tier:** 3 (Service Layer) per CHARTER.md
- **Canonical URI:** `chittycanon://core/services/chittyfinance`
- **Domain:** `finance.chitty.cc`
- **Source:** `@canon: chittycanon://gov/governance#core-types` where entity types referenced

## Error Handling

- Hono's `onError` handler catches all thrown errors → JSON `{ error, status }`
- Storage methods throw typed errors (not silent returns)
- Integration failures (Mercury, Wave, Stripe) logged + return partial data where possible
- Webhook endpoints return 200 quickly, process async where possible

## Files Modified Summary

| File | Change |
|------|--------|
| `server/worker.ts` | Rewrite: thin Hono handler |
| `server/app.ts` | NEW: Hono app factory |
| `server/env.ts` | NEW: Env type definition |
| `server/db/connection.ts` | NEW: Consolidated Neon HTTP driver (replaces db.ts + bootstrap.ts) |
| `server/middleware/auth.ts` | Rewrite: service token + jose JWT |
| `server/middleware/tenant.ts` | Port to Hono context |
| `server/middleware/error.ts` | NEW: Global error handler |
| `server/routes/*.ts` | NEW: 15+ route files (split from monolithic routes.ts) |
| `server/storage/system.ts` | IMPLEMENT: All stub methods with real Drizzle queries |
| `server/storage/index.ts` | Update: mode-aware factory |
| `deploy/system-wrangler.toml` | Update: real KV/R2 IDs, secrets |
| `package.json` | Add: hono, jose, @neondatabase/serverless |

## No Changes Needed

- `database/system.schema.ts` — existing schema sufficient for Phase 1-3
- `server/agents/agent.ts` — ChittyAgent DO unchanged
- `client/` — Frontend unchanged (API contract preserved)
- ChittyCommand consumer contract — endpoints match existing `financeClient()` expectations
