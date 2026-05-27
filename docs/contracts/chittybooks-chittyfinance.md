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

## Deploy decision

Three options were considered. Recommendation: **Option C** — retire `chittybooks.chitty.cc` as a separate deployable; keep ChittyBooks as a UI app served from a subpath under ChittyFinance (`finance.chitty.cc/books`) or as a static SPA pointing at the ChittyFinance API. Rationale:

1. ChittyFinance already has the full bookkeeping surface (allocations, classification, COA L0-L4, reports, tax).
2. ChittyBooks repo is a stale Python skeleton (last meaningful update 2026-03-28, surface ≈ 43KB `main.py`). Rewriting as a Worker is unjustified.
3. "ChittyBooks as bookkeeping UI/app" (not engine) is the canonical position.

Option A (Cloud Run container) and Option B (Worker rewrite) remain technically possible but require justification ChittyBooks does not currently have.

## Deploy gates

- [ ] PR approval before any `chittybooks.chitty.cc` DNS or Worker creation.
- [ ] CHARTER.md in `CHITTYAPPS/chittybooks` must be reconciled with whichever option is chosen (currently aspirational).
- [ ] `CHITTYOS/chittybooks` legacy fork is renamed, archived, or repurposed as ChittyLedger-Evidence — do not let it shadow the canonical surface.
