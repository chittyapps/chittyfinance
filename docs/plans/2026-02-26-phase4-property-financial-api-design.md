# Phase 4: Property Financial API Design

**Date**: 2026-02-26
**Project**: ChittyFinance
**Canonical URI**: `chittycanon://core/services/chittyfinance/phase4`

---

## Context

ChittyFinance is the financial data backend for the ChittyOS ecosystem. The furnished-condos org already has **ChittyRental** (property operations platform with DoorLoop/Wave/Mercury/OpenPhone integrations, tenant CRM, assets, leads, compliance) and **ChiCo** (guest concierge). ChittyRental consumes ChittyFinance for financial data, similar to how ChittyCommand consumes it for dashboard data.

**Current active property management stack**: TurboTenant + REI Accounting + Wave Accounting (DoorLoop was historical, ended Dec 2025).

**Goal**: Make ChittyFinance the authoritative source for property financial data — rent roll, property P&L, NOI, valuations — consumable by ChittyRental and ChittyCommand.

---

## Scope & Boundaries

### ChittyFinance owns (financial domain)
- Property financial summaries (NOI, cap rate, cash-on-cash return)
- Rent roll as financial data (expected vs actual income per unit)
- Property P&L statements (income vs expenses by REI chart of accounts)
- Property valuation analysis (multi-source AVM aggregation)
- TurboTenant/Wave data import (financial transactions)
- REI chart of accounts mapping (`database/chart-of-accounts.ts`)

### ChittyFinance does NOT own (ChittyRental's domain)
- Tenant CRM (leads, applications, screening)
- Maintenance request workflows
- Guest communications (ChiCo)
- Marketing/listings (furnished-condos.com)
- Asset inventory tracking (ChittyAssets/ChittyProperty)
- Lease document generation (lease-agent/lease-wiz)

---

## Architecture

### New API Endpoints

**Property CRUD** (mutations for ChittyRental to call):
- `POST /api/properties` — create property
- `PATCH /api/properties/:id` — update property
- `POST /api/properties/:id/units` — create unit
- `PATCH /api/properties/:id/units/:unitId` — update unit
- `POST /api/properties/:id/leases` — create lease (financial contract)
- `PATCH /api/properties/:id/leases/:leaseId` — update lease

**Property Financial Endpoints** (read-heavy, consumed by ChittyRental + ChittyCommand):
- `GET /api/properties/:id/financials` — NOI, cap rate, cash-on-cash, occupancy
- `GET /api/properties/:id/rent-roll` — unit-level rent roll with payment status
- `GET /api/properties/:id/pnl?start=YYYY-MM-DD&end=YYYY-MM-DD` — property P&L by REI category
- `GET /api/properties/:id/valuation` — aggregated valuation from multiple sources

**Import Endpoints**:
- `POST /api/import/turbotenant` — import TurboTenant CSV ledger
- `POST /api/import/wave-sync` — sync Wave transactions for tenant's business

**Valuation Endpoints**:
- `GET /api/properties/:id/valuation` — current valuation with multi-source estimates
- `POST /api/properties/:id/valuation/refresh` — trigger fresh valuation fetch from providers
- `GET /api/properties/:id/valuation/history` — historical valuation timeline
- `GET /api/properties/:id/valuation/comparables` — comparable sales from providers

### Data Model

**No new tables required.** Existing schema covers it:
- `properties` — address, type, purchasePrice, currentValue, metadata (JSONB)
- `units` — unitNumber, bedrooms, bathrooms, sqft, monthlyRent
- `leases` — startDate, endDate, monthlyRent, securityDeposit, status
- `transactions` — propertyId, unitId, category, amount, date

**New: `property_valuations` table** for caching external valuation data:

```sql
property_valuations (
  id          UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  tenant_id   UUID REFERENCES tenants(id),
  source      TEXT NOT NULL,  -- 'zillow', 'redfin', 'housecanary', 'attom', 'manual'
  estimate    DECIMAL(12,2),
  low         DECIMAL(12,2),  -- confidence range low
  high        DECIMAL(12,2),  -- confidence range high
  details     JSONB,          -- provider-specific data (zestimate details, comps, etc.)
  fetched_at  TIMESTAMP,      -- when this estimate was fetched
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
)
```

### Computed Aggregations (in SystemStorage)

**Rent Roll** — computed by joining:
```
units → leases (active) → transactions (category='rent_income', current period)
```
Returns per-unit: expected rent (from lease), actual paid (sum of rent transactions), status (paid/partial/overdue), tenant name, lease end date.

**Property Financials**:
- `NOI` = sum(income transactions) - sum(expense transactions) for the property over 12 months
- `Cap Rate` = NOI / property.currentValue
- `Cash-on-Cash` = NOI / property.purchasePrice
- `Occupancy Rate` = units with active lease / total units

**Property P&L** — transactions grouped by REI chart of accounts category:
- Income: rent (4000), late fees (4010), pet fees (4020), parking (4030), etc.
- Expenses: mortgage (5000-series), insurance (5100), taxes (5200), repairs (5300), utilities (5400), etc.
- Net = income - expenses

---

## Valuation Integration

### Provider Strategy

Scrape/API integration with mainstream property valuation services. The ValuationConsole aggregates estimates from multiple sources and presents a weighted average with confidence ranges.

| Provider | Integration Method | Data Available | Priority |
|----------|-------------------|----------------|----------|
| **Zillow** | Zestimate API or scrape | AVM, Zestimate range, rent estimate, tax assessment | P0 — most recognized |
| **Redfin** | Data center CSV + scrape | Redfin Estimate, comparable sales, market trends | P0 — strong estimate |
| **Realtor.com** | Scrape | Estimate range, nearby sales | P1 |
| **HouseCanary** | REST API | AVM, 36-mo forecast, 75+ data points, rental estimates | P1 — best for investors |
| **ATTOM** | REST API | Tax assessments, sales history, 9K+ fields | P2 — deep data |
| **Estated** | JSON API | Parcel data, AVM, tax data | P2 — free tier |
| **County Assessor** | Scrape (Cook County for Chicago properties) | Tax assessed value, pin lookup | P1 — ground truth |

### ValuationConsole Generalization

The existing `ValuationConsole.tsx` is hardcoded to 550 W Surf #504. Generalize to:
- Route: `/valuation/:propertyId` (dynamic, any property)
- Fetch property data + cached valuations from API
- Display multi-source estimate comparison (Zillow vs Redfin vs HouseCanary vs manual)
- Weighted average with confidence band
- Comparable sales from API providers
- NOI-based valuation (cap rate method) from ChittyFinance's own financial data
- Scenario modeling (rate changes, occupancy, rent growth)
- Save finalized valuation snapshots to `property_valuations` table

### Valuation Refresh Flow

```
POST /api/properties/:id/valuation/refresh
  → For each configured provider:
    → Fetch current estimate (API call or scrape)
    → Store in property_valuations table
    → Return aggregated result
```

Cached valuations are served from DB. Refresh is triggered manually or on a schedule (e.g., weekly). Each provider has its own fetch adapter in `server/lib/valuation/`.

---

## Import Pipeline

### TurboTenant Import (`POST /api/import/turbotenant`)

1. Accept CSV body (the Google Sheets ledger format)
2. Parse rows into `TurboTenantTransaction` objects
3. Map to REI chart of accounts using `database/chart-of-accounts.ts`
4. Match to property/unit via property code or name pattern
5. Create transactions in DB, linked to correct property and tenant
6. Idempotent: hash(date + amount + description) — skip existing

Reuses logic from existing `scripts/sync-turbotenant-wave.ts` and `scripts/import-turbotenant.ts`.

### Wave Sync (`POST /api/import/wave-sync`)

1. Read stored OAuth tokens from integrations table
2. Use WaveAPIClient to fetch transactions for date range
3. Map Wave account names → REI chart of accounts
4. Link to properties via Wave account metadata or name matching
5. Upsert transactions

Reuses logic from `scripts/sync-turbotenant-wave.ts` (Wave account mapping).

---

## Key Files

| File | Action |
|------|--------|
| `database/system.schema.ts` | Add `propertyValuations` table |
| `server/storage/system.ts` | Add property CRUD, rent roll, financials, P&L methods |
| `server/routes/properties.ts` | Add mutation endpoints + financial endpoints |
| `server/routes/valuation.ts` | New — valuation endpoints + provider refresh |
| `server/routes/import.ts` | New — TurboTenant + Wave import endpoints |
| `server/lib/valuation/` | New directory — provider adapters (zillow, redfin, housecanary, attom) |
| `server/lib/valuation/index.ts` | Aggregation logic, weighted average, confidence bands |
| `server/db/schema.ts` | Re-export new valuation table |
| `server/app.ts` | Wire new routes |
| `client/src/pages/ValuationConsole.tsx` | Generalize to any property |
| `CLAUDE.md` | Update with Phase 4 docs |

---

## Success Criteria

1. `GET /api/properties/:id/rent-roll` returns real rent roll data from imported TurboTenant/Wave transactions
2. `GET /api/properties/:id/financials` returns NOI, cap rate, occupancy for ARIBIA properties
3. `GET /api/properties/:id/valuation` returns aggregated estimates from at least Zillow + Redfin
4. ValuationConsole works for any property in the system, not just hardcoded
5. ChittyRental can consume all property financial endpoints with service token auth

---

## References

- [Zillow Zestimate API](https://www.zillowgroup.com/developers/api/zestimate/zestimates-api/)
- [Redfin Data Center](https://www.redfin.com/news/data-center/)
- [HouseCanary API](https://www.housecanary.com/products/data-explorer)
- [ATTOM Data API](https://batchdata.io/blog/real-estate-apis-pricing-data)
- [Best Property Evaluation APIs 2026](https://homesage.ai/8-best-property-evaluation-apis-in-2026/)
- [Best Real Estate APIs 2026](https://www.scrapingbee.com/blog/best-real-estate-apis-for-developers/)
