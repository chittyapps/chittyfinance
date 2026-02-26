# Property Portfolio Hub Design

**Date**: 2026-02-26
**Status**: Approved
**Scope**: Frontend enhancement — Property Portfolio UI with investor overview + manager operations views

## Problem

ChittyFinance has a complete property management backend (10 endpoints, 86 tests, 5 valuation sources) but the frontend is minimal: a basic property list page and a hardcoded ValuationConsole for a single address. There's no way to get a portfolio-level view, manage operations across properties, or drill into individual property financials.

## Decision

**Approach A: Portfolio Hub** — A two-tab layout (Portfolio + Operations) with a detail page per property. The existing ValuationConsole is generalized and absorbed into the detail page.

## Routing

```
/properties              -> Portfolio Hub (tabs: Portfolio | Operations)
/properties/:id          -> Property Detail (tabs: Overview | Rent Roll | P&L | Valuation)
```

**Removed**: `/valuation/550-w-surf-504` (hardcoded route replaced by `/properties/:id` valuation tab)

## Components

### New Files
- `client/src/pages/Properties.tsx` — rewritten as Portfolio Hub
- `client/src/pages/PropertyDetail.tsx` — new detail page
- `client/src/components/property/PortfolioSummary.tsx` — KPI strip
- `client/src/components/property/PropertyCard.tsx` — extracted + enhanced
- `client/src/components/property/OpsView.tsx` — operations tab
- `client/src/components/property/RentRollTable.tsx` — rent roll display
- `client/src/components/property/PnLReport.tsx` — P&L with date picker
- `client/src/components/property/ValuationTab.tsx` — generalized from ValuationConsole
- `client/src/hooks/use-property.ts` — query + mutation hooks

### Modified Files
- `client/src/App.tsx` — update routes, remove hardcoded valuation route
- `client/src/pages/ValuationConsole.tsx` — delete (absorbed into ValuationTab)

## Portfolio Tab

### KPI Strip (PortfolioSummary)

4 metric cards using the existing `cf-metric` pattern:

| Metric | Calculation |
|--------|-------------|
| Total Portfolio Value | Sum of `currentValue` across active properties |
| Weighted Avg Cap Rate | Each property's cap rate weighted by value |
| Portfolio NOI | Sum of each property's NOI from `/financials` |
| Avg Occupancy | Weighted by unit count per property |

### Property Cards Grid

Responsive grid (1 col mobile, 2 col tablet, 3 col desktop). Each card:
- Property name, address, type badge (condo/apartment/house/commercial)
- Current value (prominent) + purchase price (muted)
- Mini metrics row: NOI | Cap Rate | Occupancy %
- Unit count + lease status indicator (green/amber/red dot)
- "View Details" button -> `/properties/:id`

Sort dropdown: by value, cap rate, occupancy, name.
Empty state: "No properties yet" with "Add Property" CTA button.

## Operations Tab

### Cross-Property Rent Roll Table

Columns: Property | Unit | Tenant | Expected | Paid | Status | Lease Ends

Status color coding:
- Green: paid (actual >= expected)
- Amber: partial (0 < actual < expected)
- Red: overdue (actual = 0 with active lease)
- Gray: vacant (no active lease)

### Lease Expiration Timeline

Sorted list of leases expiring within 90 days. Urgency levels:
- Red: expires within 30 days
- Amber: expires within 60 days
- Yellow: expires within 90 days

## Property Detail Page

**Route**: `/properties/:id`

**Header**: Property name, address, type badge, active status, Edit button.

### Sub-tabs

**Overview**: Financial summary card (NOI, cap rate, cash-on-cash, occupancy) + units list showing each unit's lease status, tenant name, monthly rent.

**Rent Roll**: Full rent roll table from `/api/properties/:id/rent-roll`. Per-unit payment status with expected vs actual amounts.

**P&L**: Date-range picker (defaults to current year) + income/expense breakdown from `/api/properties/:id/pnl`. Bar chart visualization using existing chart.tsx component.

**Valuation**: Generalized from current ValuationConsole. Fetches real data from `/api/properties/:id/valuation` and `/valuation/history`. Retains sensitivity analysis (rate shock, inventory, seasonality sliders), comps editing, and scenario modeling. Stores user overrides in localStorage keyed by property ID.

### Mutations

- Edit property: PATCH `/api/properties/:id`
- Add unit: POST `/api/properties/:id/units`
- Edit unit: PATCH `/api/properties/:id/units/:unitId`
- Add lease: POST `/api/properties/:id/leases`
- Edit lease: PATCH `/api/properties/:id/leases/:leaseId`

All mutations use shadcn Dialog modals with form validation.

## Data Hooks

```typescript
// Query hooks (new file: use-property.ts)
useProperties(tenantId)           // GET /api/properties
useProperty(id)                   // GET /api/properties/:id
usePropertyFinancials(id)         // GET /api/properties/:id/financials
usePropertyRentRoll(id)           // GET /api/properties/:id/rent-roll
usePropertyPnL(id, start, end)   // GET /api/properties/:id/pnl
usePropertyValuation(id)          // GET /api/properties/:id/valuation
usePropertyValuationHistory(id)   // GET /api/properties/:id/valuation/history

// Mutation hooks
useCreateProperty()               // POST /api/properties
useUpdateProperty(id)             // PATCH /api/properties/:id
useCreateUnit(propertyId)         // POST /api/properties/:id/units
useUpdateUnit(propertyId, unitId) // PATCH /api/properties/:id/units/:unitId
useCreateLease(propertyId)        // POST /api/properties/:id/leases
useUpdateLease(propertyId, id)    // PATCH /api/properties/:id/leases/:leaseId
```

## Technical Decisions

- **No new backend work**: All 10+ property endpoints exist and are tested (86/86 passing)
- **Styling**: Follow `cf-*` theme system + shadcn/ui. No inline styles
- **Charts**: Use existing `chart.tsx` (recharts via shadcn) for P&L bar charts
- **Animation**: Match Dashboard stagger + fadeUp patterns (Framer Motion)
- **State**: TanStack Query for server state, localStorage for valuation overrides only
- **Tenant awareness**: All queries use `useTenantId()` hook for scoping

## Out of Scope

- Property photo/document upload
- Maintenance request tracking
- Tenant entity management (beyond lease contact info)
- Cash flow projections / forecasting
- Multi-currency support
- PDF export of reports
