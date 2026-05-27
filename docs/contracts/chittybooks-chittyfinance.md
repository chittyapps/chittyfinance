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

## Deploy decision (2026-05-27)

**Retired: the assumption that `chittybooks.chitty.cc` is a live API.** The domain does not resolve and no Worker exists. Code paths that target it MUST be disabled or guarded (see `docs/proposals/ch1tty-connector-revision.md`).

**Not yet decided: the actual ChittyBooks deploy path.** That decision is an explicit operator gate. Until the operator chooses container / worker-port / merged-into-finance, ChittyBooks stays as repo-only — a candidate UI/workflow surface, not a runtime.

Proof from repo files for the fake-domain retirement (no inference):

| Evidence | Source | What it proves |
|---|---|---|
| Repo is Python Flask, not Worker | `CHITTYAPPS/chittybooks/main.py` (43 KB), `Dockerfile`, `pyproject.toml`, `wsgi.py` | Charter ↔ code mismatch |
| Replit config targets Cloud Run, not CF | `CHITTYAPPS/chittybooks/.replit` lines `deploymentTarget = "cloudrun"` and `[[ports]] localPort = 5000 externalPort = 80` | Never built as a Worker |
| No `wrangler.toml`/`wrangler.jsonc` in repo | `find CHITTYAPPS/chittybooks -maxdepth 2 -name 'wrangler*'` returns empty | No CF deploy path exists |
| No DNS for the claimed domain | `dig chittybooks.chitty.cc` and `dig books.chitty.cc` → NXDOMAIN (verified via `curl: Could not resolve host`) | Charter URL is aspirational |
| Bookkeeping engine already complete in ChittyFinance | `CHITTYAPPS/chittyfinance/server/routes/{allocations,classification,reports,tax,portfolio,charges}.ts` | No engine gap requires a second service |
| Per-tenant `tenantId NOT NULL` at schema | `database/system.schema.ts:103` | Multi-tenant boundary is in ChittyFinance, not in ChittyBooks |

Options preserved for the operator (deploy gate — not decided here):
- **Option A — Cloud Run container.** Matches existing `.replit` config. Justification gap: ChittyFinance already owns bookkeeping engine; risk of competing source of truth.
- **Option B — Worker rewrite.** Same competition risk + significant rewrite cost.
- **Option C — Merged UI surface served by ChittyFinance.** Lowest cost, no new runtime. Default if no operator decision is made.

## Followup actions (operator-gated, not auto-merged)

1. Pick A/B/C above. Each requires explicit approval.
2. Reconcile `CHITTYAPPS/chittybooks/CHARTER.md` and `CHITTY.md` once the choice is made (currently both claim a Worker at `chittybooks.chitty.cc`, which is false).
3. Patch `CHITTYOS/chittycommand` so its `booksClient` does not call the dead `CHITTYBOOKS_URL` (see `docs/proposals/ch1tty-connector-revision.md`). This is the only auto-mergeable action in this branch.

## Deploy gates

- [ ] PR approval before any `chittybooks.chitty.cc` DNS or Worker creation.
- [ ] CHARTER.md in `CHITTYAPPS/chittybooks` must be reconciled with whichever option is chosen (currently aspirational).
- [ ] `CHITTYOS/chittybooks` legacy fork is renamed, archived, or repurposed as ChittyLedger-Evidence — do not let it shadow the canonical surface.
