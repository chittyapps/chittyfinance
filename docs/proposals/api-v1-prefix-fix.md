# API path prefix — RESOLVED as non-issue

## Original report

> `https://finance.chitty.cc/api/v1/entities` → `404`. Docs imply `/api/v1/*` everywhere.

## Investigation (2026-05-27)

Two route families exist by design:

| Family | Mount | Examples | Verified |
|---|---|---|---|
| **Operational/meta** | `/api/v1/*` | `/api/v1/status`, `/api/v1/metrics`, `/api/v1/documentation` | `server/routes/health.ts:21,38`; `server/routes/docs.ts:7`. All return `200`. |
| **Resource data** | `/api/*` | `/api/accounts`, `/api/transactions`, `/api/properties`, `/api/tenants`, `/api/integrations/*`, `/api/reports/*`, etc. | `server/app.ts:74-118`; each route module under `server/routes/`. All return `401` (auth) — routes exist. |

`/api/v1/entities` returns `404` because **there is no `entities` resource**, not because of a path mismatch. The original concern came from assuming the `/api/v1` prefix applied to data routes; it does not.

## Decision: no code change

- The split (meta under `/v1`, resources unprefixed) is intentional and consistent with the OpenAPI spec at `/api/v1/documentation` which lists `paths` correctly.
- All 5 in-repo references to `/api/v1` (`.github/workflows/register.yml`, `deploy/registration/chittyfinance.registration.json`, `client/src/pages/Landing.tsx:342`, `.claude/commands/quick-deploy.md:28`, plans) point at real endpoints. **Nothing to fix.**
- All 2 cross-org consumer references (`chittycommand/src/lib/integrations.ts:249`, `chittyregistry/src/routes/notion-webhooks.ts`) target `/api/<resource>` — correct.

## Documentation patch (the only action)

Add a single sentence to `CLAUDE.md` under "Where Things Live" → routes section:

> Resource routes are mounted at `/api/<resource>` (no `/v1` prefix). Only operational/meta routes (`status`, `metrics`, `documentation`) live under `/api/v1/`. The OpenAPI spec at `/api/v1/documentation` is authoritative.

## Deploy gates

- None. No routing or worker change.
