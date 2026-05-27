# API path prefix: docs say `/api/v1`, code mounts `/api` — fix proposal

## Symptom

`https://finance.chitty.cc/api/v1/entities` → `404`.
`https://finance.chitty.cc/api/accounts` → `401` (auth working as designed).
`https://finance.chitty.cc/api/v1/documentation` → `200` (OpenAPI spec).

CLAUDE.md and CHARTER.md advertise `/api/v1/*`. Only the OpenAPI spec route uses `/api/v1`. All data routes are mounted at `/api/*`.

## Evidence

- `server/app.ts:74-118` — every `app.route('/', xxxRoutes)`. Each route module defines `/api/<resource>` internally (no `/v1` segment).
- `server/routes/docs.ts:7` — `docRoutes.get('/api/v1/documentation', ...)` — only route under `/api/v1`.
- Probe: 8/8 `/api/v1/*` data paths return 404; the 8 `/api/*` data paths return 401 (auth required, route exists).

## Two fixes, choose one

### Option 1 — Fix the docs (recommended, zero risk)

- Change `CLAUDE.md` and any service consumers (notably `CHITTYOS/chittycommand/src/lib/integrations.ts:230` `financeClient`) to point at `/api/*`, not `/api/v1/*`.
- Keep `/api/v1/documentation` as-is (it is the OpenAPI alias, harmless).
- Update OpenAPI `servers[0].url` if downstream tooling expects `/api/v1` — it currently emits `https://finance.chitty.cc` with paths starting `/api/`, which is consistent. **Verify before committing.**
- Estimated diff: 1 markdown line per consumer + audit.

### Option 2 — Rename routes to `/api/v1/*` (breaking)

- Add `const apiV1 = new Hono().basePath('/api/v1');` and remount under it.
- Touches every route file (~30 files).
- Breaks every existing consumer simultaneously. Requires coordinated cutover with ChittyCommand, ChittyBooks (when it ships), and any external integrators.
- Estimated diff: ~30 files + migration plan.

## Recommendation

Option 1. There is no benefit to `/v1` versioning until a v2 is on the horizon, and we are not designing one. The current `/api/<resource>` shape is already the de facto contract.

## Deploy gate

- [ ] Approval before any route remount.
- [ ] If Option 1: search every CHITTYOS/CHITTYFOUNDATION/CHITTYAPPS repo for `finance.chitty.cc/api/v1` and confirm zero consumers depend on it. Verified consumers today: ChittyCommand uses `financeClient` — must check path it calls.
