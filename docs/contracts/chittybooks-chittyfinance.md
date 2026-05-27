# ChittyBooks ↔ ChittyFinance Contract

> Engine / UI boundary. Not canon yet — proposal for the pentad.

## Status (verified 2026-05-27)

| Surface | Repo | Deploy | Health |
|---|---|---|---|
| ChittyFinance (engine) | `CHITTYAPPS/chittyfinance` | Hono on CF Workers at `finance.chitty.cc` | `200 ok` |
| ChittyBooks (UI/app) | `CHITTYAPPS/chittybooks` | Python Flask, `main.py`, Dockerfile, `.replit` → `cloudrun` | **Not deployed**. `chittybooks.chitty.cc` and `books.chitty.cc` do not resolve. |
| ChittyLedger (substrate) | `CHITTYFOUNDATION/chittyledger` | Worker at `ledger.chitty.cc` | `200 ok` |
| ChittyLedger (legacy fork) | `CHITTYOS/chittybooks` | Express + React, in-memory, not deployed | n/a — DUPLICATE, candidate for retirement or repurpose as ChittyLedger-Evidence seed |

`CHITTYAPPS/chittybooks/CHARTER.md` claims a Cloudflare Worker at `chittybooks.chitty.cc`. The repository is a Python Flask application with `deploymentTarget = "cloudrun"`. Charter and code disagree.

## Boundary

- **ChittyFinance is the finance engine.** It owns: tenants, properties, accounts, transactions, allocations, classification (COA L0–L4), reports, valuation, AI summarization, OAuth connectors (Wave, Stripe, Google, Mercury via proxy), and webhooks. It writes evidence-grade entries to ChittyLedger.
- **ChittyBooks is a bookkeeping UI/app.** It does **not** own bookkeeping records. It is a thin surface that reads ChittyFinance and (where applicable) ChittyLedger-Finance projections.
- **ChittyLedger is the substrate.** ChittyLedger-Finance and ChittyLedger-Evidence are projections of it. See `docs/chittyledger-finance-design.md` for the canonical projection design.

## Source of Truth (no competing writers)

| Resource | Writer | Reader |
|---|---|---|
| `tenants`, `properties`, `accounts`, `transactions`, `allocations`, `classifications` | ChittyFinance | ChittyBooks (read-only), ChittyCommand, exports |
| `financial_documents`, `financial_facts`, `reconciliation_conflicts` | ChittyLedger-Finance (via ChittyTrace ingest) | ChittyFinance, ChittyBooks |
| Mercury/Wave/Stripe/Plaid raw events | external | ChittyFinance webhooks |

ChittyBooks MUST NOT write transactions, allocations, or COA classifications directly. All mutations route to ChittyFinance.

## API Surface ChittyBooks consumes

All paths are under `https://finance.chitty.cc`. Auth: ChittyAuth Bearer token. Tenant: `X-Tenant-ID` header (server-side enforces from JWT claims; path param is not trusted).

| Path (verified mounted) | Purpose for ChittyBooks |
|---|---|
| `/api/tenants` | List tenants the caller can read |
| `/api/properties` | Property list |
| `/api/accounts` | Account list + balances |
| `/api/transactions` | Transaction feed (filter by date, account, tenant) |
| `/api/allocations` | Allocation rules + history |
| `/api/classification` | COA assignments + audit trail |
| `/api/reports/*` | Pre-aggregated bookkeeping views |
| `/api/integrations/status` | Which connectors are configured |
| `/api/v1/documentation` | OpenAPI 3.0 spec (note: only the docs route is under `/api/v1`; data routes are under `/api`. See `docs/proposals/api-v1-prefix-fix.md`.) |

## ChittyLedger projection paths (read-only)

ChittyBooks reads ChittyLedger-Finance projection tables via `ChittyFinance` aggregator endpoints — it does not query ChittyLedger directly. This preserves the substrate boundary: ChittyLedger does not know about ChittyBooks.

## Deploy decision (DECISION, 2026-05-27)

**Chosen: retire `chittybooks.chitty.cc` as a separate deployable. ChittyBooks becomes a UI surface served by ChittyFinance.**

Proof from repo files (no inference):

| Evidence | Source | What it proves |
|---|---|---|
| Repo is Python Flask, not Worker | `CHITTYAPPS/chittybooks/main.py` (43 KB), `Dockerfile`, `pyproject.toml`, `wsgi.py` | Charter ↔ code mismatch |
| Replit config targets Cloud Run, not CF | `CHITTYAPPS/chittybooks/.replit` lines `deploymentTarget = "cloudrun"` and `[[ports]] localPort = 5000 externalPort = 80` | Never built as a Worker |
| No `wrangler.toml`/`wrangler.jsonc` in repo | `find CHITTYAPPS/chittybooks -maxdepth 2 -name 'wrangler*'` returns empty | No CF deploy path exists |
| No DNS for the claimed domain | `dig chittybooks.chitty.cc` and `dig books.chitty.cc` → NXDOMAIN (verified via `curl: Could not resolve host`) | Charter URL is aspirational |
| Bookkeeping engine already complete in ChittyFinance | `CHITTYAPPS/chittyfinance/server/routes/{allocations,classification,reports,tax,portfolio,charges}.ts` | No engine gap requires a second service |
| Per-tenant `tenantId NOT NULL` at schema | `database/system.schema.ts:103` | Multi-tenant boundary is in ChittyFinance, not in ChittyBooks |

Options NOT chosen:
- **Option A (Cloud Run container)** — would resurrect the Python skeleton against a duplicate of ChittyFinance's bookkeeping engine. Creates competing source of truth. Rejected.
- **Option B (Worker rewrite)** — same competition problem plus weeks of rewrite work. Rejected.

## Followup actions (require user approval before merge)

1. `CHITTYAPPS/chittybooks/CHARTER.md` — change "Cloudflare Worker at chittybooks.chitty.cc" to "UI surface served by ChittyFinance. No standalone deploy."
2. `CHITTYAPPS/chittybooks/CHITTY.md` — same correction.
3. Archive `CHITTYAPPS/chittybooks` repo or convert to a `client/` package in `CHITTYAPPS/chittyfinance`. (Org-owner action.)
4. Remove `CHITTYBOOKS_URL` env reference from `CHITTYOS/chittycommand` (see `docs/proposals/ch1tty-connector-revision.md`).

## Deploy gates

- [ ] PR approval before any `chittybooks.chitty.cc` DNS or Worker creation.
- [ ] CHARTER.md in `CHITTYAPPS/chittybooks` must be reconciled with whichever option is chosen (currently aspirational).
- [ ] `CHITTYOS/chittybooks` legacy fork is renamed, archived, or repurposed as ChittyLedger-Evidence — do not let it shadow the canonical surface.
