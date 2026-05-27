# Mercury Multitenant Model

> How Mercury bank data flows through ChittyFinance with tenant + Legal Person isolation.

## Requirements (non-negotiable)

1. **`tenant_id` required on every Mercury-derived record.** No row, webhook event, or queue message lacks it. Cross-tenant reads are server-side blocked, not client-trusted.
2. **Legal Person ChittyID binding required.** Every Mercury account maps to exactly one Legal Person (`P-Legal` entity), recorded as `legal_person_chittyid` on the account row. Account ↔ Legal Person is many-to-one (one LLC can have many accounts).
3. **Wave business mapping required.** Each `(tenant_id, legal_person_chittyid)` pair has at most one Wave business; the mapping lives in `integration_account_links` (source = `wave`, target = `mercury`). Unmapped Mercury accounts produce reconciliation conflicts, not silent omission.
4. **ChittyBooks reconciles over Mercury + Wave + Stripe** by reading ChittyFinance's reconciliation views. ChittyBooks never reaches into Mercury directly.

## Identity model

```
Person (P-Legal, e.g. "IT CAN BE LLC")
   │  legal_person_chittyid
   └── Account (Mercury account #1, #2, ...)
          │  tenant_id
          └── Transaction (mercury txn rows)
                 │  metadata.mercury_kind, mercury_id
                 └── Allocation → Property/Lease (Business surface)
```

- **Business / Legalink separation**: business operations (property, lease, allocation) live on the Business surface; the Legal Person binding lives on the Authority/Person surface. They join through `legal_person_chittyid`, not by sharing schemas.

## Data sources

| Source | Path | Tenant binding |
|---|---|---|
| Mercury read API | `https://api.mercury.com/api/v1` (direct, OAuth tokens scoped per tenant) | Token issued per `(tenant_id, legal_person_chittyid)` via ChittyConnect |
| Mercury write API | `mercury-proxy` on `chittyserv-dev` (IP-allowlisted by Mercury) | `X-Mercury-Token` per request; proxy is stateless re tenancy |
| Mercury webhooks | `/api/webhooks/mercury` on `finance.chitty.cc` | Per-business HMAC secret, resolves to `tenant_id` + `legal_person_chittyid` before write |

The write proxy at `CHITTYOS/mercury-proxy` is **not** a tenant boundary — it is a network egress shim. Tenancy is enforced by the caller (ChittyFinance) before reaching it.

## Reconciliation surface

ChittyBooks consumes these ChittyFinance endpoints, not raw Mercury:

- `GET /api/transactions?source=mercury` — Mercury txns scoped to caller's tenant
- `GET /api/transactions?source=wave` — Wave txns scoped to caller's tenant
- `GET /api/transactions?source=stripe` — Stripe charges scoped to caller's tenant
- `GET /api/reports/reconciliation?tenant_id=...&period=...` — three-way diff (Mercury ↔ Wave ↔ Stripe)
- `GET /api/integrations/status` — per-source connection health + last-sync timestamps

Conflicts surface as `reconciliation_conflicts` in ChittyLedger-Finance (see `docs/chittyledger-finance-design.md`).

## What is explicitly out of scope

- ChittyBooks may **not** call Mercury directly.
- ChittyBooks may **not** create Wave invoices/sales directly — those route through ChittyFinance.
- Credential rotation is owned by ChittyConnect concierge. ChittyBooks never sees a Mercury or Wave token.

## Adversarial findings (2026-05-27 verification)

**CRITICAL — schema gap.** `legal_person_chittyid` column is **NOT present** on `accounts` in `database/system.schema.ts` (verified at lines 101-103; only `id`, `tenantId`, and downstream columns exist). The Legal Person binding is therefore not enforceable at the database level today. Two remediation paths:

- **Path A (schema migration)** — add `legal_person_chittyid TEXT NOT NULL` to `accounts` with a backfill plan. Coordinated cutover required (no migrations in this repo per CLAUDE.md "Schema Changes"; `drizzle-kit push` is destructive).
- **Path B (interim metadata)** — store the binding in `accounts.metadata->>'legal_person_chittyid'` until Path A is ready. Adds a runtime check at the storage layer.

Until one of these lands, the Mercury multitenant contract is **partially enforced** (tenant_id yes, legal_person no). Reconciliation reports MUST flag this in their output until the gap closes.

**Verified OK.** `tenant_id` is `NOT NULL` on `accounts`, `transactions`, `properties`, `integrations` (`database/system.schema.ts`), so any insert missing `tenantId` fails at the database. The 18 inserts in `server/storage/system.ts` rely on the caller's `data` containing `tenantId`; the schema constraint provides defense-in-depth. No write path can bypass it.

## Deploy gates

- [ ] **BLOCKER**: `legal_person_chittyid` column or metadata interim must exist before reconciliation reports reference it. Until then, the column is contract-only.
- [ ] `legal_person_chittyid` column present on `accounts` (verify in `database/system.schema.ts` before reconciliation reports go live).
- [ ] Per-business Mercury webhook secret in place (already shipped — PR #113).
- [ ] No code path can write a Mercury-derived row with `tenant_id = NULL`. Enforce at the SystemStorage layer, not at the route layer.
